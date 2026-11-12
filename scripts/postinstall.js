#!/usr/bin/env node

/**
 * Postinstall script for UnifiedMarkdown
 * - In a source checkout: installs the web UI client's dependencies
 *   (the published package ships only the built UI, so this is skipped)
 * - Copies bundled Claude Code skills to ~/.claude/skills
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_SKILLS = ['convert-to-markdown'];

/**
 * Copy a directory recursively
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

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

/**
 * Main installation function
 */
function installSkills() {
  console.log('Installing UnifiedMarkdown Claude Code skills...');

  // Source: .claude/skills in the package root
  const bundledPath = path.resolve(__dirname, '..', '.claude', 'skills');

  // Destination: ~/.claude/skills
  const userSkillsPath = path.join(os.homedir(), '.claude', 'skills');

  // Check if bundled skills exist
  if (!fs.existsSync(bundledPath)) {
    console.log('  Note: Bundled skills not found. Skipping skills installation.');
    console.log('  Skills can be installed manually later.');
    return;
  }

  // Ensure ~/.claude directory exists
  const claudeDir = path.dirname(userSkillsPath);
  if (!fs.existsSync(claudeDir)) {
    try {
      fs.mkdirSync(claudeDir, { recursive: true });
    } catch (err) {
      console.error(`  Warning: Could not create ~/.claude directory: ${err.message}`);
      return;
    }
  }

  // Ensure ~/.claude/skills directory exists
  if (!fs.existsSync(userSkillsPath)) {
    try {
      fs.mkdirSync(userSkillsPath, { recursive: true });
    } catch (err) {
      console.error(`  Warning: Could not create skills directory: ${err.message}`);
      return;
    }
  }

  // Copy each required skill
  let installedCount = 0;
  for (const skillName of REQUIRED_SKILLS) {
    const srcSkillPath = path.join(bundledPath, skillName);
    const destSkillPath = path.join(userSkillsPath, skillName);

    if (!fs.existsSync(srcSkillPath)) {
      console.log(`  Warning: Skill '${skillName}' not found in bundle`);
      continue;
    }

    try {
      // Remove existing skill if present (to update)
      if (fs.existsSync(destSkillPath)) {
        fs.rmSync(destSkillPath, { recursive: true, force: true });
      }

      copyDirRecursive(srcSkillPath, destSkillPath);
      console.log(`  ✓ Installed skill: ${skillName}`);
      installedCount++;
    } catch (err) {
      console.error(`  Warning: Failed to install skill '${skillName}': ${err.message}`);
    }
  }

  if (installedCount > 0) {
    console.log(`\nSkills installed to: ${userSkillsPath}`);
    console.log('Claude Code integration is now available in the UI.');
  }
}

// Run installation
installUiDependencies();

try {
  installSkills();
} catch (err) {
  console.error(`Skills installation failed: ${err.message}`);
  // Don't fail the npm install
  process.exit(0);
}
