import React, { useState, useEffect, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { 
  X, 
  Minus, 
  Square, 
  Copy, 
  Edit3, 
  Save, 
  Loader2, 
  Search as SearchIcon,
  Type,
  XCircle,
  Printer,
  BookOpen,
  Eye
} from "lucide-react";
import { useVaultStore } from "../store/useVaultStore";
import { TabBar } from "./TabBar";

interface TitleBarProps {
  onSave: () => void;
  onSaveAs: () => void;
  onDone: () => void;
  onEdit: () => void;
  onPrint?: () => void;
  isSaving: boolean;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  onSave,
  onSaveAs,
  onDone,
  onEdit,
  onPrint,
  isSaving,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
  const modKey = isMac ? '⌘' : 'Ctrl+';
  // getCurrentWindow() returns a new object on every call; memoize it so the effect below
  // does not re-subscribe on every render (F-21).
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const { 
    isEditing, 
    activeTabIndex, 
    isReadabilityOpen, 
    setReadabilityOpen,
    tabs,
    closeAllTabs,
    loadError
  } = useVaultStore();

  useEffect(() => {
    const updateMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };

    updateMaximized();

    const unlisten = appWindow.onResized(() => {
      updateMaximized();
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [appWindow]);

  const handleMinimize = () => appWindow.minimize();
  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
    setIsMaximized(await appWindow.isMaximized());
  };
  const handleClose = () => appWindow.close();

  const handleDrag = (e: React.MouseEvent) => {
    if (e.button === 0) {
      appWindow.startDragging();
    }
  };

  return (
    <div 
      className="title-bar" 
      data-tauri-drag-region 
      onMouseDown={handleDrag}
    >
      <div className="title-bar-left">
        {isMac && (
          <div className="mac-traffic-lights" onMouseDown={(e) => e.stopPropagation()}>
            <button 
              className="mac-traffic-light mac-close" 
              onClick={(e) => { e.stopPropagation(); handleClose(); }} 
              title="Close"
            />
            <button 
              className="mac-traffic-light mac-minimize" 
              onClick={(e) => { e.stopPropagation(); handleMinimize(); }} 
              title="Minimize"
            />
            <button 
              className="mac-traffic-light mac-maximize" 
              onClick={(e) => { e.stopPropagation(); handleMaximize(); }} 
              title={isMaximized ? "Restore" : "Maximize"}
            />
          </div>
        )}
      </div>
      
      <div className="title-bar-center">
        <TabBar />
        {tabs.length > 0 && (
          <button 
            className="close-all-tabs-btn"
            onClick={(e) => { e.stopPropagation(); closeAllTabs(); }}
            onMouseDown={(e) => e.stopPropagation()}
            title="Close All Tabs"
          >
            <XCircle size={14} />
          </button>
        )}
      </div>

      <div className="title-bar-right">
        {activeTabIndex !== -1 && (
          <div className="title-actions">
            {/* Search (Ctrl/Cmd+F) */}
            <button 
              className="title-action-btn"
              onClick={(e) => { 
                e.stopPropagation(); 
                if (!isEditing) {
                  onEdit();
                }
                useVaultStore.getState().setEditorSearchOpen(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!!loadError}
              title={`Search (${modKey}F)`}
            >
              <SearchIcon size={14} />
            </button>

            {/* Readability Settings */}
            <button 
              className={`title-action-btn ${isReadabilityOpen ? 'active' : ''}`}
              onClick={(e) => { e.stopPropagation(); setReadabilityOpen(!isReadabilityOpen); }}
              onMouseDown={(e) => e.stopPropagation()}
              title="Readability Settings"
            >
              <Type size={14} />
            </button>

            {/* Save As */}
            <button 
              className="title-action-btn" 
              onClick={(e) => { e.stopPropagation(); onSaveAs(); }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={isSaving || !!loadError}
              title={`Save As (${isMac ? '⇧⌘S' : 'Ctrl+Shift+S'})`}
            >
              <Save size={14} />
            </button>

            {/* Export to PDF */}
            {!isEditing && onPrint && (
              <button 
                className="title-action-btn" 
                onClick={(e) => { e.stopPropagation(); onPrint(); }}
                onMouseDown={(e) => e.stopPropagation()}
                title={`Export to PDF (${modKey}P)`}
              >
                <Printer size={14} />
              </button>
            )}

            {/* Edit / Read View Toggle */}
            <button 
              className={`title-action-btn ${isEditing ? 'active' : ''}`}
              onClick={(e) => { 
                e.stopPropagation(); 
                if (isEditing) {
                  onDone();
                } else {
                  onEdit();
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={!!loadError && !isEditing}
              title={isEditing ? `Reading View (${modKey}E)` : `Editing View (${modKey}E)`}
            >
              {isEditing ? <BookOpen size={14} /> : <Edit3 size={14} />}
            </button>
          </div>
        )}

        {!isMac && (
          <div className="window-controls">
            <button 
              className="title-bar-button" 
              onClick={(e) => { e.stopPropagation(); handleMinimize(); }} 
              onMouseDown={(e) => e.stopPropagation()}
              title="Minimize"
            >
              <Minus size={14} />
            </button>
            <button 
              className="title-bar-button" 
              onClick={(e) => { e.stopPropagation(); handleMaximize(); }} 
              onMouseDown={(e) => e.stopPropagation()}
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? <Copy size={12} /> : <Square size={12} />}
            </button>
            <button 
              className="title-bar-button close" 
              onClick={(e) => { e.stopPropagation(); handleClose(); }} 
              onMouseDown={(e) => e.stopPropagation()}
              title="Close"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
