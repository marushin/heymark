import { useEffect } from "react";
import { useVaultStore } from "../store/useVaultStore";

interface KeyBindingProps {
  onSave: () => Promise<void>;
  onSaveAs: () => Promise<void>;
  onDone: () => void;
  onNewFile: () => Promise<void>;
  onPrint?: () => void;
  isEditing: boolean;
  isSaving: boolean;
  activeTabIndex: number;
}

export const useKeyBindings = ({
  onSave,
  onSaveAs,
  onDone,
  onNewFile,
  onPrint,
  isEditing,
  isSaving,
  activeTabIndex
}: KeyBindingProps) => {
  const { setEditing } = useVaultStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift (and CapsLock) change e.key's case, so compare lowercased (F-25)
      const key = e.key.toLowerCase();
      // Ctrl/Cmd + S: Save
      if ((e.ctrlKey || e.metaKey) && key === 's') {
        e.preventDefault();
        if (!isSaving) {
          if (e.shiftKey) {
            // Save As also works in reading mode (it saves the displayed file)
            if (activeTabIndex !== -1) onSaveAs();
          } else if (isEditing) {
            onSave();
          }
        }
      }
      
      // Ctrl/Cmd + E: Toggle Edit/Preview
      if ((e.ctrlKey || e.metaKey) && key === 'e') {
        e.preventDefault();
        if (activeTabIndex !== -1) {
          if (isEditing) {
            onDone();
          } else if (!useVaultStore.getState().loadError) {
            setEditing(true);
          }
        }
      }

      // Ctrl/Cmd + N: New File
      if ((e.ctrlKey || e.metaKey) && key === 'n') {
        e.preventDefault();
        onNewFile();
      }
      
      // Ctrl/Cmd + P: Print
      if ((e.ctrlKey || e.metaKey) && key === 'p') {
        e.preventDefault();
        if (!isEditing && onPrint) {
          onPrint();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, isSaving, activeTabIndex, onSave, onSaveAs, onDone, onNewFile, setEditing]);
};
