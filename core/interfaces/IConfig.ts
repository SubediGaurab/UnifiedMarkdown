/**
 * UI server configuration
 */
export interface UIConfig {
  /** Port for the UI server @default 3000 */
  port?: number;
  /** Host to bind to @default 'localhost' */
  host?: string;
  /** Whether to open browser automatically on server start */
  openBrowserOnStart?: boolean;
  /**
   * Frontend dev server URL. When set, non-API routes are redirected here
   * instead of serving built static assets.
   * Example: 'http://localhost:5173'
   */
  frontendDevUrl?: string;
}

/**
 * Daemon/scheduler configuration
 */
export interface DaemonConfig {
  /** Whether daemon is enabled */
  enabled?: boolean;
  /** Scan interval in minutes @default 60 */
  scanIntervalMinutes?: number;
  /** Paths to watch for changes */
  watchPaths?: string[];
  /** Whether to auto-convert discovered files @default false */
  autoConvert?: boolean;
}

/**
 * Exclusion rule for files/directories
 */
export interface ExclusionRule {
  /** Unique identifier for the rule */
  id: string;
  /** Absolute path or glob pattern to exclude */
  pattern: string;
  /** Type of exclusion */
  type: 'file' | 'directory' | 'pattern';
  /** Scope: 'global' or specific root path */
  scope: 'global' | string;
  /** When the rule was created */
  createdAt: string;
}

export interface UmdConfig {
  geminiApiKey?: string;
  geminiOcrModel?: string;
  geminiTextModel?: string;

  openaiEndpoint?: string;
  openaiApiKey?: string;
  openaiOcrModel?: string;
  openaiTextModel?: string;

  /** Legacy fields for migration */
  apiKey?: string;
  aiEndpoint?: string;
  ocrModel?: string;
  textModel?: string;

  /**
   * Data storage location for all UMD files
   * @default '~/.umd'
   */
  dataLocation?: string;

  /**
   * UI server settings
   */
  ui?: UIConfig;

  /**
   * Daemon/scheduler settings
   */
  daemon?: DaemonConfig;
}
