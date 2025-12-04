import * as fs from 'fs';
import { IOCRService } from '../../interfaces/IOCRService.js';
import { ImageOCRService } from './ImageOCRService.js';
import { PdfOCRService } from './PdfOCRService.js';
import { DocxConversionService } from './DocxConversionService.js';
import { DirectoryOCRService } from './DirectoryOCRService.js';

export class OCRServiceFactory {
    public static getService(inputPath: string): IOCRService {
        if (fs.statSync(inputPath).isDirectory()) {
            return new DirectoryOCRService();
        }

        const ext = inputPath.split('.').pop()?.toLowerCase();

        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tiff', 'tif', 'svg'].includes(ext || '')) {
            return new ImageOCRService();
        }

        if (ext === 'pdf') {
            return new PdfOCRService();
        }

        if (ext === 'docx') {
            return new DocxConversionService();
        }

        throw new Error(`Unsupported file type: .${ext}`);
    }
}
