import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useVaultStore } from "../store/useVaultStore";

// In-memory file system behind the mocked `invoke`, so these tests pin the save logic
// (which file gets which content) without Tauri.
const A = "D:/vault/A.md";
const B = "D:/vault/B.md";
const C = "D:/vault/C.md";

let files: Map<string, string>;
let writes: { path: string; content: string }[];
let failWritesTo: Set<string>;
// First read of a path blocks until its gate is released (to simulate a slow disk).
let readGates: Map<string, { promise: Promise<void>; release: () => void }>;

const addGate = (path: string) => {
  let release!: () => void;
  const promise = new Promise<void>((r) => { release = r; });
  readGates.set(path, { promise, release });
  return release;
};

const state = () => useVaultStore.getState();
const activePath = () => state().tabs[state().activeTabIndex] ?? null;
const writesTo = (path: string) => writes.filter((w) => w.path === path);

beforeEach(() => {
  vi.useFakeTimers();
  files = new Map([[A, "content A"], [B, "content B"], [C, "content C"]]);
  writes = [];
  failWritesTo = new Set();
  readGates = new Map();

  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation((async (cmd: string, args: any) => {
    switch (cmd) {
      case "read_file": {
        const gate = readGates.get(args.path);
        if (gate) {
          readGates.delete(args.path); // only the first read is slow
          await gate.promise;
        }
        if (!files.has(args.path)) throw `os error 2: ${args.path}`;
        return files.get(args.path);
      }
      case "write_file":
        if (failWritesTo.has(args.path)) throw "os error 5: access denied";
        writes.push({ path: args.path, content: args.content });
        files.set(args.path, args.content);
        return undefined;
      case "open_vault":
        return [];
      default:
        return undefined;
    }
  }) as any);

  useVaultStore.setState({
    tabs: [],
    activeTabIndex: -1,
    fileContent: "",
    loadError: null,
    saveError: null,
    isEditing: false,
    editContent: "",
    editPath: null,
    vaultPaths: [],
    vaults: [],
    confirmModal: { isOpen: false, title: "", message: "" },
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

const openAndEdit = async (path: string, text: string) => {
  await state().setActiveFile(path);
  await state().setEditing(true);
  state().updateEditContent(text);
};

describe("F-01: the edit buffer is saved to its own file", () => {
  it("switching files via safeSetFile saves the buffer to the old file, never the new one", async () => {
    await openAndEdit(A, "edited A");
    await state().safeSetFile(B);

    expect(writesTo(A)).toEqual([{ path: A, content: "edited A" }]);
    expect(writesTo(B)).toEqual([]);
    expect(files.get(B)).toBe("content B");
    expect(activePath()).toBe(B);
    expect(state().fileContent).toBe("content B");
    expect(state().isEditing).toBe(false);
    expect(state().editPath).toBeNull();
  });

  it("even if a file is opened behind the editor's back, auto-save and Done still target the edited file", async () => {
    await openAndEdit(A, "edited A");
    await state().setActiveFile(B); // bypasses safeSetFile, like the old Open File / drop paths did
    await vi.advanceTimersByTimeAsync(1000); // auto-save fires

    expect(writesTo(B)).toEqual([]);
    expect(files.get(B)).toBe("content B");
    expect(files.get(A)).toBe("edited A");
    expect(state().fileContent).toBe("content B"); // the screen still shows B

    await state().setEditing(false);
    expect(writesTo(B)).toEqual([]);
  });

  it("setEditing(true) records which file the buffer belongs to", async () => {
    await state().setActiveFile(A);
    await state().setEditing(true);
    expect(state().editPath).toBe(A);
    expect(state().editContent).toBe("content A");
  });

  it("Done without any change does not write", async () => {
    await state().setActiveFile(A);
    await state().setEditing(true);
    await state().setEditing(false);
    expect(writes).toEqual([]);
    expect(state().isEditing).toBe(false);
  });

  it("closeAllTabs saves the buffer to its file before clearing", async () => {
    await openAndEdit(A, "edited A");
    await state().closeAllTabs();
    expect(files.get(A)).toBe("edited A");
    expect(state().tabs).toEqual([]);
    expect(state().isEditing).toBe(false);
  });
});

describe("F-02: a failed read never becomes file content", () => {
  it("keeps fileContent empty, sets loadError, and refuses to edit", async () => {
    files.delete(A);
    await state().setActiveFile(A);

    expect(state().loadError).toContain("os error 2");
    expect(state().fileContent).toBe("");
    expect(state().fileContent).not.toContain("Error");

    await state().setEditing(true);
    expect(state().isEditing).toBe(false);
    expect(writes).toEqual([]);
  });

  it("Save As is blocked while the file is unreadable", async () => {
    files.delete(A);
    await state().setActiveFile(A);
    const ok = await state().saveActiveFileAs("D:/vault/copy.md");
    expect(ok).toBe(false);
    expect(writes).toEqual([]);
  });

  it("loadError clears when a readable file is opened", async () => {
    files.delete(A);
    await state().setActiveFile(A);
    await state().safeSetFile(B);
    expect(state().loadError).toBeNull();
    expect(state().fileContent).toBe("content B");
  });
});

describe("F-03: Save As in reading mode", () => {
  it("writes the displayed file, not the (empty) edit buffer", async () => {
    await state().setActiveFile(A);
    expect(state().editContent).toBe(""); // initial buffer
    const ok = await state().saveActiveFileAs("D:/vault/copy.md");

    expect(ok).toBe(true);
    expect(writesTo("D:/vault/copy.md")).toEqual([{ path: "D:/vault/copy.md", content: "content A" }]);
    expect(state().isEditing).toBe(false);
  });

  it("does not write a stale buffer from an earlier editing session", async () => {
    await openAndEdit(A, "old edit");
    await state().safeSetFile(B);
    await state().saveActiveFileAs("D:/vault/copy.md");
    expect(files.get("D:/vault/copy.md")).toBe("content B");
  });

  it("in editing mode it writes the buffer and moves the session to the new file", async () => {
    await openAndEdit(A, "edited A");
    await state().saveActiveFileAs("D:/vault/copy.md");

    expect(files.get("D:/vault/copy.md")).toBe("edited A");
    expect(state().editPath).toBe("D:/vault/copy.md");
    expect(activePath()).toBe("D:/vault/copy.md");
    expect(files.get(A)).toBe("content A"); // the original is untouched
  });
});

describe("F-05: no delayed write to a different tab", () => {
  it("a late setEditing(false) after switching tabs writes nothing", async () => {
    await openAndEdit(A, "edited A");
    expect(await state().saveActiveFile()).toBe(true); // Ctrl+S
    await state().safeSetFile(B); // user clicks another tab within 400 ms
    writes.length = 0;

    await state().setEditing(false); // the old delayed call
    expect(writes).toEqual([]);
    expect(files.get(B)).toBe("content B");
  });
});

describe("F-06: a failed write keeps the edit buffer", () => {
  it("does not switch files, keeps the buffer, and asks the user", async () => {
    await openAndEdit(A, "edited A");
    failWritesTo.add(A);
    await state().safeSetFile(B);

    expect(activePath()).toBe(A);
    expect(state().isEditing).toBe(true);
    expect(state().editContent).toBe("edited A");
    expect(state().saveError).toContain("access denied");
    expect(state().confirmModal.isOpen).toBe(true);
    expect(files.get(A)).toBe("content A");
  });

  it("Discard in the dialog continues to the target file", async () => {
    await openAndEdit(A, "edited A");
    failWritesTo.add(A);
    await state().safeSetFile(B);

    state().confirmModal.onDiscard!();
    await vi.waitFor(() => expect(activePath()).toBe(B));
    expect(state().isEditing).toBe(false);
    expect(files.get(A)).toBe("content A");
  });

  it("Retry succeeds once the file is writable again", async () => {
    await openAndEdit(A, "edited A");
    failWritesTo.add(A);
    await state().safeSetFile(B);

    failWritesTo.delete(A);
    state().confirmModal.onConfirm!();
    await vi.waitFor(() => expect(activePath()).toBe(B));
    expect(files.get(A)).toBe("edited A");
    expect(state().saveError).toBeNull();
  });

  it("closing a tab with a failing save keeps the tab and the buffer", async () => {
    await openAndEdit(A, "edited A");
    failWritesTo.add(A);
    await state().safeCloseTab(0);
    expect(state().tabs).toEqual([A]);
    expect(state().editContent).toBe("edited A");
  });
});

describe("F-07: concurrent opens and slow reads", () => {
  it("opening several files without awaiting keeps every tab and ends consistent", async () => {
    const releaseA = addGate(A);
    const pa = state().setActiveFile(A);
    const pb = state().setActiveFile(B);
    const pc = state().setActiveFile(C);
    await Promise.all([pb, pc]);
    releaseA(); // A's read finishes last
    await pa;

    expect(state().tabs).toEqual([A, B, C]);
    expect(activePath()).toBe(C);
    expect(state().fileContent).toBe("content C"); // the slow, superseded read was dropped
  });

  it("the tab index is computed when the read completes, not when it started", async () => {
    await state().setActiveFile(A);
    await state().setActiveFile(B);
    await state().setActiveFile(C);
    await state().setActiveTab(1); // B is shown, index 1
    expect(activePath()).toBe(B);

    const releaseC = addGate(C);
    const loading = state().setActiveTab(2); // slow read of C (index 2 when started)
    await state().closeTab(0); // tabs become [B, C] while the read is in flight
    releaseC();
    await loading;

    expect(state().tabs).toEqual([B, C]);
    expect(state().activeTabIndex).toBe(1);
    expect(activePath()).toBe(C);
    expect(state().fileContent).toBe("content C");
  });

  it("opening the same file twice does not duplicate the tab", async () => {
    await Promise.all([state().setActiveFile(A), state().setActiveFile(A)]);
    expect(state().tabs).toEqual([A]);
  });
});

describe("F-08: creating a file while editing", () => {
  it("flushes the previous edit to its file and starts clean in the new file", async () => {
    const N = "D:/vault/new.md";
    await openAndEdit(A, "unsaved edit in A");
    await state().createNewFile(N);

    expect(files.get(A)).toBe("unsaved edit in A");
    expect(writesTo(N).every((w) => w.content === "")).toBe(true);
    expect(files.get(N)).toBe("");
    expect(state().editPath).toBe(N);
    expect(state().editContent).toBe("");
    expect(state().isEditing).toBe(true);
    expect(activePath()).toBe(N);

    // typing in the new file saves to the new file only
    state().updateEditContent("hello");
    await vi.advanceTimersByTimeAsync(1000);
    expect(files.get(N)).toBe("hello");
    expect(files.get(A)).toBe("unsaved edit in A");
  });
});

describe("auto-save", () => {
  it("ignores edits when not editing and no-op updates", async () => {
    await state().setActiveFile(A);
    state().updateEditContent("typed in reading mode");
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toEqual([]);

    await state().setEditing(true);
    state().updateEditContent("content A"); // identical to the buffer
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toEqual([]);
  });

  it("flushPendingSave writes the debounced edit immediately (window close, F-13)", async () => {
    await openAndEdit(A, "last words");
    expect(files.get(A)).toBe("content A");
    expect(await state().flushPendingSave()).toBe(true);
    expect(files.get(A)).toBe("last words");
    await vi.advanceTimersByTimeAsync(1000);
    expect(writesTo(A)).toHaveLength(1); // the timer was cancelled, no second write
  });

  it("flushPendingSave reports failure so the window is not closed", async () => {
    await openAndEdit(A, "last words");
    failWritesTo.add(A);
    expect(await state().flushPendingSave()).toBe(false);
  });
});
