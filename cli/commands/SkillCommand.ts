import type { Command } from 'commander';
import { SkillsService } from '../../orchestrator/services/SkillsService.js';

export function registerSkillCommand(program: Command): void {
  program
    .command('skill')
    .description('Manage the optional Claude Code skill')
    .command('install')
    .description('Install the bundled skill into ~/.claude/skills')
    .action(() => {
      const { success, errors } = SkillsService.installSkills();
      for (const error of errors) {
        console.error(error);
      }
      if (!success) {
        process.exitCode = 1;
      }
    });
}
