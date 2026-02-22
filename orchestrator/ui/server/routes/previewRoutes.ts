import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { platform } from 'os';

// Track Chrome preview window ID in memory (macOS only)
let previewWindowId: number | null = null;

// Extensions that should open with OS default app instead of Chrome
const OS_OPEN_EXTS = new Set(['doc', 'docx', 'pptx', 'ppt']);

function getMimeType(ext: string): string {
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',
    md: 'text/plain; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
  };
  return mimeMap[ext.toLowerCase()] || 'application/octet-stream';
}

/**
 * Validates that a path is absolute and contains no traversal.
 * Returns the resolved path on success, null on failure.
 */
function validateAbsolutePath(inputPath: string): string | null {
  if (!path.isAbsolute(inputPath)) return null;
  const resolved = path.resolve(inputPath);
  if (resolved !== inputPath) return null;
  return resolved;
}

/**
 * Build AppleScript to open a NEW tab in the Chrome preview window.
 * Always creates a new tab (never reuses existing tabs).
 * If the preview window no longer exists, creates a new window.
 * Returns the window ID.
 */
function buildAppleScript(
  url: string,
  storedWindowId: number | null,
): string {
  const reuseBlock =
    storedWindowId !== null
      ? `
    try
      set w to window id ${storedWindowId}
      tell w to make new tab with properties {URL:"${url}"}
      set index of w to 1
      set windowFound to true
    on error
      set windowFound to false
    end try`
      : '';

  return `tell application "Google Chrome"
  activate
  set windowFound to false
${reuseBlock}
  if not windowFound then
    make new window
    set w to window 1
    set URL of active tab of w to "${url}"
    return id of w
  end if
end tell`;
}

type ChromeOpenResult = {
  tabs: number;
  windowId?: number | null;
};

function openPathInDefaultApp(
  targetPath: string,
  os: NodeJS.Platform,
  callback: (error: string | null) => void,
): void {
  let cmd: string;
  let args: string[];

  if (os === 'darwin') {
    cmd = 'open';
    args = [targetPath];
  } else if (os === 'win32') {
    cmd = 'cmd';
    args = ['/c', 'start', '', targetPath];
  } else {
    cmd = 'xdg-open';
    args = [targetPath];
  }

  execFile(cmd, args, (err) => callback(err ? err.message : null));
}

function openUrlsInChrome(
  urls: string[],
  os: NodeJS.Platform,
  callback: (error: string | null, result?: ChromeOpenResult) => void,
): void {
  if (urls.length === 0) {
    callback(null, { tabs: 0 });
    return;
  }

  if (os === 'darwin') {
    const openNext = (index: number) => {
      const script = buildAppleScript(urls[index], previewWindowId);
      execFile('osascript', ['-e', script], (err, stdout) => {
        if (err) {
          callback(err.message);
          return;
        }

        // Capture window ID if a new window was created.
        const parsed = parseInt(stdout.trim(), 10);
        if (!isNaN(parsed)) {
          previewWindowId = parsed;
        }

        if (index < urls.length - 1) {
          openNext(index + 1);
          return;
        }

        callback(null, { tabs: urls.length, windowId: previewWindowId });
      });
    };

    openNext(0);
    return;
  }

  if (os === 'win32') {
    execFile('cmd', ['/c', 'start', 'chrome', ...urls], (err) => {
      callback(err ? err.message : null, err ? undefined : { tabs: urls.length });
    });
    return;
  }

  // Linux
  execFile('google-chrome', urls, (err) => {
    callback(err ? err.message : null, err ? undefined : { tabs: urls.length });
  });
}

function resolveMarkdownPath(
  originalPath: string,
  markdownPath?: string,
): string | null {
  const candidates: string[] = [];

  if (markdownPath) {
    const validProvided = validateAbsolutePath(markdownPath);
    if (validProvided) {
      candidates.push(validProvided);
    }
  }

  // Fallback: infer markdown path from original path so stale scan metadata still works.
  candidates.push(`${originalPath}.md`);

  for (const candidate of new Set(candidates)) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Ignore inaccessible candidates and continue.
    }
  }

  return null;
}

