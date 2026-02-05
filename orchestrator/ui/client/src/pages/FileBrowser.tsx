import { useState, useCallback, useEffect } from 'react';
import { triggerScan, startConversion, getSkillsStatus, type ScanApiResponse, type DiscoveredFile, type SkillsStatus } from '../api/client';
import FileTree from '../components/FileTree';
import { QuickExcludeModal } from '../components/ExclusionManager';
import { IndeterminateProgress } from '../components/ProgressBar';

export default function FileBrowser() {
  const [rootPath, setRootPath] = useState('');
  const [scanResult, setScanResult] = useState<ScanApiResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [excludeModal, setExcludeModal] = useState<{ path: string; type: 'file' | 'directory' } | null>(null);

  // Scan options
  const [recursive, setRecursive] = useState(true);
  const [useCache, setUseCache] = useState(true);
  const [concurrency, setConcurrency] = useState(3);
  const [skipConverted, setSkipConverted] = useState(true);
  const [useClaudeCode, setUseClaudeCode] = useState(false);
  const [skillsStatus, setSkillsStatus] = useState<SkillsStatus | null>(null);

  // Check skills status on mount
  useEffect(() => {
    getSkillsStatus()
      .then(setSkillsStatus)
      .catch(() => setSkillsStatus(null));
  }, []);

  const handleScan = async () => {
    if (!rootPath.trim()) {
      setError('Please enter a directory path');
      return;
    }

    try {
      setScanning(true);
      setError(null);
      const result = await triggerScan({
        rootPath: rootPath.trim(),
        recursive,
        useCache,
      });
      setScanResult(result);
      // Auto-select pending files
      const pendingPaths = new Set((result.pending || []).map((f: DiscoveredFile) => f.path));
      setSelectedFiles(pendingPaths);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed');
      setScanResult(null);
    } finally {
      setScanning(false);
    }
  };

  const handleConvert = async () => {
    if (selectedFiles.size === 0) {
      setError('Please select files to convert');
      return;
    }

    try {
      setConverting(true);
      setError(null);
      const result = await startConversion({
        files: Array.from(selectedFiles),
        concurrency,
        skipConverted,
        useClaudeCode,
      });
      // Show success message
      alert(`Conversion started! Job ID: ${result.jobId}\n${result.totalFiles} files queued.`);
      // Optionally rescan to update status
      await handleScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const handleExclude = useCallback((path: string, type: 'file' | 'directory') => {
    setExcludeModal({ path, type });
  }, []);

  const handleExcluded = useCallback(async () => {
    // Rescan after exclusion
    if (rootPath) {
      await handleScan();
    }
  }, [rootPath]);

  return (
    <div>
      <div className="page-header">
        <h1>File Browser</h1>
        <p>Scan directories and select files for conversion</p>
      </div>

      {/* Error Display */}
      {error && (
        <div className="card mb-4" style={{ background: 'var(--error-light)' }}>
          <div className="flex justify-between items-center">
            <p style={{ color: 'var(--error)', margin: 0 }}>{error}</p>
            <button
              className="btn btn-sm btn-icon"
              onClick={() => setError(null)}
              style={{ background: 'transparent', color: 'var(--error)' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Scan Controls */}
      <div className="card">
        <div className="card-header">
          <h3>Scan Directory</h3>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            className="form-input"
            placeholder="Enter directory path (e.g., C:\Documents or /home/user/docs)"
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScan()}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={handleScan}
            disabled={scanning || !rootPath.trim()}
          >
            {scanning ? (
              <>
                <div className="spinner" style={{ width: 16, height: 16 }} />
                Scanning...
              </>
            ) : (
              '🔍 Scan'
            )}
          </button>
        </div>

        <div className="flex gap-4 items-center flex-wrap">
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={recursive}
              onChange={(e) => setRecursive(e.target.checked)}
            />
            <span>Recursive</span>
          </label>
          <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={useCache}
              onChange={(e) => setUseCache(e.target.checked)}
            />
            <span>Use Cache</span>
          </label>
        </div>
      </div>

      {/* Scanning Progress */}
      {scanning && (
        <div className="card">
          <div className="text-center">
            <p className="mb-2">Scanning directory...</p>
            <IndeterminateProgress />
          </div>
        </div>
      )}

      {/* Scan Results */}
      {scanResult && !scanning && (
        <>
          {/* Stats Bar */}
          <div className="card">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <div className="flex gap-4">
                <div>
                  <span className="text-sm text-muted">Total Files</span>
                  <div style={{ fontWeight: 600, fontSize: 18 }}>{scanResult.files?.length || 0}</div>
                </div>
                <div>
                  <span className="text-sm text-muted">Pending</span>
                  <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--warning)' }}>
                    {scanResult.pending?.length || 0}
                  </div>
                </div>
                <div>
                  <span className="text-sm text-muted">Converted</span>
                  <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--success)' }}>
                    {scanResult.converted?.length || 0}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted">Concurrency:</span>
                  <select
                    className="form-select"
                    value={concurrency}
                    onChange={(e) => setConcurrency(parseInt(e.target.value))}
                    style={{ width: 70 }}
                  >
                    {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={skipConverted}
                    onChange={(e) => setSkipConverted(e.target.checked)}
                  />
                  <span className="text-sm">Skip already converted</span>
                </label>

                <label
                  className="flex items-center gap-2"
                  style={{
                    cursor: skillsStatus?.claudeCodeReady ? 'pointer' : 'not-allowed',
                    opacity: skillsStatus?.claudeCodeReady ? 1 : 0.5,
                  }}
                  title={
                    skillsStatus?.claudeCodeReady
                      ? "Use Claude Code with Opus model and convert-to-markdown skill for higher quality conversion"
                      : skillsStatus?.missingSkills?.length
                        ? `Missing skills: ${skillsStatus.missingSkills.join(', ')}. Ensure .claude/skills directory is present.`
                        : "Claude Code skills not available"
                  }
                >
                  <input
                    type="checkbox"
                    checked={useClaudeCode}
                    onChange={(e) => setUseClaudeCode(e.target.checked)}
                    disabled={!skillsStatus?.claudeCodeReady}
                  />
                  <span className="text-sm" style={{ color: useClaudeCode ? 'var(--primary)' : 'inherit', fontWeight: useClaudeCode ? 600 : 400 }}>
                    Use Claude Code
                  </span>
                </label>

                <button
                  className="btn btn-success"
                  onClick={handleConvert}
                  disabled={converting || selectedFiles.size === 0}
                >
                  {converting ? (
                    <>
                      <div className="spinner" style={{ width: 16, height: 16 }} />
                      Converting...
                    </>
                  ) : (
                    `⚡ Convert ${selectedFiles.size} files`
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* File Type Breakdown */}
          {scanResult.files && scanResult.files.length > 0 && (() => {
            const extensions: Record<string, number> = {};
            scanResult.files.forEach(f => {
              const ext = f.extension?.toLowerCase() || 'unknown';
              extensions[ext] = (extensions[ext] || 0) + 1;
            });
            return Object.keys(extensions).length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h3>File Types</h3>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(extensions).map(([ext, count]) => (
                    <span key={ext} className="badge badge-info">
                      .{ext}: {count}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* File Tree */}
          <div className="card">
            <div className="card-header">
              <h3>Files</h3>
              <span className="text-sm text-muted">
                Right-click to exclude files or directories
              </span>
            </div>
            <FileTree
              files={scanResult.files || []}
              selectedFiles={selectedFiles}
              onSelectionChange={setSelectedFiles}
              onExclude={handleExclude}
            />
          </div>

          {/* Errors */}
          {scanResult.errors && scanResult.errors.length > 0 && (
            <div className="card" style={{ borderLeft: '4px solid var(--error)' }}>
              <div className="card-header">
                <h3 style={{ color: 'var(--error)' }}>Scan Errors</h3>
              </div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {scanResult.errors.map((err, i) => (
                  <li key={i} className="text-sm" style={{ color: 'var(--error)' }}>
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* No Results */}
      {!scanResult && !scanning && (
        <div className="card">
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
            <h3>No Directory Scanned</h3>
            <p>Enter a directory path above and click Scan to find convertible files.</p>
          </div>
        </div>
      )}

      {/* Exclude Modal */}
      {excludeModal && (
        <QuickExcludeModal
          path={excludeModal.path}
          type={excludeModal.type}
          onClose={() => setExcludeModal(null)}
          onExcluded={handleExcluded}
        />
      )}
    </div>
  );
}
