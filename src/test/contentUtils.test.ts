import { describe, it, expect } from "vitest";
import { getTitleFromContent } from "../utils/contentUtils";

describe("getTitleFromContent", () => {
  it("should return fallback when content is empty", () => {
    expect(getTitleFromContent("", "Fallback")).toBe("Fallback");
    expect(getTitleFromContent("   ", "Fallback")).toBe("Fallback");
  });

  it("should extract title from the first non-empty line", () => {
    const content = "\n\n# Real Title\nSome content";
    expect(getTitleFromContent(content, "Fallback")).toBe("Real Title");
  });

  it("should remove markdown heading symbols", () => {
    expect(getTitleFromContent("### Small Heading", "Fallback")).toBe("Small Heading");
    expect(getTitleFromContent("# Heading with space", "Fallback")).toBe("Heading with space");
  });

  it("should return full line if no heading symbols found", () => {
    expect(getTitleFromContent("Just a plain line", "Fallback")).toBe("Just a plain line");
  });

  it("should handle content with only empty lines", () => {
    expect(getTitleFromContent("\n\n\n", "Fallback")).toBe("Fallback");
  });
});
