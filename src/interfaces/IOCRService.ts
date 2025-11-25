/**
 * OCR result interface
 */
export interface OCRResult {
    text: string;
    confidence: number;
}

/**
 * OCR service interface
 */
export interface IOCRService {
    extractText(imagePath: string): Promise<void>;
}
