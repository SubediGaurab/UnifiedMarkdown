// API Client for UnifiedMarkdown Orchestrator

const API_BASE = '/api';

// Types matching backend
export interface ScanOptions {
  rootPath: string;
  recursive?: boolean;
  maxDepth?: number | null;
  extensions?: string[];
  excludeDirs?: string[];
}

export interface DiscoveredFile {
  path: string;
  name: string;
  extension: string;
  size: number;
  lastModified: Date;
  hasMarkdown: boolean;
  markdownPath?: string;
  markdownModified?: Date;
}

export interface ScanResult {
  rootPath: string;
  totalFiles: number;
  pending: DiscoveredFile[];
  converted: DiscoveredFile[];
  files: DiscoveredFile[];
  scannedAt: Date;
  extensions: Record<string, number>;
  errors: string[];
}

export interface ConversionRecord {
  filePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  stdout?: string;
  stderr?: string;
  outputPath?: string;
}

export interface BatchState {
  id: string;
  rootPath: string;
  startedAt: Date;
  completedAt?: Date;
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  files: ConversionRecord[];
}

// API response format from /api/convert/jobs
interface ApiJobResponse {
  jobId: string;
  rootPath: string;
  createdAt: string;
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    skipped: number;
  };
}

export interface ExclusionRule {
  id: string;
  pattern: string;
  type: 'file' | 'directory' | 'pattern';
  scope: 'global' | string;
  createdAt: string;
}

export interface DefaultExclusionRule {
  pattern: string;
  type: 'directory' | 'pattern';
  description?: string;
}

export interface ServerEvent {
  type: 'scan-start' | 'scan-progress' | 'scan-complete' | 'conversion-start' | 'conversion-progress' | 'conversion-complete' | 'file-log-update' | 'error';
  data: unknown;
  timestamp: string;
}

// API Functions
async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || 'API Error');
  }

  return response.json();
}

// Health
export async function checkHealth(): Promise<{ status: string; timestamp: string; uptime: number }> {
  return fetchJson('/health');
}

// Skills status
export interface SkillsStatus {
  claudeCodeReady: boolean;
  availableSkills: string[];
  missingSkills: string[];
  userSkillsPath: string;
}

export async function getSkillsStatus(): Promise<SkillsStatus> {
  return fetchJson('/skills/status');
}

// Scan API response type (matches actual backend response)
export interface ScanApiResponse {
  files: DiscoveredFile[];
  pending: DiscoveredFile[];
  converted: DiscoveredFile[];
  totalScanned: number;
  directoriesScanned: number;
  errors: string[];
  exclusionsApplied: number;
  excluded: ExcludedItem[];
  fromCache: boolean;
  cachedAt?: string;
}

export interface ExcludedItem {
  path: string;
  type: 'file' | 'directory';
  reason: string;
  rule: {
    source: 'default' | 'custom';
    type: 'file' | 'directory' | 'pattern';
    pattern: string;
    scope?: string;
    id?: string;
  };
}

