import React from "react";
import { useVaultStore } from "../store/useVaultStore";
import { AlertCircle, Save, Trash2, X } from "lucide-react";

export const ConfirmModal: React.FC = () => {
  const { skin, confirmModal, hideConfirm } = useVaultStore();

  if (!confirmModal.isOpen) return null;

  const handleConfirm = () => {
    if (confirmModal.onConfirm) confirmModal.onConfirm();
    hideConfirm();
  };

  const handleSaveAs = () => {
    if (confirmModal.onSaveAs) confirmModal.onSaveAs();
    hideConfirm();
  };

  const handleDiscard = () => {
    if (confirmModal.onDiscard) confirmModal.onDiscard();
    hideConfirm();
  };

  const handleCancel = () => {
    hideConfirm();
  };

  // Rendering logic that changes based on skin
  // This approach makes it easy to add new skins later
  return (
    <div className={`modal-overlay confirm-modal-overlay skin-${skin}`}>
      <div className="modal-content confirm-modal-content">
        {skin === 'norton' ? (
          /* Norton skin has a very specific "dialog box" look */
          <div className="norton-dialog">
            <div className="norton-dialog-header">{confirmModal.title}</div>
            <div className="norton-dialog-body">
              <p>{confirmModal.message}</p>
              <div className="norton-dialog-actions">
                {confirmModal.onConfirm && (
                  <button onClick={handleConfirm} className="norton-btn">
                    [ Save ]
                  </button>
                )}
                {confirmModal.onSaveAs && (
                  <button onClick={handleSaveAs} className="norton-btn">
                    [ SaveAs ]
                  </button>
                )}
                {confirmModal.onDiscard && (
                  <button onClick={handleDiscard} className="norton-btn">
                    [ Discard ]
                  </button>
                )}
                <button onClick={handleCancel} className="norton-btn">
                  [ Cancel ]
                </button>
              </div>
            </div>
          </div>
        ) : skin === 'terminal' ? (
          /* Terminal skin is all about ASCII and monospace */
          <div className="terminal-dialog">
            <div className="terminal-prompt">
              <span className="prompt-label">COMMAND:</span> CONFIRM_ACTION
            </div>
            <div className="terminal-message">
              {confirmModal.title.toUpperCase()}
              <br />
              {confirmModal.message}
            </div>
            <div className="terminal-actions">
              {confirmModal.onConfirm && (
                <button onClick={handleConfirm} className="terminal-btn">
                  {">"} SAVE_CHANGES
                </button>
              )}
              {confirmModal.onSaveAs && (
                <button onClick={handleSaveAs} className="terminal-btn">
                  {">"} SAVE_AS
                </button>
              )}
              {confirmModal.onDiscard && (
                <button onClick={handleDiscard} className="terminal-btn discard">
                  {">"} DISCARD_CHANGES
                </button>
              )}
              <button onClick={handleCancel} className="terminal-btn cancel">
                {">"} ABORT
              </button>
            </div>
          </div>
        ) : (
          /* Modern skin is the default sleek design */
          <div className="modern-dialog">
            <div className="modern-dialog-header">
              <div className="icon-badge warning">
                <AlertCircle size={20} />
              </div>
              <h3>{confirmModal.title}</h3>
              <button className="close-btn" onClick={handleCancel}>
                <X size={18} />
              </button>
            </div>
            <div className="modern-dialog-body">
              <p>{confirmModal.message}</p>
            </div>
            <div className="modern-dialog-actions">
              <button onClick={handleCancel} className="modern-btn secondary">
                Cancel
              </button>
              <div className="main-actions">
                {confirmModal.onDiscard && (
                  <button onClick={handleDiscard} className="modern-btn danger">
                    <Trash2 size={16} /> Discard
                  </button>
                )}
                <div className="primary-actions">
                  {confirmModal.onSaveAs && (
                    <button onClick={handleSaveAs} className="modern-btn secondary">
                      <Save size={16} /> Save As
                    </button>
                  )}
                  {confirmModal.onConfirm && (
                    <button onClick={handleConfirm} className="modern-btn primary">
                      <Save size={16} /> Save Changes
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
