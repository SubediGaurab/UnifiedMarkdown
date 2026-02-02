/**
 * File type constants for supported formats
 * Centralized configuration for all file extensions and MIME types
 */

/**
 * Supported image file extensions
 */
export const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'tiff',
  'tif',
  'svg',
] as const;

/**
 * Supported PDF file extensions
 */
export const PDF_EXTENSIONS = ['pdf'] as const;

/**
 * Supported DOCX file extensions
 */
export const DOCX_EXTENSIONS = ['docx'] as const;

/**
 * Supported PowerPoint file extensions
 */
export const PPTX_EXTENSIONS = ['ppt', 'pptx'] as const;

/**
 * All supported document extensions (PDF, DOCX, PPTX)
 */
export const DOCUMENT_EXTENSIONS = [
  ...PDF_EXTENSIONS,
  ...DOCX_EXTENSIONS,
  ...PPTX_EXTENSIONS,
] as const;

/**
 * All supported file extensions (images and documents)
 */
export const ALL_SUPPORTED_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
] as const;

/**
 * Map of file extensions to MIME types for supported image formats
 */
export const IMAGE_MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  svg: 'image/svg+xml',
};

/**
 * MIME type for PDF files
 */
export const PDF_MIME_TYPE = 'application/pdf';

/**
 * MIME type for DOCX files
 */
export const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * MIME type for PPTX files
 */
export const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/**
 * Type guard to check if a file extension is a supported image format
 * @param ext - File extension to check (without the dot)
 * @returns True if the extension is a supported image format
 */
export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.includes(ext as any);
}

/**
 * Type guard to check if a file extension is a supported document format
 * @param ext - File extension to check (without the dot)
 * @returns True if the extension is a supported document format
 */
export function isDocumentExtension(ext: string): boolean {
  return DOCUMENT_EXTENSIONS.includes(ext as any);
}

/**
 * Type guard to check if a file extension is supported
 * @param ext - File extension to check (without the dot)
 * @returns True if the extension is supported
 */
export function isSupportedExtension(ext: string): boolean {
  return ALL_SUPPORTED_EXTENSIONS.includes(ext as any);
}
