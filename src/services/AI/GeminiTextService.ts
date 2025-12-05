import { GoogleGenAI } from '@google/genai';
import { logger } from '../../utils/logger.js';
import { ConfigService } from '../ConfigService.js';

export interface SlideImage {
    filename: string;
    buffer: Buffer;
    contentType: string;
}

/**
 * Gemini service for text-based operations (summaries, captions, etc.)
 * Separated from OCR service for single responsibility
 */
export class GeminiTextService {
    private genAI: GoogleGenAI;

    constructor() {
        const apiKey = ConfigService.getApiKey();
        this.genAI = new GoogleGenAI({
            apiKey: apiKey,
        });
    }

    /**
     * Generate a summary of the provided text
     */
    async generateSummary(text: string): Promise<string> {
        try {
            logger.debug('Generating document summary with Gemini...');

            const response = await this.genAI.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: `Summarize the following document:\n\n${text}`,
                            },
                        ],
                    },
                ],
            });

            return response.text || '';
        } catch (error) {
            logger.error(`Summary generation failed: ${error}`);
            throw error;
        }
    }

    /**
     * Generate a caption for an image given document context
     */
    async generateImageCaption(
        imageBuffer: Buffer,
        contentType: string,
        documentSummary: string
    ): Promise<string> {
        try {
            logger.debug('Generating image caption with Gemini...');

            const base64Data = imageBuffer.toString('base64');

            const response = await this.genAI.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                inlineData: {
                                    mimeType: contentType,
                                    data: base64Data,
                                },
                            },
                            {
                                text: `This image appears in a document with the following summary:
"${documentSummary}"

Provide a brief, descriptive caption for this image. The caption should describe what the image shows and be relevant to the document context.

Return ONLY the caption text, nothing else.`,
                            },
                        ],
                    },
                ],
            });

            return response.text?.trim() || 'Image';
        } catch (error) {
            logger.error(`Image caption generation failed: ${error}`);
            throw error;
        }
    }

    /**
     * Generate a description for a chart from its DrawingML XML
     */
    async generateChartDescription(
        chartXml: string,
        documentSummary: string
    ): Promise<string> {
        try {
            logger.debug('Generating chart description with Gemini...');

            const response = await this.genAI.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: `This is a chart from an Office document in DrawingML XML format. Analyze the chart data and structure to provide a concise description.

Document context: "${documentSummary}"

Chart XML:
${chartXml}

Based on the XML:
1. Identify the chart type (bar, line, pie, etc.)
2. Extract the data series, categories, and values
3. Provide a brief, informative description of what the chart shows

Return ONLY a concise caption describing the chart (e.g., "A clustered bar chart comparing Column 1, Column 2, and Column 3 values across Row 1-4, with values ranging from 1.5 to 9.65"). Do not include any explanation of your analysis process.`,
                            },
                        ],
                    },
                ],
            });

            return response.text?.trim() || 'Chart';
        } catch (error) {
            logger.error(`Chart description generation failed: ${error}`);
            throw error;
        }
    }

    /**
     * Generate markdown content from PPTX slide XML and images
     */
    async generateSlideContent(
        slideNumber: number,
        slideXml: string,
        notesXml: string | null,
        images: SlideImage[]
    ): Promise<string> {
        try {
            logger.debug(`Generating content for slide ${slideNumber}...`);

            // Build content parts: text prompt + images
            const parts: any[] = [];

            // Add images first (if any)
            for (const image of images) {
                parts.push({
                    inlineData: {
                        mimeType: image.contentType,
                        data: image.buffer.toString('base64'),
                    },
                });
            }

            // Add the text prompt with XML
            const prompt = `You are converting a PowerPoint slide to Markdown.

## Slide ${slideNumber} XML Content:
\`\`\`xml
${slideXml}
\`\`\`

${notesXml
                    ? `## Speaker Notes XML:
\`\`\`xml
${notesXml}
\`\`\`
`
                    : ''
                }

${images.length > 0
                    ? `## Images
This slide contains ${images.length} image(s) shown above. Describe each image concisely.
`
                    : ''
                }

## Instructions:
1. Extract the slide title and all text content from the XML
2. Format as Markdown with "## Slide ${slideNumber}: [Title]" as the header
3. Convert bullet points to Markdown lists
4. If there are speaker notes, add them under "**Speaker Notes:**"
5. For each image, add a description like "[Image: description]"
6. Return ONLY the Markdown content, no explanations`;

            parts.push({ text: prompt });

            const response = await this.genAI.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: [{ role: 'user', parts }],
            });

            return response.text?.trim() || `## Slide ${slideNumber}\n\n[Empty slide]`;
        } catch (error) {
            logger.error(`Slide content generation failed: ${error}`);
            throw error;
        }
    }
}
