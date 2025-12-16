/**
 * Generates a formatted timestamp string suitable for file names.
 * Format: YYYYMMDD.HHMMSS (e.g., "20251215.235959")
 *
 * @param date - Optional Date object to format. If not provided, uses current date/time
 * @returns Formatted timestamp string in YYYYMMDD.HHMMSS format
 *
 * @example
 * ```typescript
 * const timestamp = getFileTimestamp();
 * // Returns something like: "20251215.143022"
 *
 * const customDate = new Date('2024-12-25T10:30:45Z');
 * const customTimestamp = getFileTimestamp(customDate);
 * // Returns: "20241225.103045"
 * ```
 */
export function getFileTimestamp(date: Date = new Date()): string {
  // Convert to ISO string and remove separators: YYYYMMDDHHMMSS
  const timestamp = date.toISOString().replace(/[-:T]/g, '').split('.')[0]; // Remove milliseconds and timezone

  // Format: YYYYMMDD.HHMMSS
  const datePart = timestamp.substring(0, 8); // YYYYMMDD
  const timePart = timestamp.substring(8); // HHMMSS

  return `${datePart}.${timePart}`;
}
