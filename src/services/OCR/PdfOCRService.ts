import { logger } from '../../utils/logger.js';

import { IOCRService } from '../../interfaces/IOCRService.js';
import { GeminiSingleFileOCRService } from '../AI/GeminiSingleFileOCRService.js';
import { MarkdownSaverService } from '../MarkdownSaverService.js';

/**
 * OCR service implementation for PDF files using Gemini AI
 */
export class PdfOCRService implements IOCRService {
    private geminiService: GeminiSingleFileOCRService;
    private markdownSaver: MarkdownSaverService;

    public constructor() {
        this.geminiService = new GeminiSingleFileOCRService();
        this.markdownSaver = new MarkdownSaverService();
    }

    /**
     * Extract text from a PDF using Gemini API and save to markdown file
     */
    async extractText(pdfPath: string): Promise<void> {
        try {
            logger.info(`Starting PDF OCR for ${pdfPath}`);
            const mimeType = 'application/pdf';
            const text = await this.geminiService.extractText(pdfPath, mimeType);
            this.markdownSaver.saveMarkdown(pdfPath, text);
            logger.info(`Successfully processed ${pdfPath}`);
        } catch (error) {
            logger.error(`PDF OCR failed: ${error}`);
            throw error;
        }
    }
}
