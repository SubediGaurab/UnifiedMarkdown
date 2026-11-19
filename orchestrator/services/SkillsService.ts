import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { logger } from '../../core/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service for managing bundled Claude Code skills
 */
export class SkillsService {
  private static readonly SKILLS_DIR_NAME = '.claude/skills';
  private static readonly REQUIRED_SKILLS = [
    'convert-to-markdown',
  ];

  /**
   * Get the path to the bundled skills directory (source for installation)
   * This is the .claude/skills directory at the project/package root
   */
  static getBundledSkillsPath(): string {
    const parent = path.resolve(__dirname, '../..');
    const packageRoot = fs.existsSync(path.join(parent, 'package.json'))
      ? parent
      : path.dirname(parent);
    return path.join(packageRoot, this.SKILLS_DIR_NAME);
  }

  /**
   * Get the user-level skills directory path
   * This is ~/.claude/skills where Claude Code looks for skills
   */
  static getUserSkillsPath(): string {
    return path.join(os.homedir(), this.SKILLS_DIR_NAME);
  }

  /**
   * Check if skills are installed at user level
   */
  static hasUserSkills(): boolean {
    const userSkillsPath = this.getUserSkillsPath();
    return fs.existsSync(userSkillsPath);
  }

  /**
   * Install bundled Claude Code skills without overwriting local copies.
   */
  static installSkills(): {
    success: boolean;
    installed: string[];
    errors: string[];
  } {
    const installed: string[] = [];
    const errors: string[] = [];

    for (const skillName of this.REQUIRED_SKILLS) {
      const source = path.join(this.getBundledSkillsPath(), skillName, 'SKILL.md');
      const destination = path.join(this.getUserSkillsPath(), skillName, 'SKILL.md');

      try {
        const bundledSkill = fs.readFileSync(source);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        try {
          fs.writeFileSync(destination, bundledSkill, { flag: 'wx' });
          logger.info(`Installed skill: ${skillName} -> ${destination}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
            throw error;
          }
          if (!bundledSkill.equals(fs.readFileSync(destination))) {
            errors.push(`Skill already exists with different content at ${destination}. Move it aside to install the bundled copy.`);
            continue;
          }
          logger.info(`Skill already installed: ${skillName} -> ${destination}`);
        }
        installed.push(skillName);
      } catch (error) {
        errors.push(`Failed to install skill ${skillName}: ${error}`);
      }
    }

    return {
      success: installed.length === this.REQUIRED_SKILLS.length,
      installed,
      errors,
    };
  }

  /**
   * Verify all required skills for Claude Code conversion are present at user level
   */
  static verifyClaudeCodeSkills(): { valid: boolean; missing: string[] } {
    const userSkillsPath = this.getUserSkillsPath();
    const missing: string[] = [];

    for (const skill of this.REQUIRED_SKILLS) {
      const skillPath = path.join(userSkillsPath, skill);
      if (
        !fs.existsSync(skillPath) ||
        !fs.existsSync(path.join(skillPath, 'SKILL.md'))
      ) {
        missing.push(skill);
      }
    }

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Get list of installed skills at user level
   */
  static listInstalledSkills(): string[] {
    const userSkillsPath = this.getUserSkillsPath();

    if (!fs.existsSync(userSkillsPath)) {
      return [];
    }

    try {
      return fs.readdirSync(userSkillsPath).filter((name) => {
        const fullPath = path.join(userSkillsPath, name);
        return fs.statSync(fullPath).isDirectory();
      });
    } catch (error) {
      logger.error(`Failed to list installed skills: ${error}`);
      return [];
    }
  }

  /**
   * Find the common parent directory of a list of file paths
   * This is where Claude Code should be run from to have access to all files
   */
  static findCommonParent(filePaths: string[]): string {
    if (filePaths.length === 0) {
      return process.cwd();
    }

    if (filePaths.length === 1) {
      return path.dirname(filePaths[0]);
    }

    // Normalize all paths and split into components
    const normalizedPaths = filePaths.map((p) => path.resolve(p));
    const splitPaths = normalizedPaths.map((p) => p.split(path.sep));

    // Find the common prefix
    const minLength = Math.min(...splitPaths.map((p) => p.length));
    let commonParts: string[] = [];

    for (let i = 0; i < minLength; i++) {
      const part = splitPaths[0][i];
      if (splitPaths.every((p) => p[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }

    // Join common parts back into a path
    if (commonParts.length === 0) {
      // No common path (different drives on Windows, etc.)
      return path.dirname(normalizedPaths[0]);
    }

    let commonPath = commonParts.join(path.sep);

    // On Unix, ensure we have a leading slash
    if (path.sep === '/' && !commonPath.startsWith('/')) {
      commonPath = '/' + commonPath;
    }

    // If the common path is a file, get its directory
    if (fs.existsSync(commonPath) && fs.statSync(commonPath).isFile()) {
      commonPath = path.dirname(commonPath);
    }

    return commonPath;
  }

  /**
   * Get information about the skills configuration
   */
  static getSkillsInfo(): {
    userSkillsPath: string;
    bundledSkillsPath: string;
    hasUserSkills: boolean;
    installedSkills: string[];
    claudeCodeReady: boolean;
    missingSkills: string[];
  } {
    const verification = this.verifyClaudeCodeSkills();

    return {
      userSkillsPath: this.getUserSkillsPath(),
      bundledSkillsPath: this.getBundledSkillsPath(),
      hasUserSkills: this.hasUserSkills(),
      installedSkills: this.listInstalledSkills(),
      claudeCodeReady: verification.valid,
      missingSkills: verification.missing,
    };
  }
}
