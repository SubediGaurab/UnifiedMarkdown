import { useMemo } from 'react';

interface LogEntry {
  timestamp: string;
  content: string;
  type: 'stdout' | 'stderr' | 'info';
}

interface LogViewerProps {
  stdout?: string;
  stderr?: string;
  title?: string;
  maxHeight?: number;
}

function parseLogLines(content: string, type: 'stdout' | 'stderr'): LogEntry[] {
  if (!content) return [];

  return content.split('\n').filter(Boolean).map((line) => {
    // Try to extract timestamp if present
    const timestampMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\]/);
    let timestamp = '';
    let logContent = line;

    if (timestampMatch) {
      timestamp = timestampMatch[1];
      logContent = line.slice(timestampMatch[0].length).trim();
    }

    return {
      timestamp,
      content: logContent,
      type,
    };
  });
}

function getLineClass(entry: LogEntry): string {
  if (entry.type === 'stderr') return 'error';

  const lower = entry.content.toLowerCase();
  if (lower.includes('error') || lower.includes('failed') || lower.includes('exception')) {
    return 'error';
  }
  if (lower.includes('warning') || lower.includes('warn')) {
    return 'warning';
  }
  if (lower.includes('success') || lower.includes('completed') || lower.includes('done')) {
    return 'success';
  }
  return '';
}

export default function LogViewer({ stdout, stderr, title, maxHeight = 400 }: LogViewerProps) {
  const entries = useMemo(() => {
    const stdoutLines = parseLogLines(stdout || '', 'stdout');
    const stderrLines = parseLogLines(stderr || '', 'stderr');

    // Interleave by timestamp if available, otherwise append stderr after stdout
    if (stdoutLines.some((l) => l.timestamp) && stderrLines.some((l) => l.timestamp)) {
      return [...stdoutLines, ...stderrLines].sort((a, b) =>
        a.timestamp.localeCompare(b.timestamp)
      );
    }

    return [...stdoutLines, ...stderrLines];
  }, [stdout, stderr]);

  if (entries.length === 0) {
    return (
      <div className="log-viewer" style={{ maxHeight }}>
        <div className="log-line">
          <span className="content" style={{ color: 'var(--gray-500)' }}>
            No logs available
          </span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {title && (
        <div className="mb-2" style={{ fontWeight: 500, color: 'var(--gray-700)' }}>
          {title}
        </div>
      )}
      <div className="log-viewer" style={{ maxHeight }}>
        {entries.map((entry, index) => (
          <div key={index} className={`log-line ${getLineClass(entry)}`}>
            {entry.timestamp && (
              <span className="timestamp">{entry.timestamp}</span>
            )}
            <span className="content">{entry.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Simple inline log viewer for quick display
interface InlineLogProps {
  log: string;
  type?: 'stdout' | 'stderr';
}

export function InlineLog({ log, type = 'stdout' }: InlineLogProps) {
  if (!log) return null;

  return (
    <pre
      style={{
        margin: 0,
        padding: '8px 12px',
        background: type === 'stderr' ? 'var(--error-light)' : 'var(--gray-100)',
        borderRadius: 'var(--border-radius)',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        maxHeight: 200,
        overflow: 'auto',
        color: type === 'stderr' ? 'var(--error)' : 'var(--gray-800)',
      }}
    >
      {log}
    </pre>
  );
}
