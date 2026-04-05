import { useState, useEffect, useCallback } from 'react';
import { getConfig, updateConfig, type AppConfig } from '../api/client';

export default function Settings() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Gemini State
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiOcrModel, setGeminiOcrModel] = useState('');
  const [geminiTextModel, setGeminiTextModel] = useState('');

  // OpenAI State
  const [openaiEndpoint, setOpenaiEndpoint] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [openaiOcrModel, setOpenaiOcrModel] = useState('');
  const [openaiTextModel, setOpenaiTextModel] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const data = await getConfig();
      setConfig(data);

      setGeminiApiKey('');
      setGeminiOcrModel(data.geminiOcrModel);
      setGeminiTextModel(data.geminiTextModel);

      setOpenaiEndpoint(data.openaiEndpoint || '');
      setOpenaiApiKey('');
      setOpenaiOcrModel(data.openaiOcrModel);
      setOpenaiTextModel(data.openaiTextModel);
      
      setError(null);
      setDirty(false);
    } catch (err) {
      setError('Failed to load configuration');
      console.error(err);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    try {
      const updates: Partial<AppConfig> = {};

      if (geminiApiKey) updates.geminiApiKey = geminiApiKey;
      if (geminiOcrModel !== config?.geminiOcrModel) updates.geminiOcrModel = geminiOcrModel;
      if (geminiTextModel !== config?.geminiTextModel) updates.geminiTextModel = geminiTextModel;

      if (openaiEndpoint !== (config?.openaiEndpoint || '')) updates.openaiEndpoint = openaiEndpoint;
      if (openaiApiKey) updates.openaiApiKey = openaiApiKey;
      if (openaiOcrModel !== config?.openaiOcrModel) updates.openaiOcrModel = openaiOcrModel;
      if (openaiTextModel !== config?.openaiTextModel) updates.openaiTextModel = openaiTextModel;

      const result = await updateConfig(updates);

      // Use the config returned by the server instead of re-fetching
      if (result.config) {
        setConfig(result.config);
        setGeminiApiKey('');
        setGeminiOcrModel(result.config.geminiOcrModel);
        setGeminiTextModel(result.config.geminiTextModel);
        setOpenaiEndpoint(result.config.openaiEndpoint || '');
        setOpenaiApiKey('');
        setOpenaiOcrModel(result.config.openaiOcrModel);
        setOpenaiTextModel(result.config.openaiTextModel);
      }

      setSuccess('Configuration saved successfully');
      setDirty(false);
      setError(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError('Failed to save configuration');
      console.error(err);
    }
  };

  return (
    <div className="section">
      <h2 className="section-title">Settings</h2>
      
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="panel">
        <h3 className="section-title">Gemini Options</h3>
        <p className="text-sm text-muted mb-4">
          Default configuration for document and text operations.
        </p>
        <div className="form-group">
          <label className="form-label">API Key</label>
          <input
            type="password"
            className="form-input"
            placeholder={config?.geminiApiKey ? `Ends in ${config.geminiApiKey.slice(-4)}` : "Enter new key..."}
            value={geminiApiKey}
            onChange={(e) => { setGeminiApiKey(e.target.value); setDirty(true); }}
            style={{ width: '100%' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">OCR / Vision Model</label>
          <input
            type="text"
            className="form-input"
            value={geminiOcrModel}
            onChange={(e) => { setGeminiOcrModel(e.target.value); setDirty(true); }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Text Model</label>
          <input
            type="text"
            className="form-input"
            value={geminiTextModel}
            onChange={(e) => { setGeminiTextModel(e.target.value); setDirty(true); }}
          />
        </div>
      </div>

      <div className="panel mt-4">
        <h3 className="section-title">OpenAI Compatible Options</h3>
        <p className="text-sm text-muted mb-4">
          Optional fallback for local or alternative image processing.
        </p>
        <div className="form-group">
          <label className="form-label">Endpoint URL</label>
          <input
            type="text"
            className="form-input"
            placeholder="http://127.0.0.1:1234/v1"
            value={openaiEndpoint}
            onChange={(e) => { setOpenaiEndpoint(e.target.value); setDirty(true); }}
            style={{ width: '100%' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">API Key (Optional)</label>
          <input
            type="password"
            className="form-input"
            placeholder={config?.openaiApiKey ? `Ends in ${config.openaiApiKey.slice(-4)}` : "Enter new key..."}
            value={openaiApiKey}
            onChange={(e) => { setOpenaiApiKey(e.target.value); setDirty(true); }}
            style={{ width: '100%' }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">OCR / Vision Model</label>
          <input
            type="text"
            className="form-input"
            value={openaiOcrModel}
            onChange={(e) => { setOpenaiOcrModel(e.target.value); setDirty(true); }}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Text Model</label>
          <input
            type="text"
            className="form-input"
            value={openaiTextModel}
            onChange={(e) => { setOpenaiTextModel(e.target.value); setDirty(true); }}
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button className="btn btn-primary" onClick={handleSave} disabled={!dirty || configLoading}>
          Save Settings
        </button>
      </div>

      <p className="text-sm text-muted mt-4">
        Config stored at {config?.configPath}
      </p>
    </div>
  );
}
