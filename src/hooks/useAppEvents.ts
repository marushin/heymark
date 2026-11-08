import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useVaultStore } from "../store/useVaultStore";
import { DragDropPayload, OpenFilePayload } from "../types/tauri";
import { isImageFile, isSupportedFile } from "../lib/pathUtils";

/** Wait for session restoration; a failed restore must not block opening files. */
const waitForInit = async () => {
  try {
    await useVaultStore.getState().initialize();
  } catch (e) {
    console.error("Initialization failed:", e);
  }
};

/**
 * Open the files the app was launched with (explorer double-click, file association).
 * Runs after `initialize`, otherwise the restored session overwrites them (F-07).
 */
export const openInitialArgs = async (): Promise<void> => {
  await waitForInit();
  try {
    const args = await invoke<string[]>("get_initial_args");
    for (const arg of args) {
      if (isSupportedFile(arg)) {
        await useVaultStore.getState().safeSetFile(arg);
      }
    }
  } catch (e) {
    console.error("Failed to get initial args:", e);
  }
};

export const useAppEvents = () => {
  useEffect(() => {
    // Listen for files opened while app is running (e.g., from second instance).
    // Files are opened one after another and through safeSetFile, so an edit in progress is
    // saved to its own file first (F-01, F-07).
    const unlistenOpenFile = listen<OpenFilePayload>("open-file", async (event) => {
      await waitForInit();
      for (const path of event.payload) {
        if (isSupportedFile(path)) {
          await useVaultStore.getState().safeSetFile(path);
        }
      }
    });

    // Listen for drag and drop
    // In Tauri v2, the payload for tauri://drag-drop is { paths: string[], position: {x,y} }
    const unlistenDrop = listen<DragDropPayload>("tauri://drag-drop", async (event) => {
      const { paths } = event.payload;
      if (!paths || paths.length === 0) return;
      await waitForInit();

      for (const path of paths) {
        const store = useVaultStore.getState();
        if (isSupportedFile(path)) {
          await store.safeSetFile(path);
        } else if (store.isEditing && isImageFile(path)) {
          // OS file drops never reach the webview's HTML5 drop event (dragDropEnabled),
          // so hand the image to the editor (F-15).
          window.dispatchEvent(new CustomEvent("heymark:insert-image", { detail: path }));
        } else {
          try {
            const isDir = await invoke<boolean>("is_directory", { path });
            if (isDir) {
              await store.setVaultPath(path);
            }
          } catch (e) {
            console.error("Failed to check directory status for dropped path:", e);
          }
        }
      }
    });

    // Flush a pending (debounced) auto-save before the window closes (F-13).
    const appWindow = getCurrentWindow();
    const confirmCloseWithoutSave = () => {
      useVaultStore.getState().showConfirm({
        title: "저장 실패",
        message: "편집 중인 파일을 저장하지 못했습니다. 지금 닫으면 변경 내용이 사라집니다.",
        onConfirm: () => {
          void (async () => {
            if (await useVaultStore.getState().flushPendingSave()) {
              await appWindow.destroy();
            } else {
              confirmCloseWithoutSave();
            }
          })();
        },
        onDiscard: () => {
          void appWindow.destroy();
        },
      });
    };
    const unlistenClose = appWindow.onCloseRequested(async (event) => {
      const ok = await useVaultStore.getState().flushPendingSave();
      if (!ok) {
        event.preventDefault();
        confirmCloseWithoutSave();
      }
    });

    return () => {
      unlistenOpenFile.then(u => u());
      unlistenDrop.then(u => u());
      unlistenClose.then(u => u());
    };
  }, []);
};
