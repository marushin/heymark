import React, { useEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useVaultStore } from "../store/useVaultStore";
import { insert } from "@milkdown/kit/utils";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { Image as ImageIcon } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { AIFloatingMenu } from "./AIFloatingMenu";
import {
  prepareMarkdownForEditor,
  cleanMarkdownFromEditor,
  splitFrontmatter,
  toAssetUrl,
} from "../lib/editorMarkdown";
import { parentDirOf, safeDecode } from "../lib/pathUtils";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

// Re-exported for existing imports/tests; the implementations live in lib/editorMarkdown.
export { prepareMarkdownForEditor, cleanMarkdownFromEditor };

const EditorInner: React.FC<{ crepeRef: React.MutableRefObject<Crepe | null> }> = ({ crepeRef }) => {
  const editContent = useVaultStore((s) => s.editContent);
  const updateEditContent = useVaultStore((s) => s.updateEditContent);
  const handleImageUpload = useVaultStore((s) => s.handleImageUpload);
  const activePath = useVaultStore((s) => s.editPath);

  // The editor only sees the body; the YAML frontmatter is kept aside and re-attached on
  // every change, because the commonmark preset would mangle it (F-04). This component is
  // remounted per file (key={activePath} in MarkdownEditor), so capturing it once is correct.
  const frontmatterRef = useRef<string | null>(null);
  if (frontmatterRef.current === null) {
    frontmatterRef.current = splitFrontmatter(editContent).frontmatter;
  }

  useEditor((root) => {
    const { body } = splitFrontmatter(editContent);
    const preparedContent = prepareMarkdownForEditor(body, activePath);

    const crepe = new Crepe({
      root,
      defaultValue: preparedContent,
      featureConfigs: {
        [Crepe.Feature.ImageBlock]: {
          onUpload: async (file: File) => {
            const link = await handleImageUpload(file);
            if (link) {
              // handleImageUpload returns "![name](assets/name.png)"
              // Extract the relative src and convert to Tauri asset URL
              const match = link.match(/!\[.*?\]\((.*?)\)/);
              const relativeSrc = match ? safeDecode(match[1]) : '';

              // Build absolute path for Tauri asset protocol
              const parentDir = activePath ? parentDirOf(activePath) : null;
              if (parentDir !== null && relativeSrc) {
                return toAssetUrl(`${parentDir}/${relativeSrc}`);
              }
              return relativeSrc;
            }
            return '';
          },
        },
      },
    });

    crepe.editor.config((ctx) => {
      ctx.update(uploadConfig.key, (prev) => ({
        ...prev,
        // Let the upload plugin handle pasted images that arrive with an HTML flavour too,
        // so there is exactly one paste path (F-15).
        enableHtmlFileUploader: true,
        uploader: async (files, schema) => {
          const images = Array.from(files).filter(file => file.type.includes('image'));

          return await Promise.all(
            images.map(async (image) => {
              const link = await handleImageUpload(image);
              if (link) {
                const match = link.match(/!\[.*?\]\((.*?)\)/);
                const relativeSrc = match ? match[1] : link;

                const preparedSrc = prepareMarkdownForEditor(`![alt](${relativeSrc})`, activePath);
                const srcMatch = preparedSrc.match(/!\[.*?\]\((.*?)\)/);
                const finalSrc = srcMatch ? srcMatch[1] : relativeSrc;

                return schema.nodes.image.createAndFill({
                  src: finalSrc,
                  alt: image.name
                })!;
              }
              return schema.nodes.image.createAndFill({
                src: "",
                alt: image.name
              })!;
            })
          );
        }
      }));
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown, prevMarkdown) => {
        if (markdown !== prevMarkdown) {
          const cleaned = (frontmatterRef.current ?? "") + cleanMarkdownFromEditor(markdown, activePath);
          updateEditContent(cleaned);
        }
      });
    });

    crepeRef.current = crepe;
    return crepe;
  }, [updateEditContent, activePath, handleImageUpload]);

  return <Milkdown />;
};

interface SelectionSnapshot {
  from: number;
  to: number;
  doc: ProseNode;
}

