import { logger } from '../../utils/logger.js';

import { IOCRService } from '../../interfaces/IOCRService.js';
import { GeminiSingleFileOCRService } from '../AI/GeminiSingleFileOCRService.js';
import { MarkdownSaverService } from '../MarkdownSaverService.js';

/**
 * OCR service implementation using Gemini AI for Images
 */
export class ImageOCRService implements IOCRService {
    private geminiService: GeminiSingleFileOCRService;
    private markdownSaver: MarkdownSaverService;

    public constructor() {
        this.geminiService = new GeminiSingleFileOCRService();
        this.markdownSaver = new MarkdownSaverService();
    }

    /**
     * Extract text from image using Gemini API and save to markdown file
     */
    async extractText(imagePath: string): Promise<void> {
        try {
            logger.info(`Starting OCR for ${imagePath}`);

            const mimeType = this.getMimeType(imagePath);
            const text = await this.geminiService.extractText(imagePath, mimeType);

            // Save to file using MarkdownSaverService
            this.markdownSaver.saveMarkdown(imagePath, text);
            logger.info(`Successfully processed ${imagePath}`);
        } catch (error) {
            logger.error(`OCR failed: ${error}`);
            throw error;
        }
    }

    /**
     * Determine MIME type from file extension
     */
    private getMimeType(imagePath: string): string {
        const ext = imagePath.split('.').pop()?.toLowerCase();
        const mimeTypeMap: { [key: string]: string } = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp',
            'gif': 'image/gif',
            'bmp': 'image/bmp',
            'tiff': 'image/tiff',
            'tif': 'image/tiff',
            'svg': 'image/svg+xml',
        };
        return mimeTypeMap[ext || ''] || 'image/png';
    }
}
