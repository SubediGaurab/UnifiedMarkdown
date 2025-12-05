# UnifiedMarkdown (umd)

AI-powered CLI to convert images, PDFs, DOCX, and PPTX files to Markdown using Google Gemini.

## Project Structure

```
src/
├── cli.ts                          # Entry point (Commander.js)
├── commands/                       # CLI commands
│   └── ConvertCommand.ts           # Main convert command
├── interfaces/
│   └── IOCRService.ts              # OCR service contract
├── services/
│   ├── AI/
│   │   ├── GeminiSingleFileOCRService.ts  # Gemini vision OCR
│   │   └── GeminiTextService.ts           # Text ops (summaries, captions)
│   ├── OCR/
│   │   ├── OCRServiceFactory.ts    # Factory for file type routing
│   │   ├── ImageOCRService.ts      # Image conversion
│   │   ├── PdfOCRService.ts        # PDF conversion (page-by-page)
│   │   ├── DocxConversionService.ts # DOCX via mammoth.js
│   │   ├── PptxOCRService.ts       # PPTX via LibreOffice -> PDF conversion
│   │   └── DirectoryOCRService.ts  # Batch processing
│   ├── ConfigService.ts            # API key (~/.umd/config.json)
│   └── MarkdownSaverService.ts     # Output with backup
└── utils/
    └── logger.ts                   # Logging utility


## Key Patterns

- **Factory Pattern**: `OCRServiceFactory` routes to correct converter by file type
- **Strategy Pattern**: Each file type has dedicated `IOCRService` implementation
- **Dependency Injection**: Services composed via constructors

## SOLID Principles

**Single Responsibility** - Each service does one thing:
- `GeminiSingleFileOCRService` - only extracts text via Gemini vision
- `MarkdownSaverService` - only handles file output with backups
- `DocxConversionService` - only converts DOCX files
- `PptxOCRService` - only converts PPTX to PDF via LibreOffice

**Open/Closed** - Add new file types without modifying existing code:
```typescript
// Just add to factory, no changes to commands or other services
if (ext === 'docx') return new DocxConversionService();
```

**Liskov Substitution** - All OCR services are interchangeable:
```typescript
// Any IOCRService works - ImageOCR, PdfOCR, DocxConversion
const service: IOCRService = OCRServiceFactory.getService(path);
await service.extractText(path);
```

**Interface Segregation** - Focused interface:
```typescript
interface IOCRService {
  extractText(filePath: string): Promise<void>;
}
```

**Dependency Inversion** - Depend on abstractions:
```typescript
// Commands depend on IOCRService interface, not concrete implementations
const service = OCRServiceFactory.getService(inputPath); // returns IOCRService
```

## Commands

```bash
npm run build          # Compile TypeScript
npm run link           # Build + link globally
umd setup              # Configure Gemini API key
umd convert <path>     # Convert file or directory
```

## Supported Formats

- **Images**: PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF, SVG
- **Documents**: PDF, DOCX, PPTX

## Adding New File Types

1. Create service in `src/services/OCR/` implementing `IOCRService`
2. Add case to `OCRServiceFactory.getService()`

## Tech Stack

- TypeScript 5.7 (strict mode)
- Commander.js (CLI)
- Google Gemini AI (@google/genai)
- Sharp (image processing)
- Mammoth.js (DOCX parsing)
- Turndown (HTML to Markdown)
- LibreOffice (headless conversion)
