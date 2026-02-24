import { useState, useEffect, useCallback } from 'react';
import ExclusionManager from '../components/ExclusionManager';
import DaemonStatus from '../components/DaemonStatus';
import { getDefaultExclusions, getConfig, getApiKey, updateConfig, restartServer, type DefaultExclusionRule, type AppConfig } from '../api/client';

type SettingsTab = 'exclusions' | 'daemon' | 'general';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [defaultExclusions, setDefaultExclusions] = useState<DefaultExclusionRule[]>([]);
  const [defaultsLoading, setDefaultsLoading] = useState(true);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);

  // General settings state
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Editable form fields
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [ocrModel, setOcrModel] = useState('');
  const [textModel, setTextModel] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const data = await getConfig();
      setConfig(data);
      setOcrModel(data.ocrModel);
      setTextModel(data.textModel);
      setApiKey('');
      setDirty(false);
      setConfigError(null);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    getDefaultExclusions()
      .then((defaults) => {
        if (!mounted) return;
        setDefaultExclusions(defaults);
        setDefaultsError(null);
      })
      .catch((err) => {
        if (!mounted) return;
        setDefaultsError(err instanceof Error ? err.message : 'Failed to load default exclusions');
      })
      .finally(() => {
        if (!mounted) return;
        setDefaultsLoading(false);
      });

    loadConfig();

    return () => {
      mounted = false;
    };
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const updates: Record<string, string> = {};
      if (apiKey) updates.apiKey = apiKey;
      if (ocrModel !== config?.ocrModel) updates.ocrModel = ocrModel;
      if (textModel !== config?.textModel) updates.textModel = textModel;

      if (Object.keys(updates).length === 0) {
        setSaveMessage({ type: 'success', text: 'No changes to save' });
        return;
      }

      await updateConfig(updates);
      setSaveMessage({ type: 'success', text: 'Settings saved. Restart the server for changes to take effect.' });
      setDirty(false);
      await loadConfig();
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await restartServer();
    } catch {
      // Expected — server shuts down so the request may fail
    }
    // Wait and try reconnecting
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  };

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'exclusions', label: 'Exclusions', icon: '🚫' },
    { id: 'daemon', label: 'Background Daemon', icon: '⏰' },
  ];

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Configure your UnifiedMarkdown Orchestrator preferences</p>
      </div>

      {/* Tab Navigation */}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--gray-200)',
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '16px 24px',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--ocean-light)' : '2px solid transparent',
                cursor: 'pointer',
                fontWeight: activeTab === tab.id ? 600 : 400,
                color: activeTab === tab.id ? 'var(--ocean-light)' : 'var(--gray-600)',
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ marginRight: 8 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: 20 }}>
          {/* General Tab */}
          {activeTab === 'general' && (
            <div>
              <div className="flex justify-between items-center" style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 18, margin: 0 }}>General Settings</h2>
                <button
                  className="btn btn-warning btn-sm"
                  onClick={handleRestart}
                  disabled={restarting}
                >
                  {restarting ? (
                    <>
                      <div className="spinner" style={{ width: 14, height: 14 }} /> Restarting...
                    </>
                  ) : (
                    '↻ Restart Server'
                  )}
                </button>
              </div>

              {configLoading ? (
                <div className="flex items-center gap-2">
                  <div className="spinner" />
                  <span>Loading configuration...</span>
                </div>
              ) : configError ? (
                <div className="card" style={{ background: 'var(--error-light)', marginBottom: 16 }}>
                  <p style={{ color: 'var(--error)', margin: 0 }}>{configError}</p>
                </div>
              ) : (
                <>
                  <h3 style={{ fontSize: 16, marginBottom: 16 }}>API Configuration</h3>

                  <div className="form-group">
                    <label className="form-label">Gemini API Key</label>
                    <div className="flex gap-2">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        className="form-input"
                        placeholder={config?.hasApiKey ? config.apiKey : 'Enter API key...'}
                        value={apiKey}
                        onChange={(e) => { setApiKey(e.target.value); setDirty(true); }}
                        style={{ flex: 1 }}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={async () => {
                          if (!showApiKey && !apiKey && config?.hasApiKey) {
                            // Fetch the real key to display it
                            try {
                              const { apiKey: realKey } = await getApiKey();
                              setApiKey(realKey);
                            } catch {
                              // Fall through — just toggle visibility
                            }
                          }
                          if (showApiKey && !dirty) {
                            // Hiding — clear back to placeholder mode
                            setApiKey('');
                          }
                          setShowApiKey(!showApiKey);
                        }}
                        style={{ minWidth: 70 }}
                      >
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <p className="text-sm text-muted mt-2">
                      {config?.hasApiKey
                        ? `Current key ends in ${config.apiKey.slice(-4)}. Leave blank to keep existing key.`
                        : 'No API key configured. Enter one to enable conversions.'}
                      {' '}Stored in <code>{config?.configPath}</code>.
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">OCR Model</label>
                    <input
                      type="text"
                      className="form-input"
                      value={ocrModel}
                      onChange={(e) => { setOcrModel(e.target.value); setDirty(true); }}
                      style={{ width: '100%' }}
                    />
                    <p className="text-sm text-muted mt-2">
                      Model used for extracting text from images and documents.
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Text Model</label>
                    <input
                      type="text"
                      className="form-input"
                      value={textModel}
                      onChange={(e) => { setTextModel(e.target.value); setDirty(true); }}
                      style={{ width: '100%' }}
                    />
                    <p className="text-sm text-muted mt-2">
                      Model used for text operations like summaries and captions.
                    </p>
                  </div>

                  {saveMessage && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 'var(--border-radius)',
                        marginBottom: 16,
                        background: saveMessage.type === 'success' ? 'var(--success-light, #e6f4ea)' : 'var(--error-light, #fce8e6)',
                        color: saveMessage.type === 'success' ? 'var(--success, #137333)' : 'var(--error, #c5221f)',
                      }}
                    >
                      {saveMessage.text}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      className="btn btn-primary"
                      onClick={handleSave}
                      disabled={saving || !dirty}
                    >
                      {saving ? (
                        <>
                          <div className="spinner" style={{ width: 14, height: 14 }} /> Saving...
                        </>
                      ) : (
                        'Save Settings'
                      )}
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={loadConfig}
                      disabled={configLoading}
                    >
                      Discard Changes
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Exclusions Tab */}
          {activeTab === 'exclusions' && (
            <div>
              <div className="mb-4">
                <h2 style={{ fontSize: 18, marginBottom: 8 }}>Exclusion Rules</h2>
                <p className="text-muted">
                  Excluded files and directories will be hidden from all future scans. Use patterns
                  like <code>*.tmp</code> or <code>node_modules</code> to match multiple files.
                </p>
              </div>
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header">
                  <h3>Custom Exclusions</h3>
                </div>
                <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                  These rules come from your configuration and can be edited or removed.
                </p>
                <ExclusionManager />
              </div>
              <div className="card" style={{ marginTop: 16 }}>
                <div className="card-header">
                  <h3>Default Exclusions</h3>
                </div>
                <p className="text-sm text-muted" style={{ marginBottom: 16 }}>
                  These are built-in exclusions that are always applied to scans and cannot be removed.
                </p>
                {defaultsLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="spinner" />
                    <span>Loading defaults...</span>
                  </div>
                ) : defaultsError ? (
                  <div className="card" style={{ background: 'var(--error-light)', marginBottom: 0 }}>
                    <p style={{ color: 'var(--error)', margin: 0 }}>{defaultsError}</p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Pattern</th>
                          <th>Type</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defaultExclusions.map((rule) => (
                          <tr key={`${rule.type}:${rule.pattern}`}>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{rule.pattern}</td>
                            <td>
                              <span className="badge badge-info">{rule.type}</span>
                            </td>
                            <td>{rule.description || 'None'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Daemon Tab */}
          {activeTab === 'daemon' && <DaemonStatus />}
        </div>
      </div>
    </div>
  );
}
