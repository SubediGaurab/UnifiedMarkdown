import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { logger } from '../../utils/logger.js';
import { ConfigService } from '../ConfigService.js';
import * as fs from 'fs';

export interface IGeminiOCRService {
  extractText(
    filePath: string,
    mimeType: string,
    customSystemPrompt?: string
  ): Promise<string>;
}

export class GeminiSingleFileOCRService implements IGeminiOCRService {
  private genAI: GoogleGenAI;

  constructor() {
    const apiKey = ConfigService.getApiKey();
    this.genAI = new GoogleGenAI({
      apiKey: apiKey,
    });
  }

  async extractText(
    filePath: string,
    mimeType: string,
    customSystemPrompt?: string
  ): Promise<string> {
    try {
      logger.debug(`Starting Gemini Single File OCR for ${filePath}`);

      const stats = fs.statSync(filePath);
      const isLargeFile = stats.size > 100 * 1024; // 100KB

      let contents: any[];
      let uploadedFile: any = null;

      if (isLargeFile) {
        logger.debug(
          `File is larger than 100KB, uploading via Files API: ${filePath}`
        );
        uploadedFile = await this.genAI.files.upload({
          file: filePath,
          config: { mimeType: mimeType },
        });

        contents = [
          {
            fileData: {
              fileUri: uploadedFile.uri,
              mimeType: mimeType,
            },
          },
        ];
      } else {
        const base64Data = fs.readFileSync(filePath, { encoding: 'base64' });
        contents = [
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data,
            },
          },
        ];
      }

      const model = ConfigService.getOcrModel();
      logger.debug(`Using Gemini model for OCR: ${model}`);

      try {
        const response = await this.genAI.models.generateContent({
          model: model,
          contents: contents,
          config: {
            thinkingConfig: {
              thinkingLevel: ThinkingLevel.HIGH,
            },
            systemInstruction: [
              {
                text:
                  customSystemPrompt ||
                  `### Role
You are an expert Document Digitizer.

### Task
Convert the attached file to Markdown using your best judgment to reflect the original content, structure, and context.

### Guidelines
- **Styles**: Apply Markdown formatting that best fits the visual hierarchy (e.g., headers, lists, blockquotes, bold/italics, etc.).
- **Text**: Extract all text
- **Non-Text**: Insert concise descriptions for visual elements (e.g., \`[Image: Logo]\`, \`[Signature]\`, \`[Stamp]\`, etc.).
- **Tables**: Represent tabular data using standard Markdown syntax.
- **Output**: Return ONLY the Markdown content.`,
              },
            ],
          },
        });

        if (!response.text) {
          const firstCandidate = response.candidates?.[0];
          if (firstCandidate?.finishReason && firstCandidate.finishReason !== 'STOP') {
            throw new Error(`Gemini blocked generation with reason: ${firstCandidate.finishReason}`);
          }
          throw new Error('Gemini returned an empty response.');
        }

        return response.text;
      } finally {
        if (uploadedFile) {
          logger.debug(`Cleaning up uploaded file: ${uploadedFile.name}`);
          try {
            await this.genAI.files.delete({ name: uploadedFile.name });
            logger.debug(`Successfully deleted file: ${uploadedFile.name}`);
          } catch (cleanupError) {
            logger.error(`Failed to delete uploaded file ${uploadedFile.name}: ${cleanupError}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Gemini Single File OCR failed: ${error}`);
      throw error;
    }
  }
}
