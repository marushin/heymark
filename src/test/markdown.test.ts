import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../lib/markdown";
import { prepareMarkdownForEditor, cleanMarkdownFromEditor } from "../components/MarkdownEditor";

const ACTIVE = "D:\\SynologyDrive\\ccoon\\260408 mdair\\report\\hello.md";
const ASSET_BASE = "http://asset.localhost/";
// convertFileSrc is mocked like the real one: encodeURIComponent of the whole path.
const asset = (p: string) => ASSET_BASE + encodeURIComponent(p);
const DIR = "D:/SynologyDrive/ccoon/260408 mdair/report";

describe("Markdown Path Rendering Tests", () => {
  it("should resolve relative image paths correctly in viewer", async () => {
    const html = await renderMarkdown("![my image](assets/128x128.png)", "dark", "modern", ACTIVE);
    expect(html).toContain(asset(`${DIR}/assets/128x128.png`));
  });

  it("should prepare and clean editor paths with backslashes and spaces", () => {
    const rawMarkdown = "![my image](assets\\128x128.png)";

    const prepared = prepareMarkdownForEditor(rawMarkdown, ACTIVE);
    expect(prepared).toContain(asset(`${DIR}/assets/128x128.png`));

    const cleaned = cleanMarkdownFromEditor(prepared, ACTIVE);
    expect(cleaned).toBe("![my image](assets/128x128.png)");
  });
});

describe("F-11: Korean and spaced paths", () => {
  it("viewer does not double-encode a Korean image path", async () => {
    const html = await renderMarkdown("![x](assets/한글.png)", "dark", "modern", ACTIVE);
    // encoded exactly once: the Korean name appears as %ED..., never as %25ED...
    expect(html).toContain(asset(`${DIR}/assets/한글.png`));
    expect(html).not.toContain("%25ED");
  });

  it("viewer resolves an image whose path has an encoded space", async () => {
    const html = await renderMarkdown("![x](assets/my%20pic.png)", "dark", "modern", ACTIVE);
    expect(html).toContain(asset(`${DIR}/assets/my pic.png`));
  });

  it("editor round trip writes spaces and parentheses percent-encoded", () => {
    const original = "![x](assets/my%20pic%20%281%29.png)";
    const prepared = prepareMarkdownForEditor(original, ACTIVE);
    expect(prepared).toContain(asset(`${DIR}/assets/my pic (1).png`).replace(/\(/g, "%28").replace(/\)/g, "%29"));
    // the URL handed to the editor has no raw space or parenthesis, so it stays one image
    expect(prepared).not.toMatch(/\([^)]*\s[^)]*\)/);
    expect(cleanMarkdownFromEditor(prepared, ACTIVE)).toBe(original);
  });

  it("editor round trip keeps a Korean file name readable", () => {
    const prepared = prepareMarkdownForEditor("![x](assets/한글.png)", ACTIVE);
    expect(cleanMarkdownFromEditor(prepared, ACTIVE)).toBe("![x](assets/한글.png)");
  });

  it("legacy unencoded space paths are repaired on the next save", () => {
    const prepared = prepareMarkdownForEditor("![x](assets/my pic.png)", ACTIVE);
    expect(cleanMarkdownFromEditor(prepared, ACTIVE)).toBe("![x](assets/my%20pic.png)");
  });

  it("escapes alt and title so attributes cannot break out", async () => {
    const html = await renderMarkdown('![a"b](x.png "t<i>")', "dark", "modern", ACTIVE);
    expect(html).toContain('alt="a&quot;b"');
    const doc = new DOMParser().parseFromString(html, "text/html");
    expect(doc.querySelector("i")).toBeNull();
    expect(doc.querySelector("img")?.getAttribute("title")).toBe("t<i>");
  });
});

describe("N-04: image titles", () => {
  it("keeps a double-quoted title out of the path through the editor round trip", () => {
    const original = '![a](assets/b.png "t")';
    const prepared = prepareMarkdownForEditor(original, ACTIVE);
    expect(prepared).toBe(`![a](${asset(`${DIR}/assets/b.png`)} "t")`);
    expect(cleanMarkdownFromEditor(prepared, ACTIVE)).toBe(original);
  });

  it("keeps a single-quoted title containing parentheses", () => {
    const original = "![a](assets/b.png 'see (1)')";
    const prepared = prepareMarkdownForEditor(original, ACTIVE);
    expect(cleanMarkdownFromEditor(prepared, ACTIVE)).toBe(original);
  });

  it("still repairs a legacy spaced path that also has a title", () => {
    const prepared = prepareMarkdownForEditor('![a](assets/my pic.png "t u")', ACTIVE);
    expect(cleanMarkdownFromEditor(prepared, ACTIVE)).toBe('![a](assets/my%20pic.png "t u")');
  });
});

describe("N-01: unknown code fence languages", () => {
  it("renders the document when a fence names a language Shiki does not bundle", async () => {
    const html = await renderMarkdown(
      "```env\nA=1\n```\n\n```nosuchlang\nb\n```\n\n```constructor\nc\n```\n\n```python\nprint('x')\n```",
      "dark", "modern", null
    );
    const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
    expect(text).toContain("A=1");
    expect(text).toContain("b");
    // a bad fence does not stop the valid one from being highlighted
    expect(html).toContain("shiki");
  });
});

describe("F-17: wikilinks", () => {
  it("renders a wikilink as a link", async () => {
    const html = await renderMarkdown("see [[note]] here", "dark", "modern", null);
    expect(html).toContain('data-wikilink="true"');
    expect(html).toContain('data-path="note"');
  });

  it("leaves [[ ]] inside fenced code and inline code alone", async () => {
    const html = await renderMarkdown("```bash\nif [[ -f x ]]; then echo hi; fi\n```\n\n`[[ y ]]`", "dark", "modern", null);
    expect(html).not.toContain("data-wikilink");
    // Shiki wraps tokens in spans, so compare the visible text
    const text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
    expect(text).toContain("if [[ -f x ]]; then echo hi; fi");
    expect(text).toContain("[[ y ]]");
  });

  it("highlights a language on its first use (F-27)", async () => {
    const html = await renderMarkdown("```python\nprint('x')\n```", "dark", "modern", null);
    expect(html).toContain("shiki");
  });

  it("escapes HTML in the target", async () => {
    const html = await renderMarkdown("[[<b>x</b>]]", "dark", "modern", null);
    expect(new DOMParser().parseFromString(html, "text/html").querySelector("b")).toBeNull();
  });
});

describe("F-10: sanitizing", () => {
  it("strips meta refresh, style, iframe and event handlers", async () => {
    const html = await renderMarkdown(
      '<meta http-equiv="refresh" content="0;url=https://evil.example">\n\n<style>body{display:none}</style>\n\n<iframe srcdoc="x"></iframe>\n\n<img src="a.png" onerror="alert(1)">',
      "dark", "modern", null
    );
    expect(html).not.toMatch(/<meta/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/onerror/i);
  });

  it("removes javascript: links but keeps http, relative and Korean links", async () => {
    const html = await renderMarkdown(
      "<a href=\"javascript:alert(1)\">bad</a> [ok](https://example.com) [rel](한글.md)",
      "dark", "modern", null
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com"');
    expect(html).toMatch(/href="[^"]*(%ED|한글)/);
  });

  it("keeps asset image URLs", async () => {
    const html = await renderMarkdown("![x](a.png)", "dark", "modern", ACTIVE);
    expect(html).toContain("<img");
    expect(html).toContain("asset.localhost");
  });
});
