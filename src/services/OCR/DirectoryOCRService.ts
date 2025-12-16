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
      // Validate directory exists
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory does not exist: ${dirPath}`);
      }

      // Validate it's actually a directory
      const stats = fs.statSync(dirPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${dirPath}`);
      }

      logger.info(`Starting OCR for directory ${dirPath}`);
      await this.processDirectory(dirPath);
      logger.info(`Successfully processed directory ${dirPath}`);
    } catch (error) {
      // Re-throw if already a detailed error from above
      if (error instanceof Error && error.message.includes('does not exist')) {
        logger.error(error.message);
        throw error;
      }
      if (
        error instanceof Error &&
        error.message.includes('is not a directory')
      ) {
        logger.error(error.message);
        throw error;
      }
      // Otherwise, wrap with context
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Directory OCR failed for ${dirPath}: ${errorMessage}`);
      throw new Error(
        `Directory OCR processing failed for ${dirPath}: ${errorMessage}`
      );
    }
  }

  /**
   * Recursively process all files and subdirectories
   */
  private async processDirectory(dirPath: string): Promise<void> {
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to read directory ${dirPath}: ${errorMessage}`);
      throw new Error(`Directory read failed for ${dirPath}: ${errorMessage}`);
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      try {
        if (entry.isDirectory()) {
          // Recursively process subdirectories
          logger.info(`Entering directory ${fullPath}`);
          await this.processDirectory(fullPath);
        } else if (entry.isFile()) {
          // Process individual files using the appropriate service
          await this.processFile(fullPath);
        }
      } catch (error) {
        // Log the error but continue processing other entries
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`Failed to process ${fullPath}: ${errorMessage}`);
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to process file ${filePath}: ${errorMessage}`);
    }
  }
}
