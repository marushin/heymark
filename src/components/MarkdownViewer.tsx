import React, { useEffect, useState, useRef, useCallback } from "react";
import { useVaultStore } from "../store/useVaultStore";
import { renderMarkdown } from "../lib/markdown";
import { open } from "@tauri-apps/plugin-shell";
import { safeDecode } from "../lib/pathUtils";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const MarkdownViewer: React.FC = () => {
  const { 
    fileContent, 
    editContent, 
    isEditing, 
    tabs, 
    activeTabIndex, 
    safeSetFile, 
    vaults, 
    viewerSettings, 
    skin,
    loadError
  } = useVaultStore();
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');
  const [isLoading, setIsLoading] = useState(false);
  
  const lastPathRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderVersionRef = useRef(0);
  
  const findFile = useCallback((name: string): string | null => {
    const lowerName = name.toLowerCase().replace(/\\/g, '/');
    const searchNames = [
      lowerName,
      lowerName.endsWith('.md') ? lowerName : (lowerName + '.md'),
      lowerName.endsWith('.txt') ? lowerName : (lowerName + '.txt'),
      lowerName.endsWith('.json') ? lowerName : (lowerName + '.json')
    ];
    
    const searchInNodes = (nodes: any[]): string | null => {
      for (const node of nodes) {
        const nodeName = node.name.toLowerCase();
        const nodePath = node.path.toLowerCase().replace(/\\/g, '/');
        
        // Match whole path segments only: [[note]] must not resolve to footnote.md (F-17)
        if (!node.is_dir && searchNames.some(sn => nodeName === sn || nodePath.endsWith('/' + sn))) {
          return node.path;
        }
        if (node.is_dir && node.children) {
          const found = searchInNodes(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    for (const vault of vaults) {
      const found = searchInNodes(vault.tree);
      if (found) return found;
    }
    
    return null;
  }, [vaults]);

  // Sync theme with document attribute
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
          const newTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' || 'dark';
          setCurrentTheme(newTheme);
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    
    // Initial theme
    const initialTheme = document.documentElement.getAttribute('data-theme') as 'light' | 'dark' || 'dark';
    setCurrentTheme(initialTheme);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const activePath = activeTabIndex >= 0 ? tabs[activeTabIndex] : null;
    
    // Detect file switch
    if (activePath !== lastPathRef.current) {
      setRenderedHtml("");
      setIsLoading(true);
      lastPathRef.current = activePath;
    }

    const updateRender = async () => {
      const version = ++renderVersionRef.current;
      const displayContent = isEditing ? editContent : fileContent;
      
      try {
        if (displayContent) {
          let processedContent = displayContent;
          
          // Pretty-print JSON if it's a .json file
          if (activePath?.toLowerCase().endsWith('.json')) {
            if (displayContent.length > 500000) {
              processedContent = `<div class="large-file-warning">File too large for syntax highlighting. Showing raw text.</div>\n\`\`\`text\n${displayContent.substring(0, 50000)}...\n\`\`\``;
            } else {
              try {
                const parsed = JSON.parse(displayContent);
                const formatted = JSON.stringify(parsed, null, 2);
                processedContent = `\`\`\`json\n${formatted}\n\`\`\``;
              } catch (e) {
                processedContent = `\`\`\`json\n${displayContent}\n\`\`\``;
              }
            }
          } else if (activePath?.toLowerCase().endsWith('.svg')) {
            // For SVG files, ensure the content is treated as HTML/SVG
            // Ensure no markdown interference by wrapping in a div if necessary, 
            // but keep it raw so markdown-it renders it as HTML.
            processedContent = displayContent;
          }
          
          const html = await renderMarkdown(processedContent, currentTheme, skin, activePath);
          
          if (version === renderVersionRef.current) {
            setRenderedHtml(html);
          }
        } else {
          if (version === renderVersionRef.current) {
            setRenderedHtml("");
          }
        }
      } catch (error) {
        console.error("Rendering error:", error);
        if (version === renderVersionRef.current) {
          setRenderedHtml(`<div class="render-error"><h3>Render Error</h3><p>${escapeHtml(String(error))}</p></div>`);
        }
      } finally {
        if (version === renderVersionRef.current) {
          setIsLoading(false);
        }
      }
    };

    // Debounce: 300ms if editing, immediate if not
    if (debounceRef.current) clearTimeout(debounceRef.current);
    
    if (isEditing) {
      debounceRef.current = setTimeout(updateRender, 300);
    } else {
      updateRender();
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fileContent, editContent, isEditing, activeTabIndex, tabs, currentTheme, skin]);

  if (activeTabIndex === -1) {
    return (
      <div className="viewer-empty">
        <h3>Select a file to begin</h3>
        <p>Or open a new local folder as a vault.</p>
      </div>
    );
  }

  // The file could not be read (missing, locked, or not UTF-8). Show why instead of
  // rendering anything that could later be saved over the original (F-02).
  if (loadError) {
    return (
      <div className="viewer-load-error">
        <h3>파일을 읽을 수 없습니다</h3>
        <p>{tabs[activeTabIndex]}</p>
        <p>{loadError}</p>
        <p>UTF-8이 아닌 인코딩(예: CP949), 삭제/이동된 파일, 동기화 잠금이 흔한 원인입니다. 원본 파일은 변경되지 않았습니다.</p>
      </div>
    );
  }

  if (tabs.length > 0 && isLoading && renderedHtml === "") {
    return (
      <div className="viewer-loading">
        <div className="loader"></div>
        <p>Rendering content...</p>
      </div>
    );
  }

  const handleLinkClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    
    if (anchor) {
      const href = anchor.getAttribute('href');
      const isWikilink = anchor.getAttribute('data-wikilink') === 'true';
      const wikilinkPath = anchor.getAttribute('data-path');



      if (isWikilink && wikilinkPath) {
        e.preventDefault();
        const fullPath = findFile(wikilinkPath);
        if (fullPath) {
          await safeSetFile(fullPath);
        }
        return;
      }

      if (href) {
        if (href.startsWith('http://') || href.startsWith('https://')) {
          e.preventDefault();
          try {
            await open(href);
          } catch (err) {
            console.error("Failed to open external link:", err);
          }
        } else if (href.startsWith('#')) {
          e.preventDefault();
          const id = href.substring(1);
          const element = document.getElementById(id);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        } else {
          // Likely a relative file link
          e.preventDefault();
          const fullPath = findFile(safeDecode(href));
          if (fullPath) {
            await safeSetFile(fullPath);
          }
        }
      }
    }
  };

  return (
    <div className="markdown-viewer-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div 
        className="markdown-body" 
        onClick={handleLinkClick}
        dangerouslySetInnerHTML={{ __html: renderedHtml }} 
        style={{
          ['--viewer-letter-spacing' as any]: `${viewerSettings?.letterSpacing ?? 0}em`,
          ['--viewer-line-height' as any]: viewerSettings?.lineHeight ?? 1.6,
          ['--viewer-font-scale' as any]: viewerSettings?.fontScale ?? 1.0,
        }}
      />
    </div>
  );
};
