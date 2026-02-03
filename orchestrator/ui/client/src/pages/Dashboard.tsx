import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getScanResult, listJobs, checkHealth, useServerEvents, type ScanResult, type BatchState } from '../api/client';
import ProgressBar from '../components/ProgressBar';
import DaemonStatus from '../components/DaemonStatus';

export default function Dashboard() {
  const navigate = useNavigate();
  const { events, connected } = useServerEvents();
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const [jobs, setJobs] = useState<BatchState[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState<{ uptime: number } | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [scans, jobList, health] = await Promise.all([
        getScanResult().catch(() => []),
        listJobs().catch(() => []),
        checkHealth(),
      ]);
      // Handle various response formats
      let scanArray: ScanResult[] = [];
      if (Array.isArray(scans)) {
        scanArray = scans.filter(s => s && s.pending && s.converted);
      } else if (scans && typeof scans === 'object' && 'pending' in scans) {
        scanArray = [scans as ScanResult];
      }
      setScanResults(scanArray);
      setJobs(Array.isArray(jobList) ? jobList : []);
      setServerStatus(health);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh on relevant events
  useEffect(() => {
    const lastEvent = events[events.length - 1];
    if (
      lastEvent &&
      ['scan-complete', 'conversion-complete'].includes(lastEvent.type)
    ) {
      loadData();
    }
  }, [events, loadData]);

  // Calculate stats (with safe defaults)
  const totalPending = scanResults.reduce((sum, s) => sum + (s.pending?.length || 0), 0);
  const totalConverted = scanResults.reduce((sum, s) => sum + (s.converted?.length || 0), 0);
  const activeJobs = jobs.filter((j) => j.status === 'running').length;
  const failedFiles = jobs.reduce((sum, j) => sum + (j.failedFiles || 0), 0);

  const recentJobs = jobs.slice(0, 5);
  const recentEvents = events.slice(-10).reverse();

  const formatUptime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Overview of your document conversion workflow</p>
      </div>

      {/* Connection Status */}
      <div className="flex justify-between items-center mb-4">
        <div className={`connection-status ${connected ? 'connected' : ''}`}>
          <span className="dot" />
          <span>{connected ? 'Connected to server' : 'Connecting...'}</span>
          {serverStatus && (
            <span className="text-muted" style={{ marginLeft: 8 }}>
              (uptime: {formatUptime(serverStatus.uptime)})
            </span>
          )}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
          {loading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '↻'} Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => navigate('/files')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon pending">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>Pending Files</h3>
            <div className="value">{totalPending}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon converted">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>Converted</h3>
            <div className="value">{totalConverted}</div>
          </div>
        </div>

        <div className="stat-card" onClick={() => navigate('/jobs')} style={{ cursor: 'pointer' }}>
          <div className="stat-icon jobs">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>Active Jobs</h3>
            <div className="value">{activeJobs}</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon errors">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </div>
          <div className="stat-content">
            <h3>Failed</h3>
            <div className="value">{failedFiles}</div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Recent Jobs */}
        <div className="card">
          <div className="card-header">
            <h2>Recent Jobs</h2>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate('/jobs')}>
              View All
            </button>
          </div>
          {recentJobs.length === 0 ? (
            <div className="empty-state">
              <p>No conversion jobs yet</p>
            </div>
          ) : (
            <div>
              {recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between"
                  style={{
                    padding: '12px 0',
                    borderBottom: '1px solid var(--gray-100)',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="truncate" style={{ fontWeight: 500 }}>
                      {job.rootPath.split(/[/\\]/).pop() || job.rootPath}
                    </div>
                    <div className="text-sm text-muted">
                      {job.completedFiles} / {job.totalFiles} files
                    </div>
                  </div>
                  <span
                    className={`badge badge-${
                      job.status === 'completed'
                        ? 'success'
                        : job.status === 'running'
                        ? 'running'
                        : job.status === 'failed'
                        ? 'error'
                        : 'pending'
                    }`}
                  >
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="card">
          <div className="card-header">
            <h2>Activity Feed</h2>
            <span className="text-sm text-muted">Live updates</span>
          </div>
          <div className="activity-feed">
            {recentEvents.length === 0 ? (
              <div className="empty-state">
                <p>No recent activity</p>
              </div>
            ) : (
              recentEvents.map((event, index) => (
                <div key={index} className="activity-item">
                  <div
                    className={`activity-icon ${
                      event.type.includes('scan')
                        ? 'scan'
                        : event.type.includes('error')
                        ? 'error'
                        : 'convert'
                    }`}
                  >
                    {event.type.includes('scan') ? '🔍' : event.type.includes('error') ? '❌' : '✓'}
                  </div>
                  <div className="activity-content">
                    <div className="title">{event.type.replace(/-/g, ' ')}</div>
                    <div className="description truncate">
                      {typeof event.data === 'object' && event.data !== null
                        ? JSON.stringify(event.data).slice(0, 50)
                        : String(event.data)}
                    </div>
                  </div>
                  <span className="activity-time">
                    {new Date(event.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mt-4">
        <div className="card-header">
          <h2>Quick Actions</h2>
        </div>
        <div className="flex gap-4">
          <button className="btn btn-primary" onClick={() => navigate('/files')}>
            📁 Browse Files
          </button>
          <button className="btn btn-success" onClick={() => navigate('/files')}>
            ⚡ Quick Convert
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/settings')}>
            ⚙️ Settings
          </button>
        </div>
      </div>

      {/* Daemon Status */}
      <div className="mt-4">
        <DaemonStatus compact />
      </div>

      {/* Scan Results Summary */}
      {scanResults.length > 0 && (
        <div className="card mt-4">
          <div className="card-header">
            <h2>Scanned Directories</h2>
            <span className="text-sm text-muted">{scanResults.length} directories</span>
          </div>
          {scanResults.map((scan, index) => (
            <div
              key={index}
              style={{
                padding: '12px 0',
                borderBottom: index < scanResults.length - 1 ? '1px solid var(--gray-100)' : 'none',
              }}
            >
              <div className="flex justify-between items-center mb-2">
                <span className="truncate" style={{ fontWeight: 500, flex: 1 }}>
                  {scan.rootPath}
                </span>
                <span className="text-sm text-muted">
                  {new Date(scan.scannedAt).toLocaleString()}
                </span>
              </div>
              <ProgressBar
                value={scan.converted.length}
                max={scan.totalFiles}
                variant={scan.pending.length === 0 ? 'success' : 'default'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
