import * as fs from 'fs';
import { IOCRService } from '../../interfaces/IOCRService.js';
import { ImageOCRService } from './ImageOCRService.js';
import { PdfOCRService } from './PdfOCRService.js';
import { DocxConversionService } from './DocxConversionService.js';
import { DirectoryOCRService } from './DirectoryOCRService.js';
import { PptxOCRService } from './PptxOCRService.js';
import { getFileExtension } from '../../utils/fileUtils.js';
import {
  IMAGE_EXTENSIONS,
  PPTX_EXTENSIONS,
} from '../../constants/fileTypes.js';

export class OCRServiceFactory {
  /**
   * Get the appropriate OCR service based on file type
   * @param inputPath - Path to the file or directory to process
   * @returns An instance of the appropriate OCR service
   * @throws Error if input path is invalid, file doesn't exist, or file type is unsupported
   */
  public static getService(inputPath: string): IOCRService {
    // Validate input path is provided
    if (!inputPath || inputPath.trim() === '') {
      throw new Error('Input path is required and cannot be empty');
    }

    // Check if file/directory exists and handle permission errors
    let stats;
    try {
      stats = fs.statSync(inputPath);
    } catch (error) {
      if (error instanceof Error) {
        if ('code' in error && error.code === 'ENOENT') {
          throw new Error(`File or directory not found: ${inputPath}`);
        } else if ('code' in error && error.code === 'EACCES') {
          throw new Error(`Permission denied accessing path: ${inputPath}`);
        }
        throw new Error(`Error accessing path ${inputPath}: ${error.message}`);
      }
      throw new Error(`Error accessing path ${inputPath}`);
    }

    // Handle directory input
    if (stats.isDirectory()) {
      return new DirectoryOCRService();
    }

    // Extract and validate file extension
    const ext = getFileExtension(inputPath);

    if (!ext) {
      throw new Error(
        `File has no extension: ${inputPath}. Supported formats: images (${IMAGE_EXTENSIONS.join(', ')}), pdf, docx, ppt, pptx`
      );
    }

    // Check for supported file types
    if (IMAGE_EXTENSIONS.includes(ext as any)) {
      return new ImageOCRService();
    }

    if (ext === 'pdf') {
      return new PdfOCRService();
    }

    if (ext === 'docx') {
      return new DocxConversionService();
    }

    if (PPTX_EXTENSIONS.includes(ext as any)) {
      return new PptxOCRService();
    }

    // Provide helpful error message with all supported formats
    throw new Error(
      `Unsupported file type: .${ext}\n` +
        `Supported formats:\n` +
        `  - Images: ${IMAGE_EXTENSIONS.join(', ')}\n` +
        `  - Documents: pdf, docx, ppt, pptx`
    );
  }
}