export const MarkdownEditor: React.FC = () => {
  const handleImageUpload = useVaultStore((s) => s.handleImageUpload);
  const activePath = useVaultStore((s) => s.editPath);
  const viewerSettings = useVaultStore((s) => s.viewerSettings);
  const crepeRef = useRef<Crepe | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [aiPosition, setAiPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    const handleSelectionChange = () => {
      // If focus is inside the AI menu (e.g., typing in the prompt input), do not close the menu
      if (document.activeElement && document.activeElement.closest('.ai-floating-menu')) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setAiPosition(null);
        setSelectedText("");
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        setAiPosition(null);
        setSelectedText("");
        return;
      }

      if (wrapperRef.current && wrapperRef.current.contains(selection.anchorNode)) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          setSelectedText(text);
          setAiPosition({
            top: rect.bottom,
            left: rect.left
          });
        } catch (e) {
          // Range might be invalid
        }
      } else {
        setAiPosition(null);
        setSelectedText("");
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  /** Selection range and document at the moment an AI request starts (F-19). */
  const getSnapshot = (): SelectionSnapshot | null => {
    const crepe = crepeRef.current;
    if (!crepe) return null;
    let snap: SelectionSnapshot | null = null;
    crepe.editor.action((ctx) => {
      const { state } = ctx.get(editorViewCtx);
      snap = { from: state.selection.from, to: state.selection.to, doc: state.doc };
    });
    return snap;
  };

  /** Replace the captured range, but only if the document is unchanged since the request. */
  const handleReplace = (newText: string, snapshot: SelectionSnapshot | null): boolean => {
    let applied = false;
    const crepe = crepeRef.current;
    if (crepe && newText && snapshot) {
      crepe.editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        if (!view.state.doc.eq(snapshot.doc)) return;
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(view.state.doc, snapshot.from, snapshot.to)
          )
        );
        insert(newText)(ctx);
        applied = true;
      });
    }
    setAiPosition(null);
    setSelectedText("");
    return applied;
  };

  const handleClose = () => {
    setAiPosition(null);
    setSelectedText("");
  };

  /** Copy an image into assets/ and insert it at the cursor. */
  const insertImageFromPath = async (path: string) => {
    const link = await handleImageUpload(path);
    if (link && crepeRef.current) {
      const preparedLink = prepareMarkdownForEditor(link, activePath);
      crepeRef.current.editor.action(insert(preparedLink));
    }
  };

  const handleImageInsert = async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{
        name: 'Image',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
      }]
    });

    if (selected && typeof selected === 'string') {
      await insertImageFromPath(selected);
    }
  };

  // Images dropped from the OS arrive as a Tauri drag-drop event (useAppEvents), not as an
  // HTML5 drop, so they are forwarded here (F-15).
  useEffect(() => {
    const onInsertImage = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string") void insertImageFromPath(path);
    };
    window.addEventListener("heymark:insert-image", onInsertImage);
    return () => window.removeEventListener("heymark:insert-image", onInsertImage);
  });

  return (
    <div
      ref={wrapperRef}
      className="markdown-editor-wrapper"
      style={{
        position: "relative",
        height: "100%",
        overflowY: "auto",
        ['--viewer-letter-spacing' as any]: `${viewerSettings?.letterSpacing ?? 0}em`,
        ['--viewer-line-height' as any]: viewerSettings?.lineHeight ?? 1.6,
        ['--viewer-font-scale' as any]: viewerSettings?.fontScale ?? 1.0,
      }}
    >
      <div className="editor-toolbar-mini">
        <button
          className="editor-toolbar-btn"
          onClick={handleImageInsert}
          title="Insert Image"
        >
          <ImageIcon size={16} />
        </button>
      </div>
      {/* Remount per file so the editor content always matches the file (F-08) */}
      <MilkdownProvider key={activePath ?? ""}>
        <EditorInner crepeRef={crepeRef} />
      </MilkdownProvider>
      <AIFloatingMenu
        position={aiPosition}
        selectedText={selectedText}
        getSnapshot={getSnapshot}
        onReplace={handleReplace}
        onClose={handleClose}
      />
    </div>
  );
};
