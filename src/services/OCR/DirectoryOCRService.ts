import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/logger.js';

import { IOCRService } from '../../interfaces/IOCRService.js';
import { OCRServiceFactory } from './OCRServiceFactory.js';

/**
 * OCR service for directories - recursively processes all files
 */
export class DirectoryOCRService implements IOCRService {
    async extractText(dirPath: string): Promise<void> {
        try {
            logger.info(`Starting OCR for directory ${dirPath}`);
            await this.processDirectory(dirPath);
            logger.info(`Successfully processed directory ${dirPath}`);
        } catch (error) {
            logger.error(`OCR failed: ${error}`);
            throw error;
        }
    }

    /**
     * Recursively process all files and subdirectories
     */
    private async processDirectory(dirPath: string): Promise<void> {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory()) {
                // Recursively process subdirectories
                logger.info(`Entering directory ${fullPath}`);
                await this.processDirectory(fullPath);
            } else if (entry.isFile()) {
                // Process individual files using the appropriate service
                await this.processFile(fullPath);
            }
        }
    }

    /**
     * Process a single file using the appropriate OCR service
     */
    private async processFile(filePath: string): Promise<void> {
        try {
            const service = OCRServiceFactory.getService(filePath);
            await service.extractText(filePath);
        } catch (error) {
            // Log the error but continue processing other files
            logger.error(`Failed to process ${filePath}: ${error}`);
        }
    }
}
