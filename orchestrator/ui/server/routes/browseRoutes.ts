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
        '-Sta',
        '-NoProfile',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $f = New-Object System.Windows.Forms.Form; $f.TopMost = $true; $f.ShowInTaskbar = $false; $f.Opacity = 0; $f.Size = New-Object System.Drawing.Size(0,0); $f.WindowState = [System.Windows.Forms.FormWindowState]::Minimized; $f.Show(); $f.WindowState = [System.Windows.Forms.FormWindowState]::Normal; $f.Activate(); $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Select a directory to scan"; $d.ShowNewFolderButton = $true; if ($d.ShowDialog($f) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }',
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
