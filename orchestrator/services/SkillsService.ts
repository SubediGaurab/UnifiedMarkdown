import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { logger } from '../../core/utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Service for managing bundled Claude Code skills
 * Skills are installed to ~/.claude/skills during app installation
 */
export class SkillsService {
  private static readonly SKILLS_DIR_NAME = '.claude/skills';
  private static readonly REQUIRED_SKILLS = ['convert-to-markdown', 'open-prose'];

  /**
   * Get the path to the bundled skills directory (source for installation)
   * This is the .claude/skills directory at the project/package root
   */
  static getBundledSkillsPath(): string {
    // Navigate from dist/orchestrator/services to project root
    return path.resolve(__dirname, '../../..', this.SKILLS_DIR_NAME);
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
   * Copy a directory recursively
   */
  private static copyDirRecursive(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Install skills from bundled package to user-level ~/.claude/skills
   * This should be called during app installation (postinstall)
   */
  static installSkills(): { success: boolean; installed: string[]; errors: string[] } {
    const bundledPath = this.getBundledSkillsPath();
    const userPath = this.getUserSkillsPath();
    const installed: string[] = [];
    const errors: string[] = [];

    if (!fs.existsSync(bundledPath)) {
      errors.push(`Bundled skills not found at: ${bundledPath}`);
      return { success: false, installed, errors };
    }

    // Ensure ~/.claude directory exists
    const claudeDir = path.dirname(userPath);
    if (!fs.existsSync(claudeDir)) {
      try {
        fs.mkdirSync(claudeDir, { recursive: true });
      } catch (err) {
        errors.push(`Failed to create ~/.claude directory: ${err}`);
        return { success: false, installed, errors };
      }
    }

    // Ensure ~/.claude/skills directory exists
    if (!fs.existsSync(userPath)) {
      try {
        fs.mkdirSync(userPath, { recursive: true });
      } catch (err) {
        errors.push(`Failed to create skills directory: ${err}`);
        return { success: false, installed, errors };
      }
    }

    // Copy each required skill
    for (const skillName of this.REQUIRED_SKILLS) {
      const srcSkillPath = path.join(bundledPath, skillName);
      const destSkillPath = path.join(userPath, skillName);

      if (!fs.existsSync(srcSkillPath)) {
        errors.push(`Skill not found in bundle: ${skillName}`);
        continue;
      }

      try {
        // Remove existing skill if present (to update)
        if (fs.existsSync(destSkillPath)) {
          fs.rmSync(destSkillPath, { recursive: true, force: true });
        }

        this.copyDirRecursive(srcSkillPath, destSkillPath);
        installed.push(skillName);
        logger.info(`Installed skill: ${skillName} -> ${destSkillPath}`);
      } catch (err) {
        errors.push(`Failed to install skill ${skillName}: ${err}`);
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
      if (!fs.existsSync(skillPath) || !fs.existsSync(path.join(skillPath, 'SKILL.md'))) {
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
      return fs.readdirSync(userSkillsPath).filter(name => {
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
    const normalizedPaths = filePaths.map(p => path.resolve(p));
    const splitPaths = normalizedPaths.map(p => p.split(path.sep));

    // Find the common prefix
    const minLength = Math.min(...splitPaths.map(p => p.length));
    let commonParts: string[] = [];

    for (let i = 0; i < minLength; i++) {
      const part = splitPaths[0][i];
      if (splitPaths.every(p => p[i] === part)) {
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
