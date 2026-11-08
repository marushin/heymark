import { StateCreator } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { FileNode } from "../types/tauri";
import { VaultState } from "./useVaultStore";
import { setStoreValue } from "../lib/tauriStore";
import { encodeLinkPath } from "../lib/pathUtils";

export interface Vault {
  path: string;
  name: string;
  tree: FileNode[];
}

export interface FileSlice {
  vaultPaths: string[]; // List of root paths
  vaults: Vault[];      // Detailed vault info including trees
  tabs: string[];
  activeTabIndex: number;
  fileContent: string;
  /** Set when the active file could not be read. Editing and Save As are blocked while set. */
  loadError: string | null;
  /** Last save failure (auto-save included), cleared by the next successful save. */
  saveError: string | null;
  searchQuery: string;
  isEditing: boolean;
  editContent: string;
  /** The file the edit buffer belongs to. Saves always go here, never to "the active tab". */
  editPath: string | null;
  isEditorSearchOpen: boolean;

  setVaultPath: (path: string) => Promise<void>;
  removeVault: (path: string) => Promise<void>;
  setActiveFile: (path: string) => Promise<void>;
  safeSetFile: (path: string) => Promise<void>;
  setActiveTab: (index: number) => Promise<void>;
  closeTab: (index: number) => Promise<void>;
  safeSetTab: (index: number) => Promise<void>;
  safeCloseTab: (index: number) => Promise<void>;
  refreshVault: () => Promise<void>;
  _loadContent: (path: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setEditing: (editing: boolean) => Promise<void>;
  updateEditContent: (content: string) => void;
  saveActiveFile: () => Promise<boolean>;
  saveActiveFileAs: (path: string) => Promise<boolean>;
  flushPendingSave: () => Promise<boolean>;
  createNewFile: (path: string) => Promise<void>;
  setEditorSearchOpen: (isOpen: boolean) => void;
  closeAllTabs: () => Promise<void>;
  resetExplorer: () => Promise<void>;
  handleImageUpload: (fileOrPath: File | string) => Promise<string | null>;
}

let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;
// Incremented for every load / tab reset so a slow, superseded read can be recognised and dropped.
let loadSeq = 0;

const clearAutoSave = () => {
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = null;
  }
};

