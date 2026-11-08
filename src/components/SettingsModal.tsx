import React from "react";
import { useVaultStore, LlmProvider } from "../store/useVaultStore";
import { X, RefreshCw } from "lucide-react";

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setSettingsOpen,
    llmConfigs,
    setLlmConfig,
    activeLlmId,
    setActiveLlmId,
    availableModels,
    fetchAvailableModels,
    skin,
    setSkin,
    setTheme,
    showSidebarLogo,
    setShowSidebarLogo
  } = useVaultStore();

  const [selectedProvider, setSelectedProvider] = React.useState<LlmProvider>(activeLlmId);
  const [isFetching, setIsFetching] = React.useState(false);
  // Whether the free-text model input is shown. Kept separate from the model value so that
  // typing the first character does not hide the input (F-18).
  const [customModel, setCustomModel] = React.useState(false);

  React.useEffect(() => {
    if (!isSettingsOpen) return;
    const list = availableModels[selectedProvider] ?? [];
    setCustomModel(list.length > 0 && !list.includes(llmConfigs[selectedProvider].model));
  }, [isSettingsOpen, selectedProvider]);

  // Auto-fetch models when provider is selected or modal opens
  React.useEffect(() => {
    if (isSettingsOpen) {
      const config = llmConfigs[selectedProvider];
      const hasAccessInfo = selectedProvider === 'local' ? !!config.endpoint : !!config.apiKey;

      // Auto-fetch if list is empty and we have basic info
      if (hasAccessInfo && (!availableModels[selectedProvider] || availableModels[selectedProvider].length === 0)) {
        handleRefreshModels();
      }
    }
  }, [isSettingsOpen, selectedProvider]);

  const handleRefreshModels = async () => {
    setIsFetching(true);
    await fetchAvailableModels(selectedProvider);
    setIsFetching(false);
  };

  // Sync selected provider with active when modal opens
  React.useEffect(() => {
    if (isSettingsOpen) {
      setSelectedProvider(activeLlmId);
    }
  }, [isSettingsOpen, activeLlmId]);

  const handleSkinChange = (newSkin: 'modern' | 'norton' | 'terminal') => {
    setSkin(newSkin);
    // Force dark mode for retro skins as they are designed for dark backgrounds
    if (newSkin === 'norton' || newSkin === 'terminal') {
      setTheme('dark');
    }
  };

  if (!isSettingsOpen) return null;

  const currentConfig = llmConfigs[selectedProvider];

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Settings</h2>
          <button
            className="icon-button"
            onClick={() => setSettingsOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          <div className="setting-group">
            <label>API Provider</label>
            <select
              className="text-input"
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value as LlmProvider)}
            >
              <option value="local">Local AI</option>
              <option value="openai">OpenAI</option>
              <option value="claude">Claude (Anthropic)</option>
              <option value="gemini">Gemini (Google)</option>
            </select>
          </div>

          <div className="provider-settings-box">
            <div className="provider-badge">{selectedProvider.toUpperCase()} Configuration</div>

            {selectedProvider === 'local' && (
              <div className="setting-group">
                <label>Endpoint URL</label>
                <input
                  type="text"
                  className="text-input"
                  value={currentConfig.endpoint}
                  onChange={(e) => setLlmConfig(selectedProvider, { endpoint: e.target.value })}
                  placeholder="http://127.0.0.1:39080"
                />
              </div>
            )}

            {(selectedProvider === 'openai' || selectedProvider === 'claude' || selectedProvider === 'gemini') && (
              <div className="setting-group">
                <label>API Key</label>
                <input
                  type="password"
                  className="text-input"
                  value={currentConfig.apiKey}
                  onChange={(e) => setLlmConfig(selectedProvider, { apiKey: e.target.value })}
                  placeholder="Paste your API key here"
                />
              </div>
            )}

            <div className="setting-group">
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Model
                <button
                  className="refresh-btn"
                  onClick={handleRefreshModels}
                  disabled={isFetching}
                  title="Refresh model list"
                >
                  <RefreshCw size={12} className={isFetching ? 'spin' : ''} />
                </button>
              </label>

              {availableModels[selectedProvider]?.length > 0 ? (
                <select
                  className="text-input"
                  value={customModel ? 'custom' : currentConfig.model}
                  onChange={(e) => {
                    if (e.target.value === 'custom') {
                      setCustomModel(true);
                    } else {
                      setCustomModel(false);
                      setLlmConfig(selectedProvider, { model: e.target.value });
                    }
                  }}
                >
                  {availableModels[selectedProvider].map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="custom">-- Direct Entry --</option>
                </select>
              ) : (
                <input
                  type="text"
                  className="text-input"
                  value={currentConfig.model}
                  onChange={(e) => setLlmConfig(selectedProvider, { model: e.target.value })}
                  placeholder="e.g. gpt-4o"
                />
              )}

              {customModel && availableModels[selectedProvider]?.length > 0 && (
                <input
                  type="text"
                  className="text-input"
                  style={{ marginTop: '4px' }}
                  value={currentConfig.model === 'custom' ? '' : currentConfig.model}
                  onChange={(e) => setLlmConfig(selectedProvider, { model: e.target.value })}
                  placeholder="Enter model name manually"
                />
              )}
            </div>

            <button
              className={`action-btn ${activeLlmId === selectedProvider ? 'secondary' : 'primary-outline'}`}
              style={{ marginTop: '8px' }}
              onClick={() => setActiveLlmId(selectedProvider)}
              disabled={activeLlmId === selectedProvider}
            >
              {activeLlmId === selectedProvider ? "Currently Active" : "Set as Active Provider"}
            </button>
          </div>
          <div className="setting-group">
            <label>Appearance / Skin</label>
            <div className="skin-options">
              <button
                className={`skin-option ${skin === 'modern' ? 'active' : ''}`}
                onClick={() => handleSkinChange('modern')}
              >
                Modern
              </button>
              <button
                className={`skin-option ${skin === 'norton' ? 'active' : ''}`}
                onClick={() => handleSkinChange('norton')}
              >
                Norton Commander
              </button>
              <button
                className={`skin-option ${skin === 'terminal' ? 'active' : ''}`}
                onClick={() => handleSkinChange('terminal')}
              >
                Matrix Terminal
              </button>
            </div>
          </div>
          <div className="setting-group">
            <label>Someone's Options</label>
            <label className="toggle-container">
              <input
                type="checkbox"
                className="toggle-input"
                checked={showSidebarLogo}
                onChange={(e) => setShowSidebarLogo(e.target.checked)}
              />
              <div className="toggle-switch"></div>
              <span className="toggle-label">Bye Mark...</span>
            </label>
          </div>
        </div>
        <div className="modal-footer">
          <button
            className="action-btn primary"
            onClick={() => setSettingsOpen(false)}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
