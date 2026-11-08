import React, { useRef, useEffect } from "react";
import { X, FileText } from "lucide-react";
import { useVaultStore } from "../store/useVaultStore";

export const TabBar: React.FC = () => {
  const { 
    tabs, 
    activeTabIndex, 
    safeSetTab, 
    safeCloseTab, 
  } = useVaultStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && activeTabIndex !== -1) {
      const activeTab = scrollRef.current.children[activeTabIndex] as HTMLElement;
      if (activeTab) {
        activeTab.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }
    }
  }, [activeTabIndex]);

  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar" ref={scrollRef}>
      {tabs.map((path, index) => {
        const fileName = path.split(/[/\\]/).pop() || "Untitled";
        const isActive = index === activeTabIndex;

        return (
          <div
            key={`${path}-${index}`}
            className={`tab ${isActive ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (isActive) return;
              safeSetTab(index);
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <FileText size={12} className="tab-icon" />
            <span className="tab-name" title={path}>{fileName}</span>
            <button
              className="tab-close"
              onClick={(e) => {
                e.stopPropagation();
                safeCloseTab(index);
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
