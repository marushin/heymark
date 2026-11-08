import React, { useRef, useEffect } from "react";
import { RotateCcw, X } from "lucide-react";
import { useVaultStore } from "../store/useVaultStore";

export const ViewerSettingsOverlay: React.FC = () => {
  const panelRef = useRef<HTMLDivElement>(null);
  const { 
    viewerSettings, 
    setViewerSettings, 
    resetViewerSettings, 
    isReadabilityOpen, 
    setReadabilityOpen 
  } = useVaultStore();

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setReadabilityOpen(false);
      }
    };

    if (isReadabilityOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isReadabilityOpen]);

  const handleChange = (key: keyof typeof viewerSettings, value: number) => {
    setViewerSettings({ [key]: value });
  };

  if (!isReadabilityOpen) return null;

  return (
    <div className="viewer-settings-panel global-readability-panel" ref={panelRef}>
      <div className="settings-panel-header">
        <h4>Readability</h4>
        <button className="icon-button" onClick={() => setReadabilityOpen(false)}>
          <X size={14} />
        </button>
      </div>

      <div className="viewer-setting-item">
        <div className="viewer-setting-label">
          <span>Letter Spacing (자간)</span>
          <span className="viewer-setting-value">{viewerSettings.letterSpacing}em</span>
        </div>
        <div className="viewer-setting-control">
          <input 
            type="range" 
            min="-0.05" 
            max="0.3" 
            step="0.005"
            value={viewerSettings.letterSpacing}
            onChange={(e) => handleChange('letterSpacing', parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="viewer-setting-item">
        <div className="viewer-setting-label">
          <span>Line Height (줄간격)</span>
          <span className="viewer-setting-value">{viewerSettings.lineHeight}</span>
        </div>
        <div className="viewer-setting-control">
          <input 
            type="range" 
            min="1.0" 
            max="2.5" 
            step="0.1"
            value={viewerSettings.lineHeight}
            onChange={(e) => handleChange('lineHeight', parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="viewer-setting-item">
        <div className="viewer-setting-label">
          <span>Horizontal Scale (장평)</span>
          <span className="viewer-setting-value">{Math.round(viewerSettings.fontScale * 100)}%</span>
        </div>
        <div className="viewer-setting-control">
          <input 
            type="range" 
            min="0.8" 
            max="1.2" 
            step="0.01"
            value={viewerSettings.fontScale}
            onChange={(e) => handleChange('fontScale', parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="settings-panel-footer">
        <button className="reset-btn" onClick={resetViewerSettings}>
          <RotateCcw size={14} /> Reset to Default
        </button>
      </div>
    </div>
  );
};