/**
 * Create preview routes for serving and opening files.
 */
export function createPreviewRoutes(): Router {
  const router = Router();

  /**
   * GET /api/preview/file?path=<encodedAbsolutePath>
   * Serves a file to Chrome with the appropriate MIME type.
   */
  router.get('/file', (req: Request, res: Response) => {
    const rawPath = req.query.path as string;
    if (!rawPath) {
      res.status(400).json({ error: 'Missing path parameter' });
      return;
    }

    const decoded = decodeURIComponent(rawPath);
    const validPath = validateAbsolutePath(decoded);
    if (!validPath) {
      res.status(400).json({ error: 'Invalid path: must be absolute with no traversal' });
      return;
    }

    if (!fs.existsSync(validPath)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const ext = path.extname(validPath).slice(1).toLowerCase();
    res.setHeader('Content-Type', getMimeType(ext));
    res.sendFile(validPath);
  });

  /**
   * POST /api/preview/open
   * Body: { originalPath: string, markdownPath?: string }
   * Opens the file in Chrome (most types) or the OS default app (DOCX/DOC/PPTX).
   * If markdown exists, also opens markdown in Chrome.
   */
  router.post('/open', (req: Request, res: Response) => {
    const { originalPath, markdownPath } = req.body as {
      originalPath?: string;
      markdownPath?: string;
    };

    if (!originalPath) {
      res.status(400).json({ error: 'Missing originalPath' });
      return;
    }

    const validOriginalPath = validateAbsolutePath(originalPath);
    if (!validOriginalPath) {
      res.status(400).json({ error: 'Invalid originalPath' });
      return;
    }

    const host = req.headers.host ?? 'localhost:3000';
    const baseUrl = `http://${host}`;
    const originalUrl = `${baseUrl}/api/preview/file?path=${encodeURIComponent(validOriginalPath)}`;
    const validMarkdownPath = resolveMarkdownPath(validOriginalPath, markdownPath);
    const markdownUrl = validMarkdownPath
      ? `${baseUrl}/api/preview/file?path=${encodeURIComponent(validMarkdownPath)}`
      : null;

    const isDirectory = fs.existsSync(validOriginalPath) && fs.statSync(validOriginalPath).isDirectory();
    const ext = path.extname(validOriginalPath).slice(1).toLowerCase();
    const os = platform();

    // Directories → open in OS file explorer
    if (isDirectory) {
      openPathInDefaultApp(validOriginalPath, os, (err) => {
        if (err) {
          res.status(500).json({ error: err });
        } else {
          res.json({ success: true, method: 'os' });
        }
      });
      return;
    }

    // DOCX/DOC/PPTX/PPT → OS default app; if markdown exists, also open markdown in Chrome.
    if (OS_OPEN_EXTS.has(ext)) {
      openPathInDefaultApp(validOriginalPath, os, (err) => {
        if (err) {
          res.status(500).json({ error: err });
          return;
        }

        if (!markdownUrl) {
          res.json({ success: true, method: 'os' });
          return;
        }

        openUrlsInChrome([markdownUrl], os, (markdownErr, chromeResult) => {
          if (markdownErr) {
            // Original opened fine; return partial success with markdown error.
            res.json({ success: true, method: 'os', markdownError: markdownErr });
            return;
          }

          res.json({
            success: true,
            method: 'os+chrome',
            tabs: chromeResult?.tabs ?? 1,
            windowId: chromeResult?.windowId,
          });
        });
      });
      return;
    }

    // Everything else → Chrome (open separate tabs for original + markdown)
    const urls = markdownUrl ? [originalUrl, markdownUrl] : [originalUrl];
    openUrlsInChrome(urls, os, (err, chromeResult) => {
      if (err) {
        res.status(500).json({ error: err });
        return;
      }

      res.json({
        success: true,
        method: 'chrome',
        tabs: chromeResult?.tabs ?? urls.length,
        windowId: chromeResult?.windowId,
      });
    });
  });

  return router;
}
