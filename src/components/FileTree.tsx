import React from "react";
import { Folder, FileText, ChevronRight, ChevronDown, Star } from "lucide-react";
import { useVaultStore } from "../store/useVaultStore";
import { FileNode } from "../types/tauri";

interface FilteredFileNode extends FileNode {
  forceOpen?: boolean;
  children?: FilteredFileNode[];
}

const TreeItem: React.FC<{ node: FilteredFileNode; depth: number; forceOpen?: boolean }> = ({ node, depth, forceOpen }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const { 
    safeSetFile,
    tabs, 
    activeTabIndex, 
    searchQuery, 
    toggleBookmark, 
    bookmarks,
  } = useVaultStore();

  // Automatically open folders when searching
  React.useEffect(() => {
    if (searchQuery && forceOpen) {
      setIsOpen(true);
    }
  }, [searchQuery, forceOpen]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleSelect = () => {
    if (!node.is_dir) {
      safeSetFile(node.path);
    } else {
      setIsOpen(!isOpen);
    }
  };

  const handleToggleBookmark = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleBookmark(node.path);
  };

  const activePath = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
  const isActive = activePath === node.path;

  return (
    <div className="tree-item-container">
      <div 
        className={`tree-item ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={handleSelect}
      >
        {!node.is_dir ? (
          <button 
            className={`bookmark-btn ${bookmarks.includes(node.path) ? 'active' : ''}`}
            onClick={handleToggleBookmark}
            title={bookmarks.includes(node.path) ? "Remove Bookmark" : "Add Bookmark"}
          >
            <Star size={12} fill={bookmarks.includes(node.path) ? "var(--accent)" : "none"} />
          </button>
        ) : (
          <div className="bookmark-spacer" />
        )}
        <span className="icon-container">
          {node.is_dir ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <FileText size={14} style={{ opacity: 0.6 }} />
          )}
        </span>
        <span className="file-name">{node.name}</span>
      </div>
      
      {node.is_dir && isOpen && node.children && (
        <div className="tree-children">
          {node.children.map((child, i) => (
            <TreeItem key={i} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const FileTree: React.FC<{ tree: FileNode[]; rootPath: string }> = ({ tree, rootPath }) => {
  const { searchQuery } = useVaultStore();

  const filterTree = (nodes: FileNode[], query: string): FilteredFileNode[] => {
    if (!query) return nodes as FilteredFileNode[];
    
    return nodes.reduce((acc: FilteredFileNode[], node) => {
      const matchSelf = node.name.toLowerCase().includes(query.toLowerCase());
      const filteredChildren = node.children ? filterTree(node.children, query) : undefined;
      const hasMatchingChildren = filteredChildren && filteredChildren.length > 0;
      if (matchSelf || hasMatchingChildren) {
        acc.push({
          ...node,
          children: filteredChildren,
          forceOpen: true 
        });
      }
      return acc;
    }, []);
  };

  const filteredTree = filterTree(tree, searchQuery);

  return (
    <div className="file-tree-root">
      {filteredTree.map((node, i) => (
        <TreeItem key={i} node={node} depth={0} forceOpen={node.forceOpen} />
      ))}
    </div>
  );
};
