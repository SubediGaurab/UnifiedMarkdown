import { Router, Request, Response } from 'express';
import { execFile } from 'child_process';
import { platform } from 'os';

/**
 * Create browse routes - opens native OS directory picker
 */
export function createBrowseRoutes(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const os = platform();

    let cmd: string;
    let args: string[];

    if (os === 'darwin') {
      cmd = 'osascript';
      args = [
        '-e', 'tell application "Finder" to activate',
        '-e', 'POSIX path of (choose folder with prompt "Select a directory to scan")',
      ];
    } else if (os === 'win32') {
      cmd = 'powershell';
      args = [
        '-NoProfile',
        '-Command',
        `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath }`,
      ];
    } else {
      // Linux - try zenity, fall back to kdialog
      cmd = 'zenity';
      args = ['--file-selection', '--directory', '--title=Select a directory to scan'];
    }

    execFile(cmd, args, { timeout: 60000 }, (err, stdout) => {
      if (err) {
        // User cancelled or dialog not available
        res.json({ cancelled: true, path: null });
        return;
      }
      const selectedPath = stdout.trim().replace(/\/$/, ''); // strip trailing slash
      if (!selectedPath) {
        res.json({ cancelled: true, path: null });
        return;
      }
      res.json({ cancelled: false, path: selectedPath });
    });
  });

  return router;
}
