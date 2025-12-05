import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../../utils/logger.js';
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
        // 1. Check prerequisites
        if (!(await this.isCommandAvailable('libreoffice'))) {
            throw new Error("LibreOffice is required for PPTX conversion. Please install it (e.g., 'sudo apt install libreoffice').");
        }

        // 2. Create unique temp directory to avoid race conditions
        const uniqueTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umd-pptx-'));
        const originalBasename = path.basename(filePath, path.extname(filePath));
        const outputPdfPath = path.join(uniqueTempDir, originalBasename + '.pdf');
        const tempMdPath = outputPdfPath + '.md';

        try {
            logger.info(`Converting PPTX to PDF using LibreOffice: ${filePath}`);

            // 3. Convert using execFile to prevent command injection
            await execFilePromise('libreoffice', [
                '--headless',
                '--convert-to', 'pdf',
                '--outdir', uniqueTempDir,
                filePath
            ]);

            if (!fs.existsSync(outputPdfPath)) {
                const potentialFiles = fs.readdirSync(uniqueTempDir).filter(f => f.endsWith('.pdf'));
                logger.debug(`Files in temp dir: ${potentialFiles.join(', ')}`);
                throw new Error(`PDF conversion failed, output file not found at ${outputPdfPath}`);
            }

            logger.info(`Conversion successful. Processing PDF: ${outputPdfPath}`);

            // 4. Delegate to PDF Service
            await this.pdfService.extractText(outputPdfPath);

            // 5. Retrieve result and save to correct location
            if (fs.existsSync(tempMdPath)) {
                const content = fs.readFileSync(tempMdPath, 'utf8');
                this.markdownSaver.saveMarkdown(filePath, content);
            } else {
                logger.warning(`Expected markdown output not found at ${tempMdPath}. PDF processing might have failed.`);
            }

        } catch (error) {
            logger.error(`PPTX conversion failed: ${error}`);
            throw error;
        } finally {
            // 6. Cleanup entire temp directory (handles both PDF and MD files)
            if (fs.existsSync(uniqueTempDir)) {
                fs.rmSync(uniqueTempDir, { recursive: true, force: true });
            }
        }
    }

    private async isCommandAvailable(command: string): Promise<boolean> {
        try {
            await execFilePromise('which', [command]);
            return true;
        } catch {
            return false;
        }
    }
}
