import React from 'react';
import { 
  Files, 
  Search, 
  Settings, 
  Folders,
  Star,
  ChevronRight,
  ChevronLeft,
  Sun,
  Moon
} from 'lucide-react';
import { useVaultStore } from '../store/useVaultStore';

interface LeftRibbonProps {
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  activeView: string;
  setActiveView: (view: string) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const LeftRibbon: React.FC<LeftRibbonProps> = ({ 
  isSidebarCollapsed, 
  onToggleSidebar,
  activeView,
  setActiveView,
  theme,
  onToggleTheme
}) => {
  const { setSettingsOpen } = useVaultStore();

  return (
    <aside className="left-ribbon">
      <div 
        className={`ribbon-item ${activeView === 'explorer' ? 'active' : ''}`}
        onClick={() => {
          setActiveView('explorer');
          if (isSidebarCollapsed) onToggleSidebar();
        }}
        title="Files"
      >
        <Folders size={20} />
      </div>

      <div 
        className={`ribbon-item ${activeView === 'search' ? 'active' : ''}`}
        onClick={() => {
          setActiveView('search');
          if (isSidebarCollapsed) onToggleSidebar();
        }}
        title="Search"
      >
        <Search size={20} />
      </div>

      <div 
        className={`ribbon-item ${activeView === 'bookmarks' ? 'active' : ''}`}
        onClick={() => {
          setActiveView('bookmarks');
          if (isSidebarCollapsed) onToggleSidebar();
        }}
        title="Bookmarks"
      >
        <Star size={20} />
      </div>

      <div className="ribbon-bottom">
        <div 
          className="ribbon-item" 
          onClick={onToggleTheme}
          title="Toggle Theme"
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </div>

        <div 
          className="ribbon-item" 
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          <Settings size={20} />
        </div>
        
      </div>
    </aside>
  );
};

