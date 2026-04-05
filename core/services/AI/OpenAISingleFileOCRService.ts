import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import { stripMarkdownCodeBlock } from '../../utils/textUtils.js';
import { ConfigService } from '../ConfigService.js';
import * as fs from 'fs';

export interface IAIOCRService {
  extractText(
    filePath: string,
    mimeType: string,
    customSystemPrompt?: string
  ): Promise<string>;
}

export class OpenAISingleFileOCRService implements IAIOCRService {
  private openai: OpenAI;

  constructor() {
    const apiKey = ConfigService.getOpenaiApiKey();
    const endpoint = ConfigService.getOpenaiEndpoint();
    this.openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: endpoint || undefined,
    });
  }

  async extractText(
    filePath: string,
    mimeType: string,
    customSystemPrompt?: string
  ): Promise<string> {
    try {
      logger.debug(`Starting OpenAI Single File OCR for ${filePath}`);

      const base64Data = fs.readFileSync(filePath, { encoding: 'base64' });
      const dataUri = `data:${mimeType};base64,${base64Data}`;

      const model = ConfigService.getOpenaiOcrModel();
      logger.debug(`Using OpenAI model for OCR: ${model}`);

      const defaultPrompt = `### Role
You are an expert Document Digitizer.

### Task
Convert the attached document or image to Markdown using your best judgment to reflect the original content, structure, and context.

### Guidelines
- **Styles**: Apply Markdown formatting that best fits the visual hierarchy (e.g., headers, lists, blockquotes, bold/italics, etc.).
- **Text**: Extract all text
- **Non-Text**: Insert concise descriptions for visual elements (e.g., \`[Image: Logo]\`, \`[Signature]\`, \`[Stamp]\`, etc.).
- **Tables**: Represent tabular data using standard Markdown syntax.
- **Output**: Return ONLY the Markdown content.`;

      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'system',
            content: customSystemPrompt || defaultPrompt,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: dataUri,
                },
              },
            ],
          },
        ],
      });

      const text = stripMarkdownCodeBlock(response.choices[0]?.message?.content || '');

      if (!text) {
        throw new Error('OpenAI returned an empty response.');
      }

      return text;
    } catch (error) {
      logger.error(`OpenAI Single File OCR failed: ${error}`);
      throw error;
    }
  }
}
