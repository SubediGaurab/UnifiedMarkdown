import { useState, useEffect, useCallback } from 'react';
import { listJobs, getJobStatus, cancelJob, deleteJob, type BatchState, type ConversionRecord } from '../api/client';
import { JobProgress } from '../components/ProgressBar';
import LogViewer from '../components/LogViewer';

export default function Jobs() {
  const [jobs, setJobs] = useState<BatchState[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<BatchState | null>(null);
  const [selectedFile, setSelectedFile] = useState<ConversionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listJobs();
      // Ensure data is an array and sort by date, newest first
      const jobsArray = Array.isArray(data) ? data : [];
      jobsArray.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
      setJobs(jobsArray);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    // Poll for updates every 5 seconds if there are running jobs
    const interval = setInterval(() => {
      if (jobs.some((j) => j.status === 'running')) {
        loadJobs();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loadJobs, jobs]);

  const handleSelectJob = async (job: BatchState) => {
    try {
      // Fetch latest status
      const latest = await getJobStatus(job.id);
      setSelectedJob(latest);
      setSelectedFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job details');
    }
  };

  const handleCancel = async (jobId: string) => {
    try {
      await cancelJob(jobId);
      await loadJobs();
      if (selectedJob?.id === jobId) {
        const updated = await getJobStatus(jobId);
        setSelectedJob(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel job');
    }
  };

  const handleDelete = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job record?')) return;
    try {
      await deleteJob(jobId);
      await loadJobs();
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete job');
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-pending',
      running: 'badge-running',
      completed: 'badge-success',
      failed: 'badge-error',
      cancelled: 'badge-warning',
    };
    return map[status] || 'badge-pending';
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString();
  };

  const formatDuration = (start: Date | string, end?: Date | string) => {
    const startMs = new Date(start).getTime();
    const endMs = end ? new Date(end).getTime() : Date.now();
    const seconds = Math.floor((endMs - startMs) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex justify-between items-center">
          <div>
            <h1>Conversion Jobs</h1>
            <p>Monitor and manage your batch conversion jobs</p>
          </div>
          <button className="btn btn-secondary" onClick={loadJobs} disabled={loading}>
            {loading ? <div className="spinner" style={{ width: 14, height: 14 }} /> : '↻'} Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="card mb-4" style={{ background: 'var(--error-light)' }}>
          <p style={{ color: 'var(--error)', margin: 0 }}>{error}</p>
        </div>
      )}

      <div className="grid-2">
        {/* Jobs List */}
        <div className="card">
          <div className="card-header">
            <h3>Jobs</h3>
            <span className="text-sm text-muted">{jobs.length} total</span>
          </div>

          {jobs.length === 0 ? (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
              </svg>
              <h3>No Jobs</h3>
              <p>Start a conversion from the Files page to see jobs here.</p>
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflow: 'auto' }}>
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => handleSelectJob(job)}
                  style={{
                    padding: '12px',
                    borderBottom: '1px solid var(--gray-100)',
                    cursor: 'pointer',
                    background: selectedJob?.id === job.id ? 'var(--gray-50)' : 'transparent',
                  }}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="truncate" style={{ fontWeight: 500, flex: 1 }}>
                      {job.rootPath.split(/[/\\]/).pop() || job.id.slice(0, 8)}
                    </span>
                    <span className={`badge ${getStatusBadge(job.status)}`}>{job.status}</span>
                  </div>
                  <div className="flex justify-between text-sm text-muted">
                    <span>
                      {job.completedFiles + job.failedFiles} / {job.totalFiles} files
                    </span>
                    <span>{formatDate(job.startedAt)}</span>
                  </div>
                  <div className="mt-2">
                    <JobProgress
                      total={job.totalFiles}
                      completed={job.completedFiles}
                      failed={job.failedFiles}
                      status={job.status}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Job Details */}
        <div className="card">
          <div className="card-header">
            <h3>Job Details</h3>
            {selectedJob && (
              <div className="flex gap-2">
                {selectedJob.status === 'running' && (
                  <button
                    className="btn btn-sm btn-warning"
                    onClick={() => handleCancel(selectedJob.id)}
                  >
                    Cancel
                  </button>
                )}
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() => handleDelete(selectedJob.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          {!selectedJob ? (
            <div className="empty-state">
              <p>Select a job to view details</p>
            </div>
          ) : (
            <div>
              {/* Job Info */}
              <div
                className="mb-4"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '8px 16px',
                  fontSize: 13,
                }}
              >
                <span className="text-muted">ID:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedJob.id}</span>
                <span className="text-muted">Path:</span>
                <span className="truncate">{selectedJob.rootPath}</span>
                <span className="text-muted">Started:</span>
                <span>{formatDate(selectedJob.startedAt)}</span>
                {selectedJob.completedAt && (
                  <>
                    <span className="text-muted">Completed:</span>
                    <span>{formatDate(selectedJob.completedAt)}</span>
                  </>
                )}
                <span className="text-muted">Duration:</span>
                <span>{formatDuration(selectedJob.startedAt, selectedJob.completedAt)}</span>
              </div>

              {/* File List */}
              <div className="card-header" style={{ marginTop: 16 }}>
                <h3>Files ({selectedJob.files?.length || 0})</h3>
              </div>
              <div style={{ maxHeight: 300, overflow: 'auto' }}>
                {(selectedJob.files || []).length === 0 ? (
                  <div className="text-sm text-muted" style={{ padding: '12px', textAlign: 'center' }}>
                    No file details available
                  </div>
                ) : (
                  (selectedJob.files || []).map((file, index) => (
                    <div
                      key={index}
                      onClick={() => setSelectedFile(file)}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--gray-100)',
                        cursor: 'pointer',
                        background:
                          selectedFile?.filePath === file.filePath ? 'var(--gray-50)' : 'transparent',
                      }}
                    >
                      <div className="flex justify-between items-center">
                        <span className="truncate text-sm" style={{ flex: 1 }}>
                          {file.filePath?.split(/[/\\]/).pop() || 'Unknown file'}
                        </span>
                        <span className={`badge badge-sm ${getStatusBadge(file.status)}`}>
                          {file.status}
                        </span>
                      </div>
                      {file.error && (
                        <div className="text-sm" style={{ color: 'var(--error)', marginTop: 4 }}>
                          {file.error}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* File Logs */}
      {selectedFile && (
        <div className="card mt-4">
          <div className="card-header">
            <h3>Logs: {selectedFile.filePath?.split(/[/\\]/).pop() || 'Unknown file'}</h3>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setSelectedFile(null)}
            >
              Close
            </button>
          </div>
          <div
            className="mb-2"
            style={{
              padding: '8px 12px',
              background: 'var(--gray-50)',
              borderRadius: 'var(--border-radius)',
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {selectedFile.filePath}
          </div>
          {selectedFile.status === 'failed' && selectedFile.error && (
            <div
              className="mb-4"
              style={{
                padding: '12px',
                background: 'var(--error-light)',
                borderRadius: 'var(--border-radius)',
                color: 'var(--error)',
              }}
            >
              <strong>Error:</strong> {selectedFile.error}
            </div>
          )}
          <LogViewer stdout={selectedFile.stdout} stderr={selectedFile.stderr} />
        </div>
      )}
    </div>
  );
}