export async function triggerScan(options: ScanOptions): Promise<ScanApiResponse> {
  return fetchJson('/scan', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

export async function getScanResult(rootPath?: string): Promise<ScanResult | ScanResult[]> {
  const query = rootPath ? `?rootPath=${encodeURIComponent(rootPath)}` : '';
  return fetchJson(`/scan/result${query}`);
}

export async function clearScanCache(rootPath?: string): Promise<void> {
  const query = rootPath ? `?rootPath=${encodeURIComponent(rootPath)}` : '';
  await fetchJson(`/scan/cache${query}`, { method: 'DELETE' });
}

// Convert API
export interface ConvertOptions {
  files: string[];
  concurrency?: number;
  skipConverted?: boolean;
  /** Use Claude Code with convert-to-markdown skill instead of standard UMD conversion */
  useClaudeCode?: boolean;
}

export async function startConversion(options: ConvertOptions): Promise<{ message: string; jobId: string; totalFiles: number }> {
  return fetchJson('/convert', {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

// API response format from /api/convert/status/:jobId
interface ApiJobStatusResponse {
  jobId: string;
  rootPath: string;
  createdAt: string;
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    failed: number;
    skipped: number;
  };
  files: Array<{
    path: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
    duration?: number;
    error?: string;
    outputPath?: string;
  }>;
}

export async function getJobStatus(jobId: string): Promise<BatchState> {
  const response = await fetchJson<ApiJobStatusResponse>(`/convert/status/${jobId}`);
  const stats = response.stats || { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0, skipped: 0 };

  // Determine status based on stats
  let status: BatchState['status'] = 'pending';
  if (stats.inProgress > 0) status = 'running';
  else if (stats.pending === 0 && stats.completed + stats.failed === stats.total) {
    status = stats.failed > 0 && stats.completed === 0 ? 'failed' : 'completed';
  }

  // Map files
  const files = (response.files || []).map((f): ConversionRecord => ({
    filePath: f.path || '',
    status: (f.status as ConversionRecord['status']) || 'pending',
    startedAt: f.startedAt ? new Date(f.startedAt) : undefined,
    completedAt: f.completedAt ? new Date(f.completedAt) : undefined,
    error: f.error,
    outputPath: f.outputPath,
  }));

  // Compute job completedAt from file completion times when job is done
  let completedAt: Date | undefined;
  if (status !== 'pending' && status !== 'running') {
    // Job is finished (completed, failed, or cancelled)
    const completedTimes = files
      .map(f => f.completedAt?.getTime())
      .filter((t): t is number => t !== undefined);
    if (completedTimes.length > 0) {
      completedAt = new Date(Math.max(...completedTimes));
    } else if (files.length > 0) {
      // Fallback: use the latest startedAt if no completedAt available
      const startedTimes = files
        .map(f => f.startedAt?.getTime())
        .filter((t): t is number => t !== undefined);
      if (startedTimes.length > 0) {
        completedAt = new Date(Math.max(...startedTimes));
      }
    }
  }

  return {
    id: response.jobId,
    rootPath: response.rootPath || '',
    startedAt: new Date(response.createdAt),
    completedAt,
    totalFiles: stats.total,
    completedFiles: stats.completed,
    failedFiles: stats.failed,
    status,
    files,
  };
}

export async function getJobLogs(jobId: string, fileIndex: number): Promise<ConversionRecord> {
  return fetchJson(`/convert/logs/${jobId}/${fileIndex}`);
}

export async function getJobLogsByPath(jobId: string, filePath: string): Promise<ConversionRecord> {
  return fetchJson(`/convert/logs/${jobId}/file/${encodeURIComponent(filePath)}`);
}

export async function cancelJob(jobId: string): Promise<void> {
  await fetchJson(`/convert/cancel/${jobId}`, { method: 'POST' });
}

export async function listJobs(): Promise<BatchState[]> {
  const response = await fetchJson<{ jobs: ApiJobResponse[] }>('/convert/jobs');
  const jobs = response.jobs || [];
  // Transform API response to BatchState format
  return jobs.map((job): BatchState => {
    const stats = job.stats || { total: 0, pending: 0, inProgress: 0, completed: 0, failed: 0, skipped: 0 };
    // Determine status based on stats
    let status: BatchState['status'] = 'pending';
    if (stats.inProgress > 0) status = 'running';
    else if (stats.pending === 0 && stats.completed + stats.failed === stats.total) {
      status = stats.failed > 0 && stats.completed === 0 ? 'failed' : 'completed';
    }
    return {
      id: job.jobId,
      rootPath: job.rootPath || '',
      startedAt: new Date(job.createdAt),
      totalFiles: stats.total,
      completedFiles: stats.completed,
      failedFiles: stats.failed,
      status,
      files: [],
    };
  });
}

export async function deleteJob(jobId: string): Promise<void> {
  await fetchJson(`/convert/jobs/${jobId}`, { method: 'DELETE' });
}

// Exclusions API
export async function getExclusions(scope?: string): Promise<ExclusionRule[]> {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  const response = await fetchJson<{ rules: ExclusionRule[]; total: number }>(`/exclusions${query}`);
  return response.rules || [];
}

export async function addExclusion(rule: Omit<ExclusionRule, 'id' | 'createdAt'>): Promise<ExclusionRule> {
  return fetchJson('/exclusions', {
    method: 'POST',
    body: JSON.stringify(rule),
  });
}

export async function deleteExclusion(id: string): Promise<void> {
  await fetchJson(`/exclusions/${id}`, { method: 'DELETE' });
}

export async function checkExclusion(path: string, scope?: string): Promise<{ excluded: boolean; matchedRule?: ExclusionRule }> {
  return fetchJson('/exclusions/check', {
    method: 'POST',
    body: JSON.stringify({ path, scope }),
  });
}

export async function exportExclusions(): Promise<ExclusionRule[]> {
  return fetchJson('/exclusions/export');
}

export async function importExclusions(rules: ExclusionRule[]): Promise<{ imported: number }> {
  return fetchJson('/exclusions/import', {
    method: 'POST',
    body: JSON.stringify({ rules }),
  });
}

export async function getDefaultExclusions(): Promise<DefaultExclusionRule[]> {
  const response = await fetchJson<{ defaults: DefaultExclusionRule[]; total: number }>('/exclusions/defaults');
  return response.defaults || [];
}

// SSE Hooks
export function createEventSource(onEvent: (event: ServerEvent) => void): EventSource {
  const eventSource = new EventSource(`${API_BASE}/events`);

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      // Event type is now included in the data payload
      onEvent({
        type: data.type,
        data: data,
        timestamp: data.timestamp,
      });
    } catch (err) {
      console.error('Failed to parse SSE event:', err);
    }
  };

  eventSource.onerror = (err) => {
    console.error('SSE error:', err);
  };

  return eventSource;
}

// React hook for SSE
import { useEffect, useState, useCallback } from 'react';

export function useServerEvents() {
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const eventSource = createEventSource((event) => {
      setEvents((prev) => [...prev.slice(-99), event]); // Keep last 100 events
    });

    eventSource.onopen = () => setConnected(true);
    eventSource.onerror = () => setConnected(false);

    return () => {
      eventSource.close();
    };
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { events, connected, clearEvents };
}

// Open a file in Chrome preview or OS default app
export async function openPreview(originalPath: string, markdownPath?: string): Promise<void> {
  await fetchJson('/preview/open', {
    method: 'POST',
    body: JSON.stringify({ originalPath, markdownPath }),
  });
}

// Browse for directory using native OS dialog
export async function browseDirectory(): Promise<string | null> {
  const res = await fetch(`${API_BASE}/browse`);
  if (!res.ok) throw new Error('Browse request failed');
  const data = await res.json();
  return data.cancelled ? null : data.path;
}

// Hook for specific event types
export function useEventListener(
  eventType: ServerEvent['type'],
  callback: (data: unknown) => void
) {
  useEffect(() => {
    const eventSource = createEventSource((event) => {
      if (event.type === eventType) {
        callback(event.data);
      }
    });

    return () => eventSource.close();
  }, [eventType, callback]);
}
