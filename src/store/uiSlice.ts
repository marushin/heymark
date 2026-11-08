import { StateCreator } from "zustand";
import { VaultState } from "./useVaultStore";
import { setStoreValue } from "../lib/tauriStore";

export interface UISlice {
  skin: 'modern' | 'norton' | 'terminal';
  isSettingsOpen: boolean;
  isReadabilityOpen: boolean;
  bookmarks: string[];
  confirmModal: {
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel?: string;
    onConfirm?: () => void;
    onDiscard?: () => void;
    onSaveAs?: () => void;
  };
  scrollPosition: number;
  viewerSettings: {
    letterSpacing: number; // em
    lineHeight: number;    // multiplier
    fontScale: number;     // ratio (scaleX)
  };
  theme: 'dark' | 'light';
  showSidebarLogo: boolean;

  setSkin: (skin: 'modern' | 'norton' | 'terminal') => Promise<void>;
  setSettingsOpen: (isOpen: boolean) => void;
  setReadabilityOpen: (isOpen: boolean) => void;
  toggleBookmark: (path: string) => Promise<void>;
  showConfirm: (params: { 
    title: string; 
    message: string; 
    actionLabel?: string;
    onConfirm?: () => void; 
    onDiscard?: () => void;
    onSaveAs?: () => void;
  }) => void;
  hideConfirm: () => void;
  setScrollPosition: (pos: number) => void;
  setViewerSettings: (settings: Partial<UISlice['viewerSettings']>) => Promise<void>;
  resetViewerSettings: () => Promise<void>;
  setTheme: (theme: 'dark' | 'light') => Promise<void>;
  setShowSidebarLogo: (show: boolean) => Promise<void>;
}

export const createUISlice: StateCreator<VaultState, [], [], UISlice> = (set, get) => ({
  skin: 'modern',
  isSettingsOpen: false,
  isReadabilityOpen: false,
  bookmarks: [],
  confirmModal: {
    isOpen: false,
    title: "",
    message: "",
  },
  scrollPosition: 0,
  viewerSettings: {
    letterSpacing: 0,
    lineHeight: 1.6,
    fontScale: 1.0,
  },
  theme: 'dark',
  showSidebarLogo: true,

  setSkin: async (skin) => {
    await setStoreValue("skin", skin);
    document.documentElement.setAttribute('data-skin', skin);
    set({ skin });
  },
  
  setSettingsOpen: (isOpen: boolean) => set({ isSettingsOpen: isOpen }),

  setReadabilityOpen: (isOpen: boolean) => set({ isReadabilityOpen: isOpen }),

  toggleBookmark: async (path: string) => {
    const { bookmarks } = get();
    const newBookmarks = bookmarks.includes(path)
      ? bookmarks.filter((p) => p !== path)
      : [...bookmarks, path];
    
    set({ bookmarks: newBookmarks });
    await setStoreValue("bookmarks", newBookmarks);
  },

  showConfirm: (params) => set({ 
    confirmModal: { 
      isOpen: true, 
      ...params 
    } 
  }),
  
  hideConfirm: () => set({ 
    confirmModal: { 
      isOpen: false, 
      title: "", 
      message: "" 
    } 
  }),

  setScrollPosition: (pos) => set({ scrollPosition: pos }),

  setViewerSettings: async (newSettings) => {
    const { viewerSettings } = get();
    const updated = { ...viewerSettings, ...newSettings };
    set({ viewerSettings: updated });
    await setStoreValue("viewerSettings", updated);
  },

  resetViewerSettings: async () => {
    const defaults = {
      letterSpacing: 0,
      lineHeight: 1.6,
      fontScale: 1.0,
    };
    set({ viewerSettings: defaults });
    await setStoreValue("viewerSettings", defaults);
  },

  setTheme: async (theme) => {
    await setStoreValue("theme", theme);
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },

  setShowSidebarLogo: async (show) => {
    await setStoreValue("showSidebarLogo", show);
    set({ showSidebarLogo: show });
  },
});
