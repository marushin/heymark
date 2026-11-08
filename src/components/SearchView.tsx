import React from "react";
import { FileText, Search, Star } from "lucide-react";
import { useVaultStore } from "../store/useVaultStore";

export const SearchView: React.FC = () => {
  const { 
    tabs, 
    activeTabIndex, 
    searchQuery, 
    setSearchQuery, 
    safeSetFile,
    bookmarks,
    toggleBookmark
  } = useVaultStore();

  // Filter tabs for search results
  const filteredTabs = tabs.filter(path => 
    path.split(/[/\\]/).pop()?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <div className="sidebar-header">
        <span>SEARCH</span>
      </div>
      <div className="search-bar">
        <Search size={14} color="var(--text-muted)" />
        <input 
          type="text" 
          placeholder="Search files..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="search-results">
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
      </div>
    </>
  );
};
