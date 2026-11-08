import React from "react";
import { FileText, Star } from "lucide-react";
import { useVaultStore } from "../store/useVaultStore";

export const BookmarksView: React.FC = () => {
  const { 
    bookmarks, 
    toggleBookmark, 
    tabs,
    activeTabIndex, 
    safeSetFile 
  } = useVaultStore();

  const activePath = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  return (
    <>
      <div className="sidebar-header">
        <span>BOOKMARKS</span>
      </div>
      <div className="bookmarks-view">
        {bookmarks.length > 0 ? (
          <div className="bookmarks-list">
            {bookmarks.map((path) => (
              <div 
                key={path} 
                className={`bookmark-item ${path === activePath ? 'active' : ''}`}
                 onClick={() => safeSetFile(path)}
                title={path}
              >
                <button 
                  className="bookmark-btn active"
                  onClick={(e) => { e.stopPropagation(); toggleBookmark(path); }}
                  title="Remove Bookmark"
                >
                  <Star size={12} fill="var(--accent)" />
                </button>
                <FileText size={14} />
                <span className="file-name">{path.split(/[/\\]/).pop()}</span>
                <span className="file-path">{path.split(/[/\\]/).slice(-2, -1)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
            <Star size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p style={{ fontSize: '0.85rem' }}>No bookmarks yet.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>
              Star a file to keep it here.
            </p>
          </div>
        )}
      </div>
    </>
  );
};
