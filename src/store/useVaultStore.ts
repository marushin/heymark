import { create } from "zustand";
import { createFileSlice, FileSlice } from "./fileSlice";
import { createLlmSlice, LlmSlice, migrateLlmSettings } from "./llmSlice";
import { createUISlice, UISlice } from "./uiSlice";

import { LlmProvider, LlmConfig } from "../types/tauri";
export type { LlmProvider, LlmConfig };

export type VaultState = FileSlice & LlmSlice & UISlice & {
  initialize: () => Promise<void>;
};

import { getStoreValue, setStoreValue } from "../lib/tauriStore";

// `initialize` runs once per page load no matter how often it is called (React StrictMode,
// event handlers that must wait for restoration). Everyone awaits the same promise (F-07).
let initPromise: Promise<void> | null = null;

export const useVaultStore = create<VaultState>((...a) => ({
  ...createFileSlice(...a),
  ...createLlmSlice(...a),
  ...createUISlice(...a),

  // Combined initialization
  initialize: () => {
    if (!initPromise) initPromise = runInitialize(a[0], a[1]);
    return initPromise;
  },
}));

async function runInitialize(
  set: (partial: Partial<VaultState>) => void,
  get: () => VaultState
): Promise<void> {
    // Load all persistent state from tauri-plugin-store
    const vaultPaths = await getStoreValue<string[]>("vaultPaths", []);
    const tabs = await getStoreValue<string[]>("tabs", []);
    const activeTabIndex = await getStoreValue<number>("activeTabIndex", -1);
    const skin = await getStoreValue<'modern' | 'norton' | 'terminal'>("skin", 'modern');
    const theme = await getStoreValue<'dark' | 'light'>("theme", 'dark');
    const bookmarks = await getStoreValue<string[]>("bookmarks", []);
    const activeLlmId = await getStoreValue<LlmProvider>("activeLlmId", 'local');
    const storedLlmConfigs = await getStoreValue<Record<LlmProvider, LlmConfig> | null>("llmConfigs", null);
    const storedAvailableModels = await getStoreValue<Record<LlmProvider, string[]> | null>("availableModels", null);
    const showSidebarLogo = await getStoreValue<boolean>("showSidebarLogo", true);

    // Replace model IDs saved by older builds (F-20)
    const migrated = migrateLlmSettings(storedLlmConfigs, storedAvailableModels);
    const llmConfigs = migrated.llmConfigs;
    const availableModels = migrated.availableModels;
    try {
      if (migrated.configsChanged) await setStoreValue("llmConfigs", llmConfigs);
      if (migrated.modelsChanged) await setStoreValue("availableModels", availableModels);
    } catch (e) {
      console.error("Failed to persist migrated LLM settings:", e);
    }

    // Read viewer settings with robust default merge
    const defaultViewerSettings = {
      letterSpacing: 0,
      lineHeight: 1.6,
      fontScale: 1.0,
    };
    const loadedViewerSettings = await getStoreValue<Partial<UISlice['viewerSettings']> | null>("viewerSettings", defaultViewerSettings);

    const newState: Partial<VaultState> = {
      vaultPaths,
      tabs,
      activeTabIndex,
      skin,
      theme,
      bookmarks,
      activeLlmId,
      showSidebarLogo,
      viewerSettings: { ...defaultViewerSettings, ...loadedViewerSettings }
    };

    if (llmConfigs) newState.llmConfigs = llmConfigs;
    if (availableModels) newState.availableModels = availableModels;

    set(newState);

    // Apply skin and theme to DOM
    document.documentElement.setAttribute('data-skin', skin);
    document.documentElement.setAttribute('data-theme', theme);

    // Load vaults if saved
    if (vaultPaths && vaultPaths.length > 0) {
      await get().refreshVault();
    }

    // Load active tab content if saved
    if (tabs.length > 0 && activeTabIndex >= 0 && activeTabIndex < tabs.length) {
      const activePath = tabs[activeTabIndex];
      try {
        await get()._loadContent(activePath);
      } catch (e) {
        console.error("Failed to restore active tab:", e);
      }
    }

    // Check API status
    await get().checkApiStatus();
}
