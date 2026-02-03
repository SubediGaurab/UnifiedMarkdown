interface ProgressBarProps {
  value: number;
  max: number;
  showLabel?: boolean;
  variant?: 'default' | 'success' | 'error';
  size?: 'sm' | 'md' | 'lg';
}

export default function ProgressBar({
  value,
  max,
  showLabel = true,
  variant = 'default',
  size = 'md',
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;

  const heights = {
    sm: 4,
    md: 8,
    lg: 12,
  };

  return (
    <div>
      <div
        className={`progress-bar ${variant}`}
        style={{ height: heights[size] }}
      >
        <div
          className="progress"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <div
          className="flex justify-between mt-2"
          style={{ fontSize: '12px', color: 'var(--gray-500)' }}
        >
          <span>
            {value} / {max}
          </span>
          <span>{percentage}%</span>
        </div>
      )}
    </div>
  );
}

// Animated progress for indeterminate state
export function IndeterminateProgress() {
  return (
    <div className="progress-bar">
      <div
        className="progress"
        style={{
          width: '30%',
          animation: 'indeterminate 1.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes indeterminate {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}

// Circular progress indicator
interface CircularProgressProps {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
}

export function CircularProgress({
  value,
  max,
  size = 60,
  strokeWidth = 6,
}: CircularProgressProps) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--gray-200)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--ocean-light)"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
      {/* Center text */}
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dy="0.3em"
        style={{
          transform: 'rotate(90deg)',
          transformOrigin: 'center',
          fontSize: size * 0.25,
          fontWeight: 600,
          fill: 'var(--gray-700)',
        }}
      >
        {Math.round(percentage)}%
      </text>
    </svg>
  );
}

// Job status progress with counts
interface JobProgressProps {
  total: number;
  completed: number;
  failed: number;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
}

export function JobProgress({ total, completed, failed, status }: JobProgressProps) {
  const percentage = total > 0 ? Math.round(((completed + failed) / total) * 100) : 0;
  const successPercentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const failedPercentage = total > 0 ? Math.round((failed / total) * 100) : 0;

  return (
    <div>
      <div className="progress-bar" style={{ height: 10, position: 'relative', overflow: 'visible' }}>
        {/* Success portion */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${successPercentage}%`,
            background: 'linear-gradient(90deg, var(--success) 0%, var(--success-light) 100%)',
            borderRadius: '4px 0 0 4px',
            transition: 'width 0.3s ease',
          }}
        />
        {/* Failed portion */}
        <div
          style={{
            position: 'absolute',
            left: `${successPercentage}%`,
            top: 0,
            bottom: 0,
            width: `${failedPercentage}%`,
            background: 'linear-gradient(90deg, var(--error) 0%, var(--error-light) 100%)',
            borderRadius: failed > 0 && completed === 0 ? '4px 0 0 4px' : '0',
            transition: 'width 0.3s ease, left 0.3s ease',
          }}
        />
      </div>

      <div
        className="flex justify-between mt-2"
        style={{ fontSize: '12px', color: 'var(--gray-500)' }}
      >
        <div className="flex gap-4">
          <span style={{ color: 'var(--success)' }}>
            ✓ {completed} completed
          </span>
          {failed > 0 && (
            <span style={{ color: 'var(--error)' }}>
              ✗ {failed} failed
            </span>
          )}
          {status === 'running' && (
            <span style={{ color: 'var(--warning)' }}>
              ⋯ {total - completed - failed} remaining
            </span>
          )}
        </div>
        <span>{percentage}%</span>
      </div>
    </div>
  );
}
