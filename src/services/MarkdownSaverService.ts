import * as fs from 'fs';
import { logger } from '../utils/logger.js';
import { getFileTimestamp } from '../utils/dateUtils.js';

export class MarkdownSaverService {
  /**
   * Save text to a markdown file, renaming existing file if necessary.
   * @param originalPath The path of the original file (e.g., image.png)
   * @param content The markdown content to save
   * @returns The path where the markdown was saved
   */
  public saveMarkdown(originalPath: string, content: string): string {
    const outputPath = `${originalPath}.md`;

    if (fs.existsSync(outputPath)) {
      const timestamp = getFileTimestamp();
      const backupPath = `${originalPath}.${timestamp}.md`;
      fs.renameSync(outputPath, backupPath);
      logger.info(`Renamed existing file to ${backupPath}`);
    }

    fs.writeFileSync(outputPath, content);
    logger.info(`Saved OCR result to ${outputPath}`);

    return outputPath;
  }
}
