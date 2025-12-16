/**
 * MIME type utilities for file type detection
 */

import { IMAGE_MIME_TYPES, PDF_MIME_TYPE } from '../constants/fileTypes.js';

// Re-export constants for backward compatibility
export { IMAGE_MIME_TYPES, PDF_MIME_TYPE };

/**
 * Get MIME type from file extension
 * @param filePath - Path to the file
 * @param defaultMimeType - Default MIME type to return if extension is not recognized (defaults to 'image/png')
 * @returns MIME type string
 */
export function getMimeTypeFromExtension(
  filePath: string,
  defaultMimeType: string = 'image/png'
): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return IMAGE_MIME_TYPES[ext || ''] || defaultMimeType;
}
