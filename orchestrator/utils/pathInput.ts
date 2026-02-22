/**
 * Normalize user-provided path input by trimming whitespace and unwrapping
 * matching single/double quotes around the full string.
 */
export function normalizeInputPath(input: string): string {
  let normalized = input.trim();

  while (
    normalized.length >= 2 &&
    ((normalized.startsWith("'") && normalized.endsWith("'")) ||
      (normalized.startsWith('"') && normalized.endsWith('"')))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  // Strip any remaining unmatched leading/trailing quotes
  if (normalized.startsWith("'") || normalized.startsWith('"')) {
    normalized = normalized.slice(1).trim();
  }
  if (normalized.endsWith("'") || normalized.endsWith('"')) {
    normalized = normalized.slice(0, -1).trim();
  }

  return normalized;
}
