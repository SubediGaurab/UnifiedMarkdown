import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';
import { ConfigService } from '../ConfigService.js';
import { SlideImage } from './GeminiTextService.js';

/**
 * OpenAI compatible service for text-based operations and vision text extraction
 */
export class OpenAITextService {
  private openai: OpenAI;

  constructor() {
    const apiKey = ConfigService.getOpenaiApiKey();
    const endpoint = ConfigService.getOpenaiEndpoint();
    this.openai = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL: endpoint || undefined,
    });
  }

  /**
   * Generate a summary of the provided text
   */
  async generateSummary(text: string): Promise<string> {
    try {
      const model = ConfigService.getOpenaiTextModel();
      logger.debug(`Generating document summary with OpenAI model: ${model}...`);

      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'user',
            content: `Summarize the following document:\n\n${text}`,
          },
        ],
      });

      return response.choices[0]?.message?.content || '';
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
      const model = ConfigService.getOpenaiOcrModel();
      logger.debug(`Generating image caption with OpenAI model: ${model}...`);

      const base64Data = imageBuffer.toString('base64');
      const dataUri = `data:${contentType};base64,${base64Data}`;

      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `This image appears in a document with the following summary:\n"${documentSummary}"\n\nProvide a brief, descriptive caption for this image. The caption should describe what the image shows and be relevant to the document context.\n\nReturn ONLY the caption text, nothing else.`,
              },
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

      return response.choices[0]?.message?.content?.trim() || 'Image';
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
      const model = ConfigService.getOpenaiTextModel();
      logger.debug(`Generating chart description with OpenAI model: ${model}...`);

      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [
          {
            role: 'user',
            content: `This is a chart from an Office document in DrawingML XML format. Analyze the chart data and structure to provide a concise description.\n\nDocument context: "${documentSummary}"\n\nChart XML:\n${chartXml}\n\nBased on the XML:\n1. Identify the chart type (bar, line, pie, etc.)\n2. Extract the data series, categories, and values\n3. Provide a brief, informative description of what the chart shows\n\nReturn ONLY a concise caption describing the chart (e.g., "A clustered bar chart comparing Column 1, Column 2, and Column 3 values across Row 1-4, with values ranging from 1.5 to 9.65"). Do not include any explanation of your analysis process.`,
          },
        ],
      });

      return response.choices[0]?.message?.content?.trim() || 'Chart';
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
      const model = ConfigService.getOpenaiOcrModel();
      logger.debug(`Generating content for slide ${slideNumber} with OpenAI model: ${model}...`);

      const contentParts: any[] = [];

      const prompt = `You are converting a PowerPoint slide to Markdown.

## Slide ${slideNumber} XML Content:
\`\`\`xml
${slideXml}
\`\`\`

${
  notesXml
    ? `## Speaker Notes XML:
\`\`\`xml
${notesXml}
\`\`\`
`
    : ''
}

${
  images.length > 0
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

      contentParts.push({ type: 'text', text: prompt });

      for (const image of images) {
        const base64Data = image.buffer.toString('base64');
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${image.contentType};base64,${base64Data}`,
          },
        });
      }

      const response = await this.openai.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: contentParts }],
      });

      return response.choices[0]?.message?.content?.trim() || `## Slide ${slideNumber}\n\n[Empty slide]`;
    } catch (error) {
      logger.error(`Slide content generation failed: ${error}`);
      throw error;
    }
  }
}
