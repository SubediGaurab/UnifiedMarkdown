import { useState, useEffect, useCallback } from 'react';
import {
  getExclusions,
  addExclusion,
  deleteExclusion,
  exportExclusions,
  importExclusions,
  type ExclusionRule,
} from '../api/client';

interface ExclusionManagerProps {
  scope?: string;
  onRulesChange?: () => void;
}

export default function ExclusionManager({ scope, onRulesChange }: ExclusionManagerProps) {
  const [rules, setRules] = useState<ExclusionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPattern, setNewPattern] = useState('');
  const [newType, setNewType] = useState<'file' | 'directory' | 'pattern'>('pattern');
  const [filter, setFilter] = useState('');

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getExclusions(scope);
      setRules(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load exclusions');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim()) return;

    try {
      await addExclusion({
        pattern: newPattern.trim(),
        type: newType,
        scope: scope || 'global',
      });
      setNewPattern('');
      setShowAddForm(false);
      await loadRules();
      onRulesChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add exclusion');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteExclusion(id);
      await loadRules();
      onRulesChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete exclusion');
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportExclusions();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'exclusions.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export exclusions');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await importExclusions(data);
      await loadRules();
      onRulesChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import exclusions');
    }
  };

  const filteredRules = rules.filter(
    (rule) =>
      rule.pattern.toLowerCase().includes(filter.toLowerCase()) ||
      rule.type.toLowerCase().includes(filter.toLowerCase())
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'file':
        return '📄';
      case 'directory':
        return '📁';
      case 'pattern':
        return '✱';
      default:
        return '•';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <div className="spinner" />
        <span>Loading exclusions...</span>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="card" style={{ background: 'var(--error-light)', marginBottom: 16 }}>
          <p style={{ color: 'var(--error)', margin: 0 }}>{error}</p>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            className="form-input"
            placeholder="Filter exclusions..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 200 }}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>
            Export
          </button>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            Import
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              style={{ display: 'none' }}
            />
          </label>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAddForm(true)}
          >
            + Add Exclusion
          </button>
        </div>
      </div>

      {showAddForm && (
        <div className="card mb-4" style={{ background: 'var(--gray-50)' }}>
          <form onSubmit={handleAdd}>
            <div className="flex gap-2 items-end">
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Pattern</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g., *.tmp, node_modules, /path/to/file.pdf"
                  value={newPattern}
                  onChange={(e) => setNewPattern(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as typeof newType)}
                >
                  <option value="pattern">Pattern (glob)</option>
                  <option value="file">Exact File</option>
                  <option value="directory">Directory</option>
                </select>
              </div>
              <button type="submit" className="btn btn-success">
                Add
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowAddForm(false);
                  setNewPattern('');
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="exclusion-list">
        {filteredRules.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            <h3>No Exclusions</h3>
            <p>
              {filter
                ? 'No exclusions match your filter.'
                : 'Add exclusion rules to hide files from scans.'}
            </p>
          </div>
        ) : (
          filteredRules.map((rule) => (
            <div key={rule.id} className="exclusion-item">
              <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 18 }}>{getTypeIcon(rule.type)}</span>
                <span className="pattern truncate">{rule.pattern}</span>
                <span className="badge badge-info">{rule.type}</span>
                {rule.scope !== 'global' && (
                  <span className="badge badge-pending">{rule.scope}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">
                  {new Date(rule.createdAt).toLocaleDateString()}
                </span>
                <button
                  className="btn btn-icon btn-danger btn-sm"
                  onClick={() => handleDelete(rule.id)}
                  title="Remove exclusion"
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {rules.length > 0 && (
        <div className="mt-4 text-sm text-muted">
          {filteredRules.length} of {rules.length} exclusion rules
        </div>
      )}
    </div>
  );
}

// Quick add exclusion modal
interface QuickExcludeModalProps {
  path: string;
  type: 'file' | 'directory';
  onClose: () => void;
  onExcluded: () => void;
}

export function QuickExcludeModal({ path, type, onClose, onExcluded }: QuickExcludeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExclude = async () => {
    try {
      setLoading(true);
      await addExclusion({
        pattern: path,
        type,
        scope: 'global',
      });
      onExcluded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add exclusion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Exclude {type === 'directory' ? 'Directory' : 'File'}</h2>
        </div>
        <div className="modal-body">
          {error && (
            <div className="card mb-4" style={{ background: 'var(--error-light)' }}>
              <p style={{ color: 'var(--error)', margin: 0 }}>{error}</p>
            </div>
          )}
          <p>
            Are you sure you want to exclude this {type}? It will be hidden from all future scans.
          </p>
          <div
            style={{
              padding: '12px',
              background: 'var(--gray-100)',
              borderRadius: 'var(--border-radius)',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              marginTop: '12px',
              wordBreak: 'break-all',
            }}
          >
            {path}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-danger" onClick={handleExclude} disabled={loading}>
            {loading ? 'Excluding...' : 'Exclude'}
          </button>
        </div>
      </div>
    </div>
  );
}
