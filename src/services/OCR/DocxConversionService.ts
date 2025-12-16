import * as fs from 'fs';
import mammoth from 'mammoth';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import AdmZip from 'adm-zip';
import { logger } from '../../utils/logger.js';
import { IOCRService } from '../../interfaces/IOCRService.js';
import { GeminiTextService } from '../AI/GeminiTextService.js';
import { MarkdownSaverService } from '../MarkdownSaverService.js';

interface ExtractedImage {
  index: number;
  buffer: Buffer;
  contentType: string;
  placeholder: string;
}

interface ExtractedChart {
  index: number;
  xmlContent: string;
}

/**
 * Conversion service for DOCX files using mammoth.js
 * Extracts text and images, uses Gemini for image captioning
 */
export class DocxConversionService implements IOCRService {
  private geminiTextService: GeminiTextService;
  private markdownSaver: MarkdownSaverService;
  private turndownService: TurndownService;

  /**
   * Creates a new DocxConversionService instance
   * @param geminiTextService - Optional Gemini text service instance for dependency injection (defaults to new instance)
   * @param markdownSaver - Optional markdown saver instance for dependency injection (defaults to new instance)
   * @param turndownService - Optional turndown service instance for dependency injection (defaults to new instance with GFM plugin)
   */
  public constructor(
    geminiTextService?: GeminiTextService,
    markdownSaver?: MarkdownSaverService,
    turndownService?: TurndownService
  ) {
    this.geminiTextService = geminiTextService ?? new GeminiTextService();
    this.markdownSaver = markdownSaver ?? new MarkdownSaverService();

    if (turndownService) {
      this.turndownService = turndownService;
    } else {
      this.turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      // Add GFM plugin for tables, strikethrough, and task lists
      this.turndownService.use(gfm);
    }
  }

  /**
   * Extract text from DOCX file and convert to markdown
   */
  async extractText(docxPath: string): Promise<void> {
    try {
      logger.info(`Starting DOCX conversion for ${docxPath}`);

      const buffer = fs.readFileSync(docxPath);
      const extractedImages: ExtractedImage[] = [];
      let imageIndex = 0;

      // Extract charts from DOCX (which is a zip file)
      const extractedCharts = this.extractChartsFromDocx(buffer);
      if (extractedCharts.length > 0) {
        logger.info(`Found ${extractedCharts.length} chart(s) in document`);
      }

      // Extract HTML with images captured in-memory
      const result = await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: mammoth.images.imgElement((image) => {
            return image.read('base64').then((base64Data) => {
              const placeholder = `__IMAGE_PLACEHOLDER_${imageIndex}__`;
              extractedImages.push({
                index: imageIndex,
                buffer: Buffer.from(base64Data, 'base64'),
                contentType: image.contentType,
                placeholder,
              });
              imageIndex++;
              return { src: placeholder };
            });
          }),
        }
      );

      // Log any warnings about unsupported elements
      if (result.messages.length > 0) {
        result.messages.forEach((msg) => {
          if (msg.type === 'warning') {
            logger.warning(`DOCX conversion warning: ${msg.message}`);
          }
        });
      }

      let html = result.value;

      // Get document summary for context (used for both images and charts)
      const rawText = await this.extractRawText(buffer);
      const summary =
        extractedImages.length > 0 || extractedCharts.length > 0
          ? await this.generateDocumentSummary(rawText)
          : '';

      // If there are images, process them with Gemini
      if (extractedImages.length > 0) {
        logger.info(
          `Found ${extractedImages.length} image(s), generating captions...`
        );

        // Generate captions for all images in parallel
        const captionResults = await Promise.all(
          extractedImages.map(async (image) => ({
            placeholder: image.placeholder,
            caption: await this.generateImageCaption(
              image.buffer,
              image.contentType,
              summary
            ),
          }))
        );

        // Replace placeholders with captions
        for (const { placeholder, caption } of captionResults) {
          html = html.replace(
            new RegExp(`<img[^>]*src="${placeholder}"[^>]*>`, 'g'),
            `<p><em>[Image: ${caption}]</em></p>`
          );
        }
      }

