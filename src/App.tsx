import React, { useState, useEffect, useRef } from "react";
import { 
  ChevronLeft, 
  ChevronRight
} from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useVaultStore } from "./store/useVaultStore";
import { MarkdownViewer } from "./components/MarkdownViewer";
import { MarkdownEditor } from "./components/MarkdownEditor";
import { PlainTextEditor } from "./components/PlainTextEditor";
import { TitleBar } from "./components/TitleBar";
import { SettingsModal } from "./components/SettingsModal";
import { LeftRibbon } from "./components/LeftRibbon";
import { Footer } from "./components/Footer";
import { ViewerSettingsOverlay } from "./components/ViewerSettingsOverlay";
import { ConfirmModal } from "./components/ConfirmModal";
import { ExplorerView } from "./components/ExplorerView";
import { SearchView } from "./components/SearchView";
import { BookmarksView } from "./components/BookmarksView";
import sidebarLogo from "./assets/sidebar-logo.webp";
import { useAppEvents, openInitialArgs } from "./hooks/useAppEvents";
import { isMarkdownPath } from "./lib/pathUtils";
import { useKeyBindings } from "./hooks/useKeyBindings";

const App: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeView, setActiveView] = useState('explorer');
  const viewerScrollerRef = useRef<HTMLDivElement>(null);

  const { 
    vaultPaths, 
    setVaultPath, 
    tabs, 
    activeTabIndex, 
    safeSetFile,
    isEditing,
    setEditing,
    saveActiveFile,
    saveActiveFileAs,
    fileContent,
    editContent,
    createNewFile,
    showConfirm,
    scrollPosition,
    setScrollPosition,
    initialize,
    theme,
    setTheme,
    resetExplorer,
    showSidebarLogo
  } = useVaultStore();

  const activePath = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  // Hooks for side effects and event handling
  useAppEvents();

  const handleSave = async () => {
    setIsSaving(true);
    const ok = await saveActiveFile();
    if (ok) {
      await setEditing(false);
    } else {
      showConfirm({
        title: "저장 실패",
        message: `${activePath ?? ""} 파일을 저장하지 못했습니다. 편집 내용은 그대로 유지됩니다.`,
      });
    }
    // Brief delay to show "Saving..." effect; leaving edit mode must not wait for it (F-05)
    setTimeout(() => setIsSaving(false), 400);
  };

  const handleSaveAs = async () => {
    try {
      const selected = await save({
        title: "Save As",
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'All Files', extensions: ['md', 'txt', 'json'] }
        ],
        defaultPath: activePath || vaultPaths[0] || undefined
      });

      if (selected) {
        setIsSaving(true);
        const ok = await saveActiveFileAs(selected);
        if (ok) await setEditing(false);
        setTimeout(() => setIsSaving(false), 400);
      }
    } catch (e) {
      console.error("Failed to save as:", e);
    }
  };

  const handleDone = () => {
    setEditing(false);
  };
  
  const handlePrint = () => {
    window.print();
  };

  const handleOpenVault = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (selected && typeof selected === 'string') {
      await setVaultPath(selected);
    }
  };

  const handleNewFile = async () => {
    try {
      const selected = await save({
        title: "Create New File",
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: 'Text', extensions: ['txt'] },
          { name: 'JSON', extensions: ['json'] }
        ],
        defaultPath: vaultPaths[0] || undefined
      });

      if (selected) {
        await createNewFile(selected);
      }
    } catch (e) {
      console.error("Failed to open save dialog or create file:", e);
    }
  };

  const handleOpenFile = async () => {
    const selected = await open({
      directory: false,
      multiple: true,
      filters: [
        { name: 'All Supported', extensions: ['md', 'txt', 'json'] },
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'JSON', extensions: ['json'] }
      ]
    });
    if (Array.isArray(selected)) {
      for (const path of selected) {
        await safeSetFile(path);
      }
    } else if (selected) {
      await safeSetFile(selected);
    }
  };

  useKeyBindings({
    onSave: handleSave,
    onSaveAs: handleSaveAs,
    onDone: handleDone,
    onNewFile: handleNewFile,
    onPrint: handlePrint,
    isEditing,
    isSaving,
    activeTabIndex
  });

  useEffect(() => {
    // Restore the previous session first, then open files passed on the command line (F-07).
    // `initialize` is idempotent, so StrictMode double-invocation is harmless.
    initialize()
      .catch((e) => console.error("Initialization failed:", e))
      .finally(() => { void openInitialArgs(); });
  }, [initialize]);

  useEffect(() => {
    // Apply initial skin and theme from store
    const { skin, theme } = useVaultStore.getState();
    document.documentElement.setAttribute('data-skin', skin);
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  // Restore viewer scroll position when switching to preview
  useEffect(() => {
    if (!isEditing && viewerScrollerRef.current && scrollPosition > 0) {
      const el = viewerScrollerRef.current;
      // Use a small delay to allow content to render
      setTimeout(() => {
        el.scrollTop = scrollPosition * (el.scrollHeight - el.clientHeight);
      }, 50);
    }
  }, [isEditing, activeTabIndex]);

  const handleViewerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isEditing) return;
    const el = e.currentTarget;
    const progress = el.scrollTop / (el.scrollHeight - el.clientHeight);
    if (!isNaN(progress)) {
      setScrollPosition(progress);
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  return (
    <>
      <TitleBar 
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onDone={handleDone}
        onEdit={() => setEditing(true)}
        onPrint={handlePrint}
        isSaving={isSaving}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <div className="layout-container">
        <LeftRibbon 
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          activeView={activeView}
          setActiveView={setActiveView}
          theme={theme}
          onToggleTheme={toggleTheme}
        />

        {/* Sidebar */}
        <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          {!isSidebarCollapsed && (
            <div className="sidebar-content">
              {activeView === 'explorer' && (
                <ExplorerView 
                  handleNewFile={handleNewFile}
                  handleOpenFile={handleOpenFile}
                  handleOpenVault={handleOpenVault}
                  handleResetExplorer={resetExplorer}
                />
              )}

              {activeView === 'search' && <SearchView />}

              {activeView === 'bookmarks' && <BookmarksView />}
            </div>
          )}
          {!isSidebarCollapsed && showSidebarLogo && (
            <div className="sidebar-brand-mark">
              <img src={sidebarLogo} alt="" />
            </div>
          )}
        </aside>

        <div 
          className={`sidebar-toggle-handle ${isSidebarCollapsed ? 'collapsed' : ''}`}
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </div>

      {/* Main Viewer */}
      <main className="main-viewer">
        <section 
          ref={viewerScrollerRef}
          className={`viewer-content ${isEditing ? 'editing' : ''}`}
          onScroll={handleViewerScroll}
        >
          {isEditing ? (
            isMarkdownPath(activePath) ? <MarkdownEditor /> : <PlainTextEditor />
          ) : (
            <div className="markdown-container">
              <MarkdownViewer />
            </div>
          )}
        </section>
      </main>
      </div>
      <Footer />
      <ViewerSettingsOverlay />
      <SettingsModal />
      <ConfirmModal />
    </>
  );
};

export default App;
