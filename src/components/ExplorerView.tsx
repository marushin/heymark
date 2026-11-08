import React, { useState } from "react";
import { ChevronDown, ChevronRight, Eraser, FilePlus, FileText, FolderOpen, Star, X } from "lucide-react";
import { useVaultStore } from "../store/useVaultStore";
import { FileTree } from "./FileTree";

// Individual vault section component for easier state management per-folder
const FolderSection: React.FC<{ 
  path: string; 
  name: string; 
  tree: any[]; 
  onClose: (path: string) => void 
}> = ({ path, name, tree, onClose }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="explorer-section">
      <div 
        className="explorer-section-header group"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="header-label">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate">{name.toUpperCase()}</span>
        </div>
        <button 
          className="icon-button x-small opacity-0 group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onClose(path); }}
          title="Close Folder"
        >
          <X size={12} />
        </button>
      </div>
      {isExpanded && <FileTree tree={tree} rootPath={path} />}
    </div>
  );
};

export const ExplorerView: React.FC<{
  handleNewFile: () => void;
  handleOpenFile: () => void;
  handleOpenVault: () => void;
  handleResetExplorer: () => void;
}> = ({ handleNewFile, handleOpenFile, handleOpenVault, handleResetExplorer }) => {
  const { 
    vaults, 
    tabs, 
    activeTabIndex, 
    safeSetFile,
    bookmarks,
    toggleBookmark,
    searchQuery,
    removeVault
  } = useVaultStore();

  const [isOpenFilesExpanded, setIsOpenFilesExpanded] = useState(true);

  // Filter tabs for the single-file-list
  const filteredTabs = tabs.filter(path => 
    path.split(/[/\\]/).pop()?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="sidebar-header">
        <span>EXPLORER</span>
        <div className="header-actions-mini">
          <button className="icon-button" onClick={handleNewFile} title="New File">
            <FilePlus size={14} />
          </button>
          <button className="icon-button" onClick={handleOpenFile} title="Open File">
            <FileText size={14} />
          </button>
          <button className="icon-button" onClick={handleOpenVault} title="Open Folder">
            <FolderOpen size={14} />
          </button>
          <div className="header-divider"></div>
          <button className="icon-button" onClick={handleResetExplorer} title="Clear All">
            <Eraser size={14} />
          </button>
        </div>
      </div>

      <div className="file-tree-container">
        {/* Open Files Section */}
        {tabs.length > 0 && (
          <div className="explorer-section">
            <div 
              className="explorer-section-header" 
              onClick={() => setIsOpenFilesExpanded(!isOpenFilesExpanded)}
            >
              <div className="header-label">
                {isOpenFilesExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span>OPEN FILES</span>
              </div>
            </div>
            {isOpenFilesExpanded && (
              <div className="single-file-list">
                {filteredTabs.map((path) => {
                  const index = tabs.indexOf(path);
                  return (
                    <div 
                      key={path} 
                      className={`file-node ${index === activeTabIndex ? 'active' : ''}`}
                      onClick={() => safeSetFile(path)}
                    >
                      <button 
                        className={`bookmark-btn ${bookmarks.includes(path) ? 'active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleBookmark(path); }}
                        title={bookmarks.includes(path) ? "Remove Bookmark" : "Add Bookmark"}
                      >
                        <Star size={12} fill={bookmarks.includes(path) ? "var(--accent)" : "none"} />
                      </button>
                      <FileText size={14} />
                      <span className="file-name">{path.split(/[/\\]/).pop()}</span>
                      <span className="file-path">{path.split(/[/\\]/).slice(-2, -1)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Folders Sections */}
        {vaults.map((vault) => (
          <FolderSection 
            key={vault.path}
            path={vault.path}
            name={vault.name}
            tree={vault.tree}
            onClose={removeVault}
          />
        ))}
      </div>
    </>
  );
};
