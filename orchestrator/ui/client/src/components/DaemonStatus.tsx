import { useState, useEffect, useCallback } from 'react';

interface DaemonState {
  running: boolean;
  lastScan?: string;
  nextScan?: string;
  scanInterval: number;
  watchPaths: string[];
  autoConvert: boolean;
}

interface DaemonStatusProps {
  compact?: boolean;
}

// Note: Daemon functionality is planned for Phase 6.
// This component provides the UI ready for when the backend daemon service is implemented.
// Currently shows a placeholder/disabled state.

export default function DaemonStatus({ compact = false }: DaemonStatusProps) {
  const [state, setState] = useState<DaemonState>({
    running: false,
    scanInterval: 60,
    watchPaths: [],
    autoConvert: false,
  });
  const [loading, setLoading] = useState(false);

  // Placeholder for daemon API calls
  const fetchStatus = useCallback(async () => {
    // In Phase 6, this will call /api/daemon/status
    // For now, we simulate a disabled state
    setState({
      running: false,
      scanInterval: 60,
      watchPaths: [],
      autoConvert: false,
    });
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleToggle = async () => {
    setLoading(true);
    // In Phase 6, this will call /api/daemon/start or /api/daemon/stop
    // For now, show a message that it's not yet implemented
    setTimeout(() => {
      setLoading(false);
      alert('Daemon functionality will be available in a future update.');
    }, 500);
  };

  if (compact) {
    return (
      <div className="daemon-status">
        <div className={`daemon-indicator ${state.running ? 'active' : ''}`} />
        <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>
          Daemon: {state.running ? 'Running' : 'Stopped'}
        </span>
        <button
          className="btn btn-sm btn-secondary"
          onClick={handleToggle}
          disabled={loading}
          style={{ marginLeft: 8 }}
        >
          {loading ? '...' : state.running ? 'Stop' : 'Start'}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <h3>Background Daemon</h3>
        <div className="daemon-status">
          <div className={`daemon-indicator ${state.running ? 'active' : ''}`} />
          <span>{state.running ? 'Running' : 'Stopped'}</span>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-sm text-muted">
          The background daemon periodically scans configured directories for new convertible files.
          {!state.running && ' Enable it to automatically detect new files.'}
        </p>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label">Scan Interval (minutes)</label>
          <input
            type="number"
            className="form-input"
            value={state.scanInterval}
            onChange={(e) =>
              setState({ ...state, scanInterval: parseInt(e.target.value) || 60 })
            }
            min={1}
            max={1440}
            disabled={state.running}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Auto-convert new files</label>
          <div style={{ paddingTop: 8 }}>
            <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={state.autoConvert}
                onChange={(e) => setState({ ...state, autoConvert: e.target.checked })}
                disabled={state.running}
              />
              <span>Automatically convert when new files are found</span>
            </label>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Watch Paths</label>
        <textarea
          className="form-textarea"
          value={state.watchPaths.join('\n')}
          onChange={(e) =>
            setState({
              ...state,
              watchPaths: e.target.value.split('\n').filter(Boolean),
            })
          }
          placeholder="Enter directory paths to watch, one per line..."
          rows={3}
          disabled={state.running}
        />
        <p className="text-sm text-muted mt-2">
          One directory path per line. These directories will be scanned periodically.
        </p>
      </div>

      {state.running && (
        <div
          className="card mb-4"
          style={{ background: 'var(--gray-50)', padding: '12px 16px' }}
        >
          <div className="flex justify-between text-sm">
            <span className="text-muted">Last scan:</span>
            <span>{state.lastScan ? new Date(state.lastScan).toLocaleString() : 'Never'}</span>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span className="text-muted">Next scan:</span>
            <span>{state.nextScan ? new Date(state.nextScan).toLocaleString() : 'Pending'}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          className={`btn ${state.running ? 'btn-danger' : 'btn-success'}`}
          onClick={handleToggle}
          disabled={loading}
        >
          {loading ? (
            <>
              <div className="spinner" style={{ width: 16, height: 16 }} />
              {state.running ? 'Stopping...' : 'Starting...'}
            </>
          ) : state.running ? (
            'Stop Daemon'
          ) : (
            'Start Daemon'
          )}
        </button>
        {!state.running && (
          <button className="btn btn-secondary" disabled>
            Save Settings
          </button>
        )}
      </div>

      <div
        className="mt-4 text-sm"
        style={{
          padding: '12px',
          background: 'var(--warning-light)',
          borderRadius: 'var(--border-radius)',
          color: 'var(--warning)',
        }}
      >
        <strong>Note:</strong> Daemon functionality is planned for a future update. The settings
        shown here are for preview purposes only.
      </div>
    </div>
  );
}
