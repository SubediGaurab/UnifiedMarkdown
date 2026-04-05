/**
 * Strip markdown code block fences that AI models sometimes wrap around output.
 * Handles ```lang\n...\n``` patterns.
 */
export function stripMarkdownCodeBlock(text: string): string {
  return text.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
}

/**
 * Mask an API key for display, showing first 8 and last N characters.
 */
export function maskApiKey(apiKey: string, tailChars: number = 4): string {
  if (apiKey.length <= 12) return '****';
  return apiKey.substring(0, 8) + '...' + apiKey.substring(apiKey.length - tailChars);
}