export const createFileSlice: StateCreator<VaultState, [], [], FileSlice> = (set, get) => {
  /** Ask the user what to do when the edit buffer could not be written. */
  const showSaveFailure = (path: string, proceed: () => Promise<void>) => {
    get().showConfirm({
      title: "저장 실패",
      message: `${path} 파일을 저장하지 못했습니다. 다시 시도하거나, 변경 내용을 버리고 계속할 수 있습니다.`,
      onConfirm: () => {
        // Retry: run the whole guarded transition again (save first, then proceed).
        void transition(proceed);
      },
      onDiscard: () => {
        if (get().editPath === path) set({ isEditing: false, editPath: null });
        void proceed();
      },
    });
  };

  /**
   * Flush the edit buffer to its own file, end the edit session, then run `proceed`.
   * If the write fails nothing is discarded: the save-failure dialog is shown instead and
   * `proceed` does not run (returns false).
   */
  const transition = async (proceed: () => Promise<void>): Promise<boolean> => {
    clearAutoSave();
    const { isEditing, editPath } = get();
    if (isEditing) {
      const ok = await get().saveActiveFile();
      if (!ok) {
        showSaveFailure(editPath ?? "", proceed);
        return false;
      }
      if (get().editPath === editPath) set({ isEditing: false, editPath: null });
    }
    await proceed();
    return true;
  };

  return {
  vaultPaths: [],
  vaults: [],
  tabs: [],
  activeTabIndex: -1,
  fileContent: "",
  loadError: null,
  saveError: null,
  searchQuery: "",
  isEditing: false,
  editContent: "",
  editPath: null,
  isEditorSearchOpen: false,

  setVaultPath: async (path) => {
    const { vaultPaths, vaults } = get();
    if (vaultPaths.includes(path)) return;

    try {
      const tree = await invoke<FileNode[]>("open_vault", { path });
      const name = path.split(/[/\\]/).pop() || path;
      const newVaultPaths = [...vaultPaths, path];
      const newVaults = [...vaults, { path, name, tree }];

      await setStoreValue("vaultPaths", newVaultPaths);
      set({ vaultPaths: newVaultPaths, vaults: newVaults });
    } catch (error) {
      console.error("Failed to open vault:", error);
    }
  },

  removeVault: async (path) => {
    const { vaultPaths, vaults } = get();
    const newVaultPaths = vaultPaths.filter(p => p !== path);
    const newVaults = vaults.filter(v => v.path !== path);

    await setStoreValue("vaultPaths", newVaultPaths);
    set({ vaultPaths: newVaultPaths, vaults: newVaults });
  },

  setActiveFile: async (path) => {
    // Update `tabs` synchronously, before any await, so concurrent opens each see the
    // tabs the previous call added (F-07).
    if (!get().tabs.includes(path)) {
      set({ tabs: [...get().tabs, path] });
    }
    try {
      await setStoreValue("tabs", get().tabs);
    } catch (error) {
      console.error("Failed to persist tabs:", error);
    }
    await get()._loadContent(path);
  },

  safeSetFile: async (path: string) => {
    const { tabs, activeTabIndex } = get();
    const activePath = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

    if (path === activePath) return;

    await transition(() => get().setActiveFile(path));
  },

  setActiveTab: async (index) => {
    const { tabs } = get();
    if (index < 0 || index >= tabs.length) return;
    await get()._loadContent(tabs[index]);
  },

  // The tab index is computed when the read completes, not when it starts, so closing or
  // opening tabs while a slow read is in flight cannot point it at a different tab (F-07).
  _loadContent: async (path: string) => {
    const seq = ++loadSeq;
    let content: string;
    try {
      content = await invoke<string>("read_file", { path });
    } catch (error) {
      console.error(`Failed to read file at ${path}:`, error);
      if (seq !== loadSeq) return;
      const index = get().tabs.indexOf(path);
      if (index === -1) return;
      // Never put an error message into fileContent: it could be saved over the original (F-02).
      set({ activeTabIndex: index, fileContent: "", loadError: String(error) });
      try { await setStoreValue("activeTabIndex", index); } catch { /* ignore */ }
      return;
    }
    if (seq !== loadSeq) return;
    const index = get().tabs.indexOf(path);
    if (index === -1) return;
    set({ activeTabIndex: index, fileContent: content, loadError: null });
    try { await setStoreValue("activeTabIndex", index); } catch { /* ignore */ }
  },

  closeTab: async (index) => {
    const { tabs, activeTabIndex, setActiveTab } = get();
    const newTabs = tabs.filter((_, i) => i !== index);

    let newActiveIndex = activeTabIndex;
    if (index < activeTabIndex) {
      newActiveIndex = activeTabIndex - 1;
    } else if (index === activeTabIndex) {
      newActiveIndex = Math.min(newTabs.length - 1, activeTabIndex);
    }

    await setStoreValue("tabs", newTabs);
    await setStoreValue("activeTabIndex", newActiveIndex);

    if (newTabs.length === 0) {
      loadSeq++;
      set({ tabs: [], activeTabIndex: -1, fileContent: "", loadError: null });
    } else if (index === activeTabIndex) {
      set({ tabs: newTabs, activeTabIndex: newActiveIndex });
      await setActiveTab(newActiveIndex);
    } else {
      // The displayed file did not change; only its index moved.
      set({ tabs: newTabs, activeTabIndex: newActiveIndex });
    }
  },

  safeSetTab: async (index: number) => {
    const { tabs, safeSetFile } = get();
    if (index < 0 || index >= tabs.length) return;
    await safeSetFile(tabs[index]);
  },

  safeCloseTab: async (index: number) => {
    const { tabs, isEditing, editPath } = get();
    const path = tabs[index];
    if (path === undefined) return;

    const closeByPath = async () => {
      const i = get().tabs.indexOf(path);
      if (i !== -1) await get().closeTab(i);
    };

    if (isEditing && path === editPath) {
      await transition(closeByPath);
    } else {
      await closeByPath();
    }
  },

  closeAllTabs: async () => {
    const { tabs } = get();
    if (tabs.length === 0) return;

    await transition(async () => {
      loadSeq++;
      await setStoreValue("tabs", []);
      await setStoreValue("activeTabIndex", -1);
      set({
        tabs: [],
        activeTabIndex: -1,
        fileContent: "",
        loadError: null,
        isEditing: false,
        editContent: "",
        editPath: null,
      });
    });
  },

  resetExplorer: async () => {
    const { tabs, vaultPaths } = get();

    if (tabs.length === 0 && vaultPaths.length === 0) return;

    await transition(async () => {
      loadSeq++;
      await setStoreValue("tabs", []);
      await setStoreValue("activeTabIndex", -1);
      await setStoreValue("vaultPaths", []);
      set({
        tabs: [],
        activeTabIndex: -1,
        vaultPaths: [],
        vaults: [],
        fileContent: "",
        loadError: null,
        isEditing: false,
        editContent: "",
        editPath: null,
      });
    });
  },

  refreshVault: async () => {
    const { vaultPaths } = get();
    if (vaultPaths.length === 0) return;

    try {
      const newVaults = await Promise.all(vaultPaths.map(async (path) => {
        const tree = await invoke<FileNode[]>("open_vault", { path });
        const name = path.split(/[/\\]/).pop() || path;
        return { path, name, tree };
      }));
      set({ vaults: newVaults });
    } catch (error) {
      console.error("Failed to refresh vaults:", error);
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  setEditing: async (editing) => {
    if (editing) {
      const { isEditing, loadError, tabs, activeTabIndex, fileContent } = get();
      if (isEditing || loadError) return;
      const path = activeTabIndex >= 0 ? tabs[activeTabIndex] : undefined;
      if (!path) return;
      set({ isEditing: true, editContent: fileContent, editPath: path });
      return;
    }

    if (!get().isEditing) return;
    clearAutoSave();

    // Nothing to write if the buffer is unchanged.
    const { editPath, editContent, fileContent } = get();
    if (editPath && editContent !== fileContent) {
      const ok = await get().saveActiveFile();
      if (!ok) {
        showSaveFailure(editPath, async () => {});
        return;
      }
    }
    if (get().editPath === editPath) set({ isEditing: false, editPath: null });
  },

  updateEditContent: (content) => {
    // Ignore late emissions from an editor that is already gone, and no-op changes.
    const state = get();
    if (!state.isEditing || content === state.editContent) return;
    set({ editContent: content });
    clearAutoSave();
    autoSaveTimeout = setTimeout(() => {
      autoSaveTimeout = null;
      void get().saveActiveFile();
    }, 1000);
  },

  saveActiveFile: async () => {
    const { isEditing, editPath, editContent } = get();
    if (!isEditing || !editPath) return true;

    try {
      await invoke("write_file", { path: editPath, content: editContent });
      // Only refresh the displayed content if the saved file is the one on screen.
      const { tabs, activeTabIndex } = get();
      if (tabs[activeTabIndex] === editPath) set({ fileContent: editContent, saveError: null });
      else set({ saveError: null });
      return true;
    } catch (error) {
      console.error("Failed to save file:", error);
      set({ saveError: `${editPath}: ${String(error)}` });
      return false;
    }
  },

  flushPendingSave: async () => {
    clearAutoSave();
    if (!get().isEditing) return true;
    return await get().saveActiveFile();
  },

  saveActiveFileAs: async (path: string) => {
    const { isEditing, editContent, fileContent, loadError } = get();
    if (loadError) return false;
    // Reading mode saves the displayed file; editing mode saves the edit buffer (F-03).
    const content = isEditing ? editContent : fileContent;
    clearAutoSave();
    try {
      await invoke("write_file", { path, content });
      await get().setActiveFile(path);
      set({
        fileContent: content,
        saveError: null,
        ...(isEditing ? { editPath: path, editContent: content } : {}),
      });
      await get().refreshVault();
      return true;
    } catch (error) {
      console.error("Failed to save file as:", error);
      get().showConfirm({
        title: "저장 실패",
        message: `${path} 파일을 저장하지 못했습니다.\n${String(error)}`,
      });
      return false;
    }
  },

  createNewFile: async (path: string) => {
    await transition(async () => {
      try {
        await invoke("write_file", { path, content: "" });
        await get().setActiveFile(path);
        const { tabs, activeTabIndex } = get();
        if (tabs[activeTabIndex] === path) {
          set({ isEditing: true, editPath: path, editContent: "" });
        }
        await get().refreshVault();
      } catch (error) {
        console.error("Failed to create new file:", error);
      }
    });
  },

  setEditorSearchOpen: (isOpen) => set({ isEditorSearchOpen: isOpen }),

  handleImageUpload: async (fileOrPath: File | string): Promise<string | null> => {
    const { tabs, activeTabIndex, refreshVault } = get();
    if (activeTabIndex === -1) return null;

    const activePath = tabs[activeTabIndex];
    // Cross-platform directory path derivation
    const lastSep = Math.max(activePath.lastIndexOf('/'), activePath.lastIndexOf('\\'));
    if (lastSep === -1) return null;

    const parentDir = activePath.substring(0, lastSep);
    const assetsDir = `${parentDir}/assets`;

    try {
      let fileName = "";

      if (typeof fileOrPath === 'string') {
        const srcPath = fileOrPath;
        const lastSrcSep = Math.max(srcPath.lastIndexOf('/'), srcPath.lastIndexOf('\\'));
        const desiredName = srcPath.substring(lastSrcSep + 1);
        const destPath = `${assetsDir}/${desiredName}`;

        // The backend picks a free name (name-1.ext, ...) and returns the final file name (F-16).
        fileName = await invoke<string>("save_image", { src: srcPath, dest: destPath });
      } else {
        const file = fileOrPath;
        const ext = file.name.split('.').pop() || 'png';
        const timestamp = new Date().getTime();
        fileName = `pasted_image_${timestamp}.${ext}`;
        const destPath = `${assetsDir}/${fileName}`;

        const arrayBuffer = await file.arrayBuffer();
        const data = Array.from(new Uint8Array(arrayBuffer));

        await invoke("write_binary_file", { path: destPath, data });
      }

      await refreshVault();
      return `![${fileName}](assets/${encodeLinkPath(fileName)})`;
    } catch (error) {
      console.error("Failed to upload image:", error);
      return null;
    }
  },
  };
};
