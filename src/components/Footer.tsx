import React, { useEffect, useState } from 'react';
import { useVaultStore, LlmProvider } from '../store/useVaultStore';
import { Loader2, Zap, Cpu, Hash } from 'lucide-react';
import { getVersion } from '@tauri-apps/api/app';
import { open } from '@tauri-apps/plugin-shell';
import logo from '../assets/logo.png';

export const Footer: React.FC = () => {
  const [version, setVersion] = useState<string>('0.0.0');
  const { 
    apiStatus, 
    isProcessing, 
    checkApiStatus, 
    llmConfigs,
    activeLlmId,
    setActiveLlmId,
    activeTabIndex,
    tabs,
    saveError
  } = useVaultStore();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  
  const activeConfig = llmConfigs[activeLlmId];

  const activePath = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;

  /**
   * Compares two semantic versions.
   * Returns true if latest is strictly greater than current.
   */
  const isNewerVersion = (latest: string, current: string): boolean => {
    const lParts = latest.replace(/^v/, '').split('.').map(Number);
    const cParts = current.replace(/^v/, '').split('.').map(Number);
    
    for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
      const l = lParts[i] || 0;
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  };

  const checkUpdate = async (current: string) => {
    setIsCheckingUpdate(true);
    try {
      const response = await fetch('https://api.github.com/repos/marushin/heymark/releases/latest');
      if (!response.ok) {
        setIsCheckingUpdate(false);
        return;
      }
      
      const data = await response.json();
      const latest = data.tag_name; // e.g., "v1.0.1"
      
      if (isNewerVersion(latest, current)) {
        setLatestVersion(latest);
        setHasUpdate(true);
      } else {
        setHasUpdate(false);
      }
    } catch (e) {
      console.error("Failed to check for updates:", e);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    // Get app version
    getVersion().then(v => {
      setVersion(v);
      checkUpdate(v);
    }).catch(e => console.error("Failed to get version:", e));
    
    // Initial check
    checkApiStatus();
    
    // Check periodically for API status
    const apiInterval = setInterval(checkApiStatus, 30000);
    
    // Check for updates every 24 hours
    const updateInterval = setInterval(() => {
      getVersion().then(checkUpdate).catch(() => {});
    }, 86400000);

    return () => {
      clearInterval(apiInterval);
      clearInterval(updateInterval);
    };
  }, [activeLlmId]);

  const getStatusColor = () => {
    switch (apiStatus) {
      case 'connected': return '#4caf50';
      case 'disconnected': return '#f44336';
      case 'error': return '#ff9800';
      case 'checking': return '#9e9e9e';
      default: return '#9e9e9e';
    }
  };

  const getStatusLabel = () => {
    switch (apiStatus) {
      case 'connected': return 'API Connected';
      case 'disconnected': return 'API Disconnected';
      case 'error': return 'API Error';
      case 'checking': return 'Checking...';
      default: return 'Unknown';
    }
  };

  return (
    <footer className="app-footer">
      <div className="footer-left">
        <div className="footer-logo-container">
          <img src={logo} alt="hey, mark!" className="footer-logo-img" />
        </div>
        <span className="footer-app-name">hey, mark!</span>
        <div 
          className={`footer-version-info clickable ${isCheckingUpdate ? 'checking' : ''}`}
          onClick={() => !isCheckingUpdate && checkUpdate(version)}
          title="Click to check for updates"
        >
          {isCheckingUpdate ? <Loader2 size={10} className="spin" /> : <Hash size={10} />}
          <span>v{version}</span>
        </div>
        {hasUpdate && (
          <button 
            className="footer-update-link"
            onClick={() => open('https://github.com/marushin/heymark/releases/')}
            title="Click to visit releases page"
          >
            <span className="update-dot" />
            Install new version ({latestVersion})
          </button>
        )}
        {activePath && (
          <div className="footer-path-info">
             <span className="separator">/</span>
             <span className="path-text">{activePath.split(/[/\\]/).pop()}</span>
          </div>
        )}
        {saveError && (
          <span className="footer-save-error" title={saveError}>
            저장 실패: {saveError}
          </span>
        )}
      </div>

      <div className="footer-center">
        {isProcessing ? (
          <div className="working-indicator">
            <Loader2 size={12} className="spin" />
            <span>Working...</span>
          </div>
        ) : (
          <div className="api-selector-container">
             <button 
              className="api-dropdown-trigger" 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
             >
              <Cpu size={12} style={{ opacity: 0.5 }} />
              <span className="active-provider-name">
                {activeLlmId === 'local' ? 'Local AI' : activeLlmId.toUpperCase()}
              </span>
              <span className="model-name">{activeConfig.model}</span>
             </button>

             {isMenuOpen && (
               <>
                 <div className="menu-backdrop" onClick={() => setIsMenuOpen(false)} />
                 <div className="api-dropdown-menu">
                   {(Object.keys(llmConfigs) as LlmProvider[]).map(id => (
                     <button 
                      key={id}
                      className={`api-menu-item ${id === activeLlmId ? 'active' : ''}`}
                      onClick={() => {
                        setActiveLlmId(id);
                        setIsMenuOpen(false);
                      }}
                     >
                       <span className="id-label">{id === 'local' ? 'Local AI' : id.toUpperCase()}</span>
                       <span className="model-label">{llmConfigs[id].model}</span>
                     </button>
                   ))}
                 </div>
               </>
             )}
          </div>
        )}
      </div>

      <div className="footer-right">
        <div className="api-status-container" title={getStatusLabel()}>
          <div 
            className={`status-breather ${apiStatus === 'connected' ? 'pulsing' : ''}`}
            style={{ backgroundColor: getStatusColor() }}
          />
          <span className="status-label">{apiStatus.toUpperCase()}</span>
          <Zap size={10} style={{ marginLeft: '4px', opacity: 0.6 }} />
        </div>
      </div>
    </footer>
  );
};
