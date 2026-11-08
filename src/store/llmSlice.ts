import { StateCreator } from "zustand";
import { LlmProvider, LlmConfig, VaultState } from "./useVaultStore";
import { setStoreValue } from "../lib/tauriStore";
import { llmFetch } from "../lib/llmFetch";

// Current Anthropic model IDs (F-20). The first entry is the default.
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-5-5";
export const CLAUDE_MODELS = [
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-haiku-5-5",
  "claude-fable-5-1",
];

// Older builds shipped IDs like `claude-4-6-sonnet-202602`, which are not valid Anthropic IDs.
const LEGACY_CLAUDE_ID_RE = /^claude-4-\d+-(sonnet|opus|haiku)-\d+$/;
const CLAUDE_FAMILY_REPLACEMENT: Record<string, string> = {
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
  haiku: "claude-haiku-5-5",
};

/** Map a stored legacy Claude model ID to the current one; other IDs are returned unchanged. */
export const migrateClaudeModelId = (id: string): string => {
  const m = LEGACY_CLAUDE_ID_RE.exec(id);
  return m ? CLAUDE_FAMILY_REPLACEMENT[m[1]] : id;
};

/** Migrate stored LLM settings. `changed` tells the caller whether to persist the result. */
export const migrateLlmSettings = (
  llmConfigs: Record<LlmProvider, LlmConfig> | null,
  availableModels: Record<LlmProvider, string[]> | null
): {
  llmConfigs: Record<LlmProvider, LlmConfig> | null;
  availableModels: Record<LlmProvider, string[]> | null;
  configsChanged: boolean;
  modelsChanged: boolean;
} => {
  let configsChanged = false;
  let modelsChanged = false;

  if (llmConfigs?.claude) {
    const migrated = migrateClaudeModelId(llmConfigs.claude.model);
    if (migrated !== llmConfigs.claude.model) {
      llmConfigs = { ...llmConfigs, claude: { ...llmConfigs.claude, model: migrated } };
      configsChanged = true;
    }
  }

  if (availableModels?.claude?.some((id) => LEGACY_CLAUDE_ID_RE.test(id))) {
    availableModels = { ...availableModels, claude: [...CLAUDE_MODELS] };
    modelsChanged = true;
  }

  return { llmConfigs, availableModels, configsChanged, modelsChanged };
};

const cleanEndpointOf = (endpoint: string | undefined) =>
  (endpoint || "").trim().replace(/\s+/g, '').replace(/\/+$/, '');

export interface LlmSlice {
  llmConfigs: Record<LlmProvider, LlmConfig>;
  activeLlmId: LlmProvider;
  isProcessing: boolean;
  apiStatus: 'connected' | 'disconnected' | 'checking' | 'error';
  availableModels: Record<LlmProvider, string[]>;

  setLlmConfig: (provider: LlmProvider, config: Partial<LlmConfig>) => Promise<void>;
  setActiveLlmId: (id: LlmProvider) => Promise<void>;
  setProcessing: (isProcessing: boolean) => void;
  setApiStatus: (status: 'connected' | 'disconnected' | 'checking' | 'error') => void;
  checkApiStatus: () => Promise<void>;
  fetchAvailableModels: (provider: LlmProvider) => Promise<void>;
}

