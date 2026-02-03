import { useState } from 'react';
import ExclusionManager from '../components/ExclusionManager';
import DaemonStatus from '../components/DaemonStatus';

type SettingsTab = 'exclusions' | 'daemon' | 'general';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('exclusions');

  const tabs: { id: SettingsTab; label: string; icon: string }[] = [
    { id: 'exclusions', label: 'Exclusions', icon: '🚫' },
    { id: 'daemon', label: 'Background Daemon', icon: '⏰' },
    { id: 'general', label: 'General', icon: '⚙️' },
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
              <ExclusionManager />
            </div>
          )}

          {/* Daemon Tab */}
          {activeTab === 'daemon' && <DaemonStatus />}

          {/* General Tab */}
          {activeTab === 'general' && (
            <div>
              <h2 style={{ fontSize: 18, marginBottom: 16 }}>General Settings</h2>

              <div className="form-group">
                <label className="form-label">Data Storage Location</label>
                <input
                  type="text"
                  className="form-input"
                  value="~/.umd"
                  disabled
                  style={{ background: 'var(--gray-100)' }}
                />
                <p className="text-sm text-muted mt-2">
                  Configuration and state files are stored here. This cannot be changed from the UI.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Default Concurrency</label>
                <select className="form-select" defaultValue="3" style={{ width: 200 }}>
                  {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} parallel conversions
                    </option>
                  ))}
                </select>
                <p className="text-sm text-muted mt-2">
                  Number of files to convert simultaneously during batch operations.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Scan Cache TTL</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    className="form-input"
                    defaultValue={5}
                    min={1}
                    max={60}
                    style={{ width: 100 }}
                  />
                  <span>minutes</span>
                </div>
                <p className="text-sm text-muted mt-2">
                  How long scan results are cached before a fresh scan is required.
                </p>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: '24px 0' }} />

              <h3 style={{ fontSize: 16, marginBottom: 16 }}>API Configuration</h3>

              <div className="form-group">
                <label className="form-label">Gemini API Key</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    className="form-input"
                    placeholder="••••••••••••••••"
                    disabled
                    style={{ flex: 1, background: 'var(--gray-100)' }}
                  />
                  <button className="btn btn-secondary" disabled>
                    Update
                  </button>
                </div>
                <p className="text-sm text-muted mt-2">
                  API key is managed via <code>umd setup</code> command. Stored securely in ~/.umd/config.json.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">OCR Model</label>
                <select className="form-select" defaultValue="gemini-2.0-flash" style={{ width: '100%' }}>
                  <option value="gemini-2.0-flash">gemini-2.0-flash (Default - Fast)</option>
                  <option value="gemini-1.5-pro">gemini-1.5-pro (Higher Quality)</option>
                  <option value="gemini-1.5-flash">gemini-1.5-flash (Legacy)</option>
                </select>
                <p className="text-sm text-muted mt-2">
                  Model used for extracting text from images and documents.
                </p>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: '24px 0' }} />

              <h3 style={{ fontSize: 16, marginBottom: 16 }}>Server Settings</h3>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Server Port</label>
                  <input
                    type="number"
                    className="form-input"
                    defaultValue={3000}
                    disabled
                    style={{ background: 'var(--gray-100)' }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Server Host</label>
                  <input
                    type="text"
                    className="form-input"
                    defaultValue="localhost"
                    disabled
                    style={{ background: 'var(--gray-100)' }}
                  />
                </div>
              </div>
              <p className="text-sm text-muted">
                Server settings are configured via CLI flags: <code>umd orchestrate ui --port 3000 --host localhost</code>
              </p>

              <div
                className="mt-4"
                style={{
                  padding: '16px',
                  background: 'var(--gray-50)',
                  borderRadius: 'var(--border-radius)',
                }}
              >
                <p className="text-sm text-muted" style={{ margin: 0 }}>
                  <strong>Note:</strong> Most settings are managed through the CLI and config files
                  for security and consistency. This UI provides read-only views of the current configuration.
                </p>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--gray-200)', margin: '24px 0' }} />

              <h3 style={{ fontSize: 16, marginBottom: 16 }}>About</h3>
              <div className="text-sm text-muted">
                <p><strong>UnifiedMarkdown Orchestrator UI</strong></p>
                <p>Version: 0.1.0</p>
                <p>
                  A web-based interface for managing batch document-to-markdown conversions
                  using the UnifiedMarkdown CLI.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
