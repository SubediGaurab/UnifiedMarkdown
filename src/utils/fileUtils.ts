import * as path from 'path';

/**
 * Extracts the file extension from a file path
 * @param filePath - The path to the file
 * @returns The lowercase file extension without the dot (e.g., "pdf", "png"), or empty string if no extension
 * @example
 * getFileExtension('document.pdf') // returns 'pdf'
 * getFileExtension('/path/to/image.PNG') // returns 'png'
 * getFileExtension('file') // returns ''
 */
export function getFileExtension(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  // If the file has no extension or is a hidden file (starts with .)
  // and has no other dots, return empty string
  if (ext === filePath.toLowerCase()) {
    return '';
  }
  return ext;
}

/**
 * Gets the basename of a file without its extension
 * @param filePath - The path to the file
 * @returns The basename without the extension
 * @example
 * getBasenameWithoutExtension('/path/to/document.pdf') // returns 'document'
 * getBasenameWithoutExtension('image.png') // returns 'image'
 */
export function getBasenameWithoutExtension(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}
