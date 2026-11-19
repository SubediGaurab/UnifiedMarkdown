#!/usr/bin/env node

/**
 * Postinstall script for UnifiedMarkdown
 * - In a source checkout: installs the web UI client's dependencies
 *   (the published package ships only the built UI, so this is skipped)
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Install UI client dependencies, only when the UI source is present.
 */
function installUiDependencies() {
  const clientDir = path.resolve(__dirname, '..', 'orchestrator', 'ui', 'client');
  if (!fs.existsSync(path.join(clientDir, 'package.json'))) {
    return;
  }
  console.log('Installing web UI client dependencies...');
  const result = spawnSync('npm', ['install'], {
    cwd: clientDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error('Web UI client dependency install failed.');
    process.exit(result.status ?? 1);
  }
}

installUiDependencies();