      // Process charts and generate descriptions
      let chartDescriptionsHtml = '';
      if (extractedCharts.length > 0) {
        logger.info(
          `Generating descriptions for ${extractedCharts.length} chart(s)...`
        );

        const chartResults = await Promise.all(
          extractedCharts.map(async (chart) => ({
            index: chart.index,
            description: await this.generateChartDescription(
              chart.xmlContent,
              summary
            ),
          }))
        );

        // Add chart descriptions as HTML paragraphs
        for (const { description } of chartResults) {
          chartDescriptionsHtml += `<p><em>[Chart: ${description}]</em></p>`;
        }
      }

      // Insert chart descriptions into HTML (after the first heading or at the beginning)
      if (chartDescriptionsHtml) {
        // Try to find chart position by looking for table data pattern in HTML
        // Charts in this document appear near the table, so insert after table or at a reasonable location
        const tableEndMatch = html.match(/<\/table>/i);
        if (tableEndMatch && tableEndMatch.index !== undefined) {
          // Insert after the table
          const insertPos = tableEndMatch.index + tableEndMatch[0].length;
          html =
            html.slice(0, insertPos) +
            chartDescriptionsHtml +
            html.slice(insertPos);
        } else {
          // Fallback: insert after first major heading
          const headingMatch = html.match(/<\/h[12]>/i);
          if (headingMatch && headingMatch.index !== undefined) {
            const insertPos = headingMatch.index + headingMatch[0].length;
            html =
              html.slice(0, insertPos) +
              chartDescriptionsHtml +
              html.slice(insertPos);
          } else {
            // Last resort: prepend to document
            html = chartDescriptionsHtml + html;
          }
        }
      }

      // Convert HTML to Markdown
      const markdown = this.turndownService.turndown(html);

      this.markdownSaver.saveMarkdown(docxPath, markdown);
      logger.info(`Successfully processed ${docxPath}`);
    } catch (error) {
      logger.error(`DOCX conversion failed: ${error}`);
      throw error;
    }
  }

  /**
   * Extract raw text from DOCX for summary generation
   */
  private async extractRawText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  /**
   * Generate a summary of the document using Gemini
   */
  private async generateDocumentSummary(text: string): Promise<string> {
    try {
      logger.debug('Generating document summary...');
      const summary = await this.geminiTextService.generateSummary(text);
      logger.debug('Document summary generated');
      return summary;
    } catch (error) {
      logger.warning(
        `Failed to generate summary, using truncated text: ${error}`
      );
      // Fallback to truncated text if summary generation fails
      return text.slice(0, 500) + (text.length > 500 ? '...' : '');
    }
  }

  /**
   * Generate a caption for an image using Gemini
   */
  private async generateImageCaption(
    imageBuffer: Buffer,
    contentType: string,
    documentSummary: string
  ): Promise<string> {
    try {
      const caption = await this.geminiTextService.generateImageCaption(
        imageBuffer,
        contentType,
        documentSummary
      );
      return caption;
    } catch (error) {
      logger.warning(`Failed to generate image caption: ${error}`);
      return 'Image';
    }
  }

  /**
   * Extract chart XML files from DOCX (which is a zip archive)
   */
  private extractChartsFromDocx(buffer: Buffer): ExtractedChart[] {
    const charts: ExtractedChart[] = [];

    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      let chartIndex = 0;
      for (const entry of entries) {
        // Chart files are typically in word/charts/chartN.xml
        if (entry.entryName.match(/^word\/charts\/chart\d+\.xml$/)) {
          const xmlContent = entry.getData().toString('utf8');
          charts.push({
            index: chartIndex,
            xmlContent,
          });
          chartIndex++;
          logger.debug(`Extracted chart: ${entry.entryName}`);
        }
      }
    } catch (error) {
      logger.warning(`Failed to extract charts from DOCX: ${error}`);
    }

    return charts;
  }

  /**
   * Generate a description for a chart using Gemini
   */
  private async generateChartDescription(
    chartXml: string,
    documentSummary: string
  ): Promise<string> {
    try {
      const description = await this.geminiTextService.generateChartDescription(
        chartXml,
        documentSummary
      );
      return description;
    } catch (error) {
      logger.warning(`Failed to generate chart description: ${error}`);
      return 'Chart';
    }
  }
}
