import { convertFileSrc } from "@tauri-apps/api/core";
import markdownit from "markdown-it";
import DOMPurify from "dompurify";
import { bundledLanguages, createHighlighter, type Highlighter } from "shiki";
import { parentDirOf, safeDecode } from "./pathUtils";

const md = markdownit({
  html: true,
  linkify: true,
  typographer: true,
});

// Custom renderer rule for images to handle local paths
md.renderer.rules.image = (tokens, idx, _options, env, _self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  let src = srcIndex >= 0 ? token.attrs![srcIndex][1] : '';
  const altText = token.content || '';
  const titleIndex = token.attrIndex('title');
  const title = titleIndex >= 0 ? token.attrs![titleIndex][1] : '';

  const activePath = env?.activePath;

  // If it's a relative local path (not http, not data, not already asset:)
  if (activePath && src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('asset:') && !src.startsWith('http://asset.localhost')) {
    // Resolve path relative to active file
    const parentDir = parentDirOf(activePath);
    if (parentDir !== null) {
      // markdown-it already percent-encodes the destination; convertFileSrc encodes again,
      // so decode first or non-ASCII/space paths are double-encoded (F-11).
      const relativeSrc = safeDecode(src.startsWith('./') ? src.substring(2) : src);

      // Combine and convert all separator slashes to forward slashes for Tauri asset protocol compatibility on Windows
      let absolutePath = `${parentDir}/${relativeSrc}`;
      absolutePath = absolutePath.replace(/\\/g, '/');
      src = convertFileSrc(absolutePath);
    }
  }

  // Build the <img> tag directly (all attribute values escaped)
  const escape = md.utils.escapeHtml;
  let imgHtml = `<img src="${escape(src)}" alt="${escape(altText)}"`;
  if (title) {
    imgHtml += ` title="${escape(title)}"`;
  }
  imgHtml += ' />';
  return imgHtml;
};

// [[wikilink]] as an inline rule, so it is never applied inside code spans or fences (F-17).
md.inline.ruler.before("link", "wikilink", (state, silent) => {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false;
  const end = src.indexOf("]]", pos + 2);
  if (end < 0) return false;
  const target = src.slice(pos + 2, end);
  if (!target || target.includes("\n")) return false;
  if (!silent) {
    const open = state.push("link_open", "a", 1);
    open.attrSet("href", target);
    open.attrSet("class", "wikilink");
    open.attrSet("data-wikilink", "true");
    open.attrSet("data-path", target);
    state.push("text", "", 0).content = target;
    state.push("link_close", "a", -1);
  }
  state.pos = end + 2;
  return true;
});

let highlighter: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter | null> | null = null;
// Once initialization has failed (e.g. WebAssembly blocked), do not retry on every render.
let highlighterFailed = false;

// Essential languages and themes to load initially
const CORE_LANGS = ["markdown", "json", "javascript", "typescript"];
const THEMES = ["github-dark", "github-light", "nord"];

const getOrInitHighlighter = async (): Promise<Highlighter | null> => {
  if (highlighter) return highlighter;
  if (highlighterFailed) return null;
  if (highlighterPromise) return highlighterPromise;

  highlighterPromise = createHighlighter({
    themes: THEMES,
    langs: CORE_LANGS,
  }).then(h => {
    highlighter = h;
    return h;
  }).catch(err => {
    console.error("Shiki initialization failed:", err);
    highlighterFailed = true;
    highlighterPromise = null;
    return null;
  });

  return highlighterPromise;
};

// Current theme and skin state
let currentTheme: 'light' | 'dark' = 'dark';
let currentSkin: string = 'modern';

// Custom highlighting logic using Shiki. Languages are loaded up front in renderMarkdown.
md.options.highlight = (code, lang) => {
  if (!highlighter || !lang) return "";

  // Normalize language name to lowercase (e.g., BibTeX -> bibtex)
  const normalizedLang = lang.toLowerCase();

  // Performance Guard: if code block is massive, don't highlight with Shiki
  if (code.length > 50000) {
    return "";
  }

  if (!highlighter.getLoadedLanguages().includes(normalizedLang)) {
    return "";
  }

  try {
    let shikiTheme = currentTheme === 'light' ? 'github-light' : 'github-dark';
    if (currentSkin === 'norton') shikiTheme = 'nord';

    return highlighter.codeToHtml(code, {
      lang: normalizedLang,
      theme: shikiTheme
    });
  } catch (e) {
    // Fall back to unstyled code instead of crashing the whole viewer
    return "";
  }
};

/** Languages named on code fences in the document (lowercased, de-duplicated). */
const extractFenceLangs = (content: string): string[] => {
  const langs = new Set<string>();
  const re = /^[ \t]{0,3}(?:`{3,}|~{3,})[ \t]*([^\s`]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    langs.add(m[1].toLowerCase());
  }
  return [...langs];
};

// Sanitizer settings (F-10). `asset:` must stay allowed or images vanish on macOS.
const URI_RE = /^(?:(?:https?|mailto|tel|asset):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;
const FORBID_TAGS = ["style", "meta", "base", "link", "iframe", "object", "embed", "form"];

export const renderMarkdown = async (
  content: string,
  theme: 'light' | 'dark' = 'dark',
  skin: string = 'modern',
  activePath?: string | null
): Promise<string> => {
  currentTheme = theme;
  currentSkin = skin;

  let h: Highlighter | null = null;
  try {
    h = await getOrInitHighlighter();
  } catch (err) {
    console.error("Highlighter init failed in render:", err);
  }

  // Load fence languages before rendering so first-time languages are highlighted (F-27).
  if (h) {
    const loaded = h.getLoadedLanguages();
    // Fence names are free text (`env`, typos, ...). loadLanguage throws synchronously on an
    // unknown name, so filter first and wrap the call: one bad fence must not fail the render.
    const missing = extractFenceLangs(content).filter(
      l => !loaded.includes(l) && Object.prototype.hasOwnProperty.call(bundledLanguages, l)
    );
    if (missing.length > 0) {
      await Promise.allSettled(
        missing.map(l => Promise.resolve().then(() => h!.loadLanguage(l as any)))
      );
    }
  }

  const rendered = md.render(content, { activePath });
  return DOMPurify.sanitize(rendered, {
    FORBID_TAGS,
    ALLOWED_URI_REGEXP: URI_RE,
  });
};
