import React from "react";
import { useVaultStore } from "../store/useVaultStore";

/**
 * Editor for non-markdown files (.txt, .json). The WYSIWYG editor re-serializes the whole
 * document as markdown, which corrupts such files (F-04), so they are edited as plain text.
 */
export const PlainTextEditor: React.FC = () => {
  const editContent = useVaultStore((s) => s.editContent);
  const updateEditContent = useVaultStore((s) => s.updateEditContent);

  return (
    <div className="markdown-editor-wrapper">
      <textarea
        className="plain-text-editor"
        value={editContent}
        onChange={(e) => updateEditContent(e.target.value)}
        spellCheck={false}
        autoFocus
      />
    </div>
  );
};