export const createLlmSlice: StateCreator<VaultState, [], [], LlmSlice> = (set, get) => ({
  llmConfigs: {
    local: { provider: 'local', endpoint: "http://127.0.0.1:1234", apiKey: "", model: "google/gemma-4-26b-a4b" },
    openai: { provider: 'openai', endpoint: "https://api.openai.com/v1", apiKey: "", model: "gpt-4o" },
    claude: { provider: 'claude', endpoint: "https://api.anthropic.com/v1", apiKey: "", model: DEFAULT_CLAUDE_MODEL },
    gemini: { provider: 'gemini', endpoint: "https://generativelanguage.googleapis.com/v1", apiKey: "", model: "gemini-3.1-pro" }
  },
  activeLlmId: 'local',
  isProcessing: false,
  apiStatus: 'checking',
  availableModels: {
    local: [],
    openai: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    claude: [...CLAUDE_MODELS],
    gemini: ["gemini-3.1-pro", "gemini-3.1-flash", "gemini-3.1-flash-lite"]
  },

  // Update the in-memory state first so controlled inputs never lag behind keystrokes,
  // then persist (F-18). The endpoint is stored as typed; call sites clean it before use.
  setLlmConfig: async (provider, config) => {
    const { llmConfigs } = get();
    const newConfigs = {
      ...llmConfigs,
      [provider]: { ...llmConfigs[provider], ...config }
    };
    set({ llmConfigs: newConfigs });
    await setStoreValue("llmConfigs", newConfigs);
  },

  setActiveLlmId: async (id) => {
    await setStoreValue("activeLlmId", id);
    set({ activeLlmId: id });
    await get().checkApiStatus();
  },

  setProcessing: (isProcessing) => set({ isProcessing }),
  setApiStatus: (status) => set({ apiStatus: status }),

  checkApiStatus: async () => {
    const { llmConfigs, activeLlmId } = get();
    const config = llmConfigs[activeLlmId];
    set({ apiStatus: 'checking' });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      let url = "";
      let headers: Record<string, string> = { "Content-Type": "application/json" };

      const cleanEndpoint = cleanEndpointOf(config.endpoint);

      if (activeLlmId === 'local') {
        url = `${cleanEndpoint}/v1/models`;
      } else if (activeLlmId === 'openai') {
        url = `${cleanEndpoint}/models`;
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      } else if (activeLlmId === 'claude') {
        // Verify the key against the API instead of trusting its prefix (F-20).
        if (!config.apiKey) {
          set({ apiStatus: 'disconnected' });
          return;
        }
        url = `${cleanEndpoint}/models`;
        headers["x-api-key"] = config.apiKey;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
      } else if (activeLlmId === 'gemini') {
        url = `${cleanEndpoint}/models`;
        headers["x-goog-api-key"] = config.apiKey; // header, not ?key= (F-26)
      }

      if (!url) {
        set({ apiStatus: 'disconnected' });
        return;
      }

      const response = await llmFetch(activeLlmId, url, {
        method: "GET",
        headers,
        signal: controller.signal
      });

      if (response.ok) {
        set({ apiStatus: 'connected' });
      } else {
        set({ apiStatus: 'error' });
      }
    } catch (error) {
      set({ apiStatus: 'disconnected' });
    } finally {
      clearTimeout(timeoutId);
    }
  },

  fetchAvailableModels: async (provider) => {
    const { llmConfigs } = get();
    const config = llmConfigs[provider];

    try {
      let url = "";
      let headers: Record<string, string> = { "Content-Type": "application/json" };

      const cleanEndpoint = cleanEndpointOf(config.endpoint);

      if (provider === 'local') {
        url = `${cleanEndpoint}/v1/models`;
      } else if (provider === 'openai') {
        url = `${cleanEndpoint}/models`;
        headers["Authorization"] = `Bearer ${config.apiKey}`;
      } else if (provider === 'claude') {
        url = `${cleanEndpoint}/models?limit=100`;
        headers["x-api-key"] = config.apiKey;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
      } else if (provider === 'gemini') {
        url = `${cleanEndpoint}/models`;
        headers["x-goog-api-key"] = config.apiKey; // header, not ?key= (F-26)
      }

      if (!url) return;

      const response = await llmFetch(provider, url, { headers });
      if (!response.ok) throw new Error("Failed to fetch models");

      const data = await response.json();
      let models: string[] = [];

      if (provider === 'local' || provider === 'openai' || provider === 'claude') {
        models = data.data.map((m: any) => m.id);
      } else if (provider === 'gemini') {
        models = data.models.map((m: any) => m.name.replace('models/', ''));
      }

      // Never replace a usable list with an empty one.
      if (models.length === 0) return;

      const { availableModels } = get();
      const newAvailableModels = { ...availableModels, [provider]: models };

      await setStoreValue("availableModels", newAvailableModels);
      set({ availableModels: newAvailableModels });
    } catch (error) {
      console.error(`Failed to fetch models for ${provider}:`, error);
    }
  },
});
