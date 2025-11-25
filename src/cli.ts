#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get package.json version
 */
async function getVersion(): Promise<string> {
  try {
    const packagePath = path.join(__dirname, '../package.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf-8'));
    return packageJson.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

import { registerConvertCommand } from './commands/ConvertCommand.js';
import { registerSetupCommand } from './commands/SetupCommand.js';

/**
 * Main CLI function
 */
async function main() {
  const program = new Command();
  const version = await getVersion();

  program
    .name('umd')
    .description('UnifiedMarkdown - Convert images and PDFs to Markdown using AI')
    .version(version);

  registerSetupCommand(program);
  registerConvertCommand(program);

  program.parse();
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
