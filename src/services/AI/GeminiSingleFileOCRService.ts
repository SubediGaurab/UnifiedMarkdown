import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { logger } from '../../utils/logger.js';
import { ConfigService } from '../ConfigService.js';
import * as fs from 'fs';

export interface IGeminiOCRService {
    extractText(filePath: string, mimeType: string): Promise<string>;
}

export class GeminiSingleFileOCRService implements IGeminiOCRService {
    private genAI: GoogleGenAI;

    constructor() {
        const apiKey = ConfigService.getApiKey();
        this.genAI = new GoogleGenAI({
            apiKey: apiKey,
        });
    }

    async extractText(filePath: string, mimeType: string): Promise<string> {
        try {
            logger.debug(`Starting Gemini Single File OCR for ${filePath}`);

            const base64Data = fs.readFileSync(filePath, { encoding: 'base64' });

            const contents = [
                {
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data,
                    },
                },
            ];

            const response = await this.genAI.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: contents,
                config: {
                    thinkingConfig: {
                        thinkingLevel: ThinkingLevel.HIGH,
                    },
                    systemInstruction: [
                        {
                            text: `### Role
You are an expert Document Digitizer.

### Task
Convert the attached file to Markdown using your best judgment to reflect the original content, structure, and context.

### Guidelines
- **Styles**: Apply Markdown formatting that best fits the visual hierarchy (e.g., headers, lists, blockquotes, bold/italics, etc.).
- **Text**: Extract all text
- **Non-Text**: Insert concise descriptions for visual elements (e.g., \`[Image: Logo]\`, \`[Signature]\`, \`[Stamp]\`, etc.).
- **Tables**: Represent tabular data using standard Markdown syntax.
- **Output**: Return ONLY the Markdown content.`,
                        }
                    ],
                },
            });

            return response.text || '';
        } catch (error) {
            logger.error(`Gemini Single File OCR failed: ${error}`);
            throw error;
        }
    }
}
