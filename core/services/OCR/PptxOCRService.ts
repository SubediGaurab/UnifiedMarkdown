import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';
import { getBasenameWithoutExtension } from '../../utils/fileUtils.js';
import { IOCRService } from '../../interfaces/IOCRService.js';
import { PdfOCRService } from './PdfOCRService.js';
import { MarkdownSaverService } from '../MarkdownSaverService.js';

const execFilePromise = promisify(execFile);

export class PptxOCRService implements IOCRService {
  private pdfService: PdfOCRService;
  private markdownSaver: MarkdownSaverService;

  constructor() {
    this.pdfService = new PdfOCRService();
    this.markdownSaver = new MarkdownSaverService();
  }

  async extractText(filePath: string): Promise<void> {
    // 1. Validate input file
    if (!fs.existsSync(filePath)) {
      const error = `PPTX file does not exist: ${filePath}`;
      logger.error(error);
      throw new Error(error);
    }

    // 2. Check prerequisites
    const libreOfficeCommand = await this.resolveLibreOfficeCommand();
    if (!libreOfficeCommand) {
      const error =
        "LibreOffice is required for PPTX conversion. Could not find 'libreoffice' or 'soffice' in PATH. Please install it (e.g., 'brew install --cask libreoffice' on macOS or 'sudo apt install libreoffice' on Linux).";
      logger.error(error);
      throw new Error(error);
    }

    // 3. Create unique temp directory to avoid race conditions
    let uniqueTempDir: string;
    try {
      uniqueTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umd-pptx-'));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create temporary directory: ${errorMessage}`);
      throw new Error(`Temporary directory creation failed: ${errorMessage}`);
    }

    const originalBasename = getBasenameWithoutExtension(filePath);
    const outputPdfPath = path.join(uniqueTempDir, originalBasename + '.pdf');
    const tempMdPath = outputPdfPath + '.md';

    try {
      logger.info(`Converting PPTX to PDF using LibreOffice: ${filePath}`);

      // 4. Convert using execFile to prevent command injection
      try {
        await execFilePromise(libreOfficeCommand, [
          '--headless',
          '--convert-to',
          'pdf',
          '--outdir',
          uniqueTempDir,
          filePath,
        ]);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `LibreOffice conversion failed for ${filePath}: ${errorMessage}`
        );
        throw new Error(`LibreOffice conversion failed: ${errorMessage}`);
      }

      // 5. Verify PDF was created
      if (!fs.existsSync(outputPdfPath)) {
        const potentialFiles = fs
          .readdirSync(uniqueTempDir)
          .filter((f) => f.endsWith('.pdf'));
        logger.debug(`Files in temp dir: ${potentialFiles.join(', ')}`);
        const error = `PDF conversion failed, output file not found at ${outputPdfPath}`;
        logger.error(error);
        throw new Error(error);
      }

      logger.info(`Conversion successful. Processing PDF: ${outputPdfPath}`);

      // 6. Delegate to PDF Service
      try {
        await this.pdfService.extractText(outputPdfPath);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `PDF OCR failed for converted PPTX ${filePath}: ${errorMessage}`
        );
        throw new Error(`PDF OCR failed for converted PPTX: ${errorMessage}`);
      }

      // 7. Retrieve result and save to correct location
      if (fs.existsSync(tempMdPath)) {
        try {
          const content = fs.readFileSync(tempMdPath, 'utf8');
          this.markdownSaver.saveMarkdown(filePath, content);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger.error(
            `Failed to save markdown for ${filePath}: ${errorMessage}`
          );
          throw new Error(`Markdown save failed: ${errorMessage}`);
        }
      } else {
        const error = `Expected markdown output not found at ${tempMdPath}. PDF processing might have failed.`;
        logger.warning(error);
        throw new Error(error);
      }

      logger.info(`Successfully processed PPTX ${filePath}`);
    } catch (error) {
      // Re-throw if already a detailed error from above
      if (
        error instanceof Error &&
        (error.message.includes('does not exist') ||
          error.message.includes('failed') ||
          error.message.includes('not found'))
      ) {
        throw error;
      }
      // Otherwise, wrap with context
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`PPTX conversion failed for ${filePath}: ${errorMessage}`);
      throw new Error(
        `PPTX conversion failed for ${filePath}: ${errorMessage}`
      );
    } finally {
      // 8. Cleanup entire temp directory (handles both PDF and MD files)
      try {
        if (fs.existsSync(uniqueTempDir)) {
          fs.rmSync(uniqueTempDir, { recursive: true, force: true });
        }
      } catch (error) {
        // Log but don't throw - cleanup failures shouldn't break the operation
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.warning(
          `Failed to cleanup temporary directory ${uniqueTempDir}: ${errorMessage}`
        );
      }
    }
  }

  private async resolveLibreOfficeCommand(): Promise<string | null> {
    const commandCandidates = ['libreoffice', 'soffice'];
    for (const candidate of commandCandidates) {
      if (await this.isCommandAvailable(candidate)) {
        return candidate;
      }
    }

    // Fallbacks for common macOS install locations when PATH is limited.
    const absoluteCandidates = [
      '/Applications/LibreOffice.app/Contents/MacOS/soffice',
      path.join(os.homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
      '/opt/homebrew/bin/soffice',
      '/usr/local/bin/soffice',
    ];
    for (const candidate of absoluteCandidates) {
      if (await this.isCommandAvailable(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private async isCommandAvailable(command: string): Promise<boolean> {
    if (path.isAbsolute(command)) {
      return fs.existsSync(command);
    }

    try {
      const lookupCommand = process.platform === 'win32' ? 'where' : 'which';
      await execFilePromise(lookupCommand, [command]);
      return true;
    } catch {
      return false;
    }
  }
}
