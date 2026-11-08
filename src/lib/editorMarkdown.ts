import { convertFileSrc } from "@tauri-apps/api/core";
import { encodeLinkPath, parentDirOf, safeDecode } from "./pathUtils";

// Pure helpers that bridge the file's markdown and the WYSIWYG (Milkdown) editor.

// ![alt](src "title") where src may contain spaces and one level of balanced parentheses.
// src is lazy so an optional trailing title is captured separately and never treated as path.
const IMAGE_RE = /!\[(.*?)\]\(((?:[^()\n]|\([^()\n]*\))*?)(\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;

const isRemoteOrAsset = (src: string): boolean =>
  src.startsWith("http") ||
  src.startsWith("data:") ||
  src.startsWith("asset:") ||
  src.startsWith("http://asset.localhost") ||
  src.startsWith("https://asset.localhost");

/** Absolute (forward-slash) file path -> Tauri asset URL. Parentheses are encoded so the
 * URL survives a markdown round trip (encodeURIComponent leaves them alone). */
export const toAssetUrl = (absolutePath: string): string =>
  convertFileSrc(absolutePath.replace(/\\/g, "/"))
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

/** Convert relative image paths to Tauri asset URLs for editor rendering. */
export const prepareMarkdownForEditor = (content: string, activePath: string | null): string => {
  if (!activePath) return content;

  const parentDir = parentDirOf(activePath);
  if (parentDir === null) return content;

  return content.replace(IMAGE_RE, (match, alt, src: string, title?: string) => {
    if (isRemoteOrAsset(src)) return match;

    // The file stores percent-encoded paths (F-11); the filesystem path is the decoded form.
    let cleanRelativeSrc = safeDecode(src.startsWith("./") ? src.substring(2) : src);
    cleanRelativeSrc = cleanRelativeSrc.replace(/\\/g, "/");
    const absolutePath = `${parentDir}/${cleanRelativeSrc}`.replace(/\\/g, "/");

    return `![${alt}](${toAssetUrl(absolutePath)}${title ?? ""})`;
  });
};

/** Restore `[[wikilink]]` text that the commonmark serializer escaped as `\[\[...]]`. */
export const restoreWikilinks = (content: string): string =>
  content.replace(/\\\[\\\[([^\n]*?)\\?\]\\?\]/g, (_m, inner: string) =>
    `[[${inner.replace(/\\([\\`*_{}\[\]()#+\-.!~<>|])/g, "$1")}]]`
  );

/** Convert Tauri asset URLs back to relative paths and undo serializer escaping. */
export const cleanMarkdownFromEditor = (content: string, activePath: string | null): string => {
  let result = content;

  const parentDirRaw = activePath ? parentDirOf(activePath) : null;
  if (activePath && parentDirRaw !== null) {
    let parentDir = parentDirRaw.replace(/\\/g, "/");
    if (!parentDir.endsWith("/")) parentDir += "/";

    result = result.replace(IMAGE_RE, (match, alt, src: string, title?: string) => {
      if (
        !src.startsWith("http://asset.localhost") &&
        !src.startsWith("https://asset.localhost") &&
        !src.startsWith("asset://localhost") &&
        !src.startsWith("asset:")
      ) {
        return match;
      }

      const decodedSrc = safeDecode(src);
      const index = decodedSrc.toLowerCase().indexOf(parentDir.toLowerCase());
      if (index !== -1) {
        const relativePart = decodedSrc.substring(index + parentDir.length);
        return `![${alt}](${encodeLinkPath(relativePart)}${title ?? ""})`;
      }

      const assetsIndex = decodedSrc.lastIndexOf("/assets/");
      if (assetsIndex !== -1) {
        return `![${alt}](${encodeLinkPath(decodedSrc.substring(assetsIndex + 1))}${title ?? ""})`;
      }

      return match;
    });
  }

  return restoreWikilinks(result);
};

// --- YAML frontmatter -------------------------------------------------------
// The commonmark preset has no frontmatter support: it would turn `---` into `***` and
// mangle the YAML. The editor only ever sees the body; the block is re-attached on save.

export const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

export const splitFrontmatter = (content: string): { frontmatter: string; body: string } => {
  const m = content.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: "", body: content };
  return { frontmatter: m[0], body: content.slice(m[0].length) };
};
