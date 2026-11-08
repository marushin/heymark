import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import type { LlmProvider } from "../store/useVaultStore";

/**
 * Local servers such as LM Studio ship with CORS off, so a webview fetch is blocked before
 * the app can read the response. The local provider goes through the Rust HTTP client
 * instead; its allowed hosts are the `http:default` scope in capabilities/main.json.
 * Cloud providers keep using the webview fetch.
 */
export const llmFetch = (
  provider: LlmProvider,
  url: string,
  init?: RequestInit
): Promise<Response> => (provider === "local" ? tauriFetch(url, init) : fetch(url, init));
