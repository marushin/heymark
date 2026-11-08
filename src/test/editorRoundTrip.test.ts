import { describe, it, expect } from "vitest";
import { Editor, rootCtx, defaultValueCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getMarkdown } from "@milkdown/kit/utils";
import {
  cleanMarkdownFromEditor,
  restoreWikilinks,
  splitFrontmatter,
} from "../lib/editorMarkdown";
import { isMarkdownPath, isSupportedFile, isImageFile, safeDecode, encodeLinkPath } from "../lib/pathUtils";

// The same preset Crepe uses (commonmark + gfm), run headless.
const milkdownRoundTrip = async (input: string): Promise<string> => {
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, document.createElement("div"));
      ctx.set(defaultValueCtx, input);
    })
    .use(commonmark)
    .use(gfm)
    .create();
  const out = editor.action(getMarkdown());
  await editor.destroy();
  return out;
};

describe("F-04: which files get the WYSIWYG editor", () => {
  it("only .md files (any case) use Milkdown; txt and json do not", () => {
    expect(isMarkdownPath("a/b/note.md")).toBe(true);
    expect(isMarkdownPath("C:\\x\\README.MD")).toBe(true);
    expect(isMarkdownPath("a/b/data.json")).toBe(false);
    expect(isMarkdownPath("a/b/notes.txt")).toBe(false);
    expect(isMarkdownPath(null)).toBe(false);
  });

  it("supported-file check is case-insensitive (F-23)", () => {
    expect(isSupportedFile("X/README.MD")).toBe(true);
    expect(isSupportedFile("X/a.TXT")).toBe(true);
    expect(isSupportedFile("X/a.Json")).toBe(true);
    expect(isSupportedFile("X/a.png")).toBe(false);
    expect(isImageFile("X/a.PNG")).toBe(true);
  });
});

describe("F-04: frontmatter", () => {
  const doc = "---\ntitle: hello\ntags: [a, b]\n---\n# Body\n\ntext\n";

  it("splits the YAML block from the body", () => {
    const { frontmatter, body } = splitFrontmatter(doc);
    expect(frontmatter).toBe("---\ntitle: hello\ntags: [a, b]\n---\n");
    expect(body).toBe("# Body\n\ntext\n");
    expect(frontmatter + body).toBe(doc);
  });

  it("handles CRLF and a frontmatter-only file", () => {
    const crlf = "---\r\ntitle: x\r\n---\r\nbody";
    expect(splitFrontmatter(crlf)).toEqual({ frontmatter: "---\r\ntitle: x\r\n---\r\n", body: "body" });
    expect(splitFrontmatter("---\na: 1\n---")).toEqual({ frontmatter: "---\na: 1\n---", body: "" });
  });

  it("leaves documents without frontmatter alone, including a mid-document rule", () => {
    expect(splitFrontmatter("# T\n\n---\n\nx\n---\n").frontmatter).toBe("");
    expect(splitFrontmatter("plain").body).toBe("plain");
  });

  it("body goes through the editor, frontmatter is re-attached unchanged", async () => {
    const { frontmatter, body } = splitFrontmatter(doc);
    const edited = await milkdownRoundTrip(body);
    expect(frontmatter + edited).toContain("---\ntitle: hello\ntags: [a, b]\n---\n");
    expect(frontmatter + edited).toContain("# Body");
  });

  it("documents the failure the split prevents: Milkdown mangles frontmatter", async () => {
    const mangled = await milkdownRoundTrip(doc);
    expect(mangled).not.toContain("---\ntitle: hello\ntags: [a, b]\n---");
  });
});

describe("F-04: wikilinks survive the editor", () => {
  it("restores escaped wikilinks", () => {
    expect(restoreWikilinks("see \\[\\[note]] here")).toBe("see [[note]] here");
    expect(restoreWikilinks("a \\[\\[my\\_note]] b \\[\\[x\\]\\] c")).toBe("a [[my_note]] b [[x]] c");
    expect(restoreWikilinks("plain [[already]] ok")).toBe("plain [[already]] ok");
  });

  it("real Milkdown output is repaired by cleanMarkdownFromEditor", async () => {
    const out = await milkdownRoundTrip("see [[note]] here and [[my_note]]\n");
    expect(out).toContain("\\[\\[");
    expect(cleanMarkdownFromEditor(out, null).trim()).toBe("see [[note]] here and [[my_note]]");
  });
});

describe("F-04/F-11: link path helpers", () => {
  it("safeDecode returns malformed input unchanged", () => {
    expect(safeDecode("%ED%95%9C")).toBe("한");
    expect(safeDecode("100%")).toBe("100%");
    expect(safeDecode("a%23b")).toBe("a#b");
  });

  it("encodeLinkPath keeps decode lossless", () => {
    const names = ["my pic (1).png", "100%.png", "a%20b.png", "한글 파일.png"];
    for (const n of names) {
      expect(safeDecode(encodeLinkPath(n))).toBe(n);
    }
    expect(encodeLinkPath("a b(1).png")).toBe("a%20b%281%29.png");
  });
});
