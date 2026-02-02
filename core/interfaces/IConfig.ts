export interface UmdConfig {
  apiKey?: string;
  /**
   * Gemini model to use for OCR operations (images, PDFs, PPTX slides)
   * @default 'gemini-3-pro-preview'
   */
  ocrModel?: string;
  /**
   * Gemini model to use for text operations (summaries, captions)
   * @default 'gemini-2.5-flash'
   */
  textModel?: string;
}
