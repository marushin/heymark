// Shared helpers for file paths and link paths.

/** Decode a percent-encoded path; return the input unchanged if it is malformed. */
export const safeDecode = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * Encode the characters that would end a markdown link destination early
 * (space, parentheses) so the written path stays a valid CommonMark image/link. A literal `%`
 * is encoded first so that decoding is lossless.
 */
export const encodeLinkPath = (s: string): string =>
  s.replace(/%/g, "%25").replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");

/** Files the app can open (case-insensitive). */
export const SUPPORTED_FILE_RE = /\.(md|txt|json)$/i;
export const isSupportedFile = (path: string): boolean => SUPPORTED_FILE_RE.test(path);

/** Markdown files get the WYSIWYG editor; everything else gets a plain editor. */
export const isMarkdownPath = (path: string | null | undefined): boolean =>
  !!path && /\.md$/i.test(path);

export const IMAGE_FILE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
export const isImageFile = (path: string): boolean => IMAGE_FILE_RE.test(path);

/** Directory part of a path with either separator, or null if there is none. */
export const parentDirOf = (path: string): string | null => {
  const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return lastSep === -1 ? null : path.substring(0, lastSep);
};
