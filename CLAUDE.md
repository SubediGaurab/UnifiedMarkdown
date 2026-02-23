# UnifiedMarkdown (umd)

AI-powered CLI and web UI to convert images, PDFs, DOCX, and PPTX files to Markdown using Google Gemini.

## Project Structure

```
cli/
├── cli.ts                          # Entry point (Commander.js, #!/usr/bin/env node)
├── bin/                            # (reserved)
└── commands/
    ├── ConvertCommand.ts           # umd convert <path>
    └── SetupCommand.ts             # umd setup (API key config)

core/
├── constants/
│   └── fileTypes.ts                # Supported extensions, MIME types, type guards
├── interfaces/
│   ├── IConfig.ts                  # Config types (UmdConfig, UIConfig, DaemonConfig, ExclusionRule)
│   └── IOCRService.ts              # OCR service contract
├── services/
│   ├── AI/
│   │   ├── GeminiSingleFileOCRService.ts  # Gemini vision OCR (Files API for >100KB)
│   │   └── GeminiTextService.ts           # Text ops (summaries, captions, chart/slide analysis)
│   ├── OCR/
│   │   ├── OCRServiceFactory.ts    # Factory for file type routing
│   │   ├── ImageOCRService.ts      # Image → Markdown
│   │   ├── PdfOCRService.ts        # PDF → Markdown (whole file to Gemini)
│   │   ├── DocxConversionService.ts # DOCX → HTML (mammoth) → Markdown (turndown) with AI image captions and chart descriptions
│   │   ├── PptxOCRService.ts       # PPTX → PDF (LibreOffice headless) → Markdown
│   │   └── DirectoryOCRService.ts  # Recursive directory conversion
│   ├── ConfigService.ts            # API key + model config (~/.umd/config.json)
│   └── MarkdownSaverService.ts     # Output with timestamped backup
├── types/
│   └── turndown-plugin-gfm.d.ts    # Type declaration for turndown GFM plugin
└── utils/
    ├── dateUtils.ts                # Timestamp formatting for backups
    ├── fileUtils.ts                # Extension/basename helpers
    ├── logger.ts                   # Singleton logger (chalk, DEBUG env var)
    └── mimeTypes.ts                # Extension → MIME type mapping

orchestrator/
├── index.ts                        # Registers `orchestrate` command (alias `orch`)
├── cli/commands/
│   ├── ScanCommand.ts              # umd orch scan <dir>
│   ├── BatchConvertCommand.ts      # umd orch convert <dir>
│   ├── StatusCommand.ts            # umd orch status [jobId] / clear [jobId]
│   └── UICommand.ts                # umd orch ui
├── services/
│   ├── FileDiscoveryService.ts     # Directory scanning, .umdignore parsing
│   ├── ConversionStateService.ts   # Batch job persistence (~/.umd/orchestrator-state.json)
│   ├── ProcessManagerService.ts    # Child process spawning, concurrency, Claude Code mode
│   └── SkillsService.ts           # Claude Code skills installation/verification
├── ui/
│   ├── client/                     # React + Vite frontend (separate package.json)
│   │   ├── src/
│   │   │   ├── App.tsx             # Router (Dashboard, FileBrowser, Jobs, Settings)
│   │   │   ├── api/client.ts       # REST + SSE API client
│   │   │   ├── components/         # FileTree, ExclusionManager, LogViewer, ProgressBar, DaemonStatus
│   │   │   ├── pages/              # Dashboard, FileBrowser, Jobs, Settings
│   │   │   └── styles/oceanic.css  # Ocean theme stylesheet
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── server/
│   │   ├── UIServerService.ts      # Express server (static serving, SPA fallback, dev proxy)
│   │   └── routes/
│   │       ├── scanRoutes.ts       # POST /api/scan, GET /api/scan/result
│   │       ├── convertRoutes.ts    # POST /api/convert, GET /api/convert/status/:jobId
│   │       ├── exclusionRoutes.ts  # CRUD /api/exclusions
│   │       ├── eventsRoutes.ts     # GET /api/events (SSE)
│   │       ├── browseRoutes.ts     # GET /api/browse (native OS folder picker)
│   │       └── previewRoutes.ts    # GET /api/preview/file, POST /api/preview/open
│   └── services/
│       ├── ExclusionService.ts     # Custom exclusion rules (~/.umd/exclusions.json)
│       └── ScanCacheService.ts     # In-memory + disk scan cache (5 min TTL)
└── utils/
    └── pathInput.ts                # Path input helpers

scripts/
└── postinstall.js                  # Copies .claude/skills to ~/.claude/skills

.claude/skills/
├── convert-to-markdown/            # Claude Code skill for file conversion
│   ├── SKILL.md
│   └── convert-to-markdown.prose
└── open-prose/                     # OpenProse language runtime skill
    ├── SKILL.md
    ├── prose.md
    └── docs.md
```

## Key Patterns

- **Factory Pattern**: `OCRServiceFactory` routes to correct converter by file type
- **Strategy Pattern**: Each file type has a dedicated `IOCRService` implementation
- **Dependency Injection**: Services composed via constructors
- **SSE**: Real-time UI updates via Server-Sent Events during scan/conversion

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

## Development

```bash
npm install                                    # Install root deps
cd orchestrator/ui/client && npm install && cd ../../..  # Install UI client deps
npm run dev                                    # Start API + UI with hot reload
```

`npm run dev` runs both services concurrently:
- **API server** (Express) at `http://localhost:3000` — auto-restarts on server file changes (tsx --watch)
- **UI dev server** (Vite) at `http://localhost:5173` — HMR for React changes, proxies `/api` to port 3000

Open `http://localhost:5173` during development. Individual scripts:
- `npm run dev:api` — API server only
- `npm run dev:web` — UI dev server only
- `npm run dev:cli -- <command-and-args>` — run CLI from source
- `npm run dev:cli:watch -- <command-and-args>` — rerun CLI on TS file changes
- `npm run dev:server` and `npm run dev:ui` — aliases for dev:api and dev:web

## Commands

```bash
npm run dev            # Start dev servers (API + UI) with hot reload
npm run dev:api        # Start API dev server only
npm run dev:web        # Start UI dev server only (Vite)
npm run dev:cli -- ... # Run CLI from source (no build/link)
npm run dev:cli:watch -- ... # Watch mode for CLI from source
npm run build          # Compile TypeScript + build UI for production
npm run build:core     # Compile TypeScript only (no UI build)
npm run link           # Build + link globally
npm run lint           # ESLint (v9 flat config)
npm run format         # Prettier
```

## Supported Formats

- **Images**: PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF, TIF, SVG
- **Documents**: PDF, DOCX, PPTX, PPT

## Adding New File Types

1. Create service in `core/services/OCR/` implementing `IOCRService`
2. Add extension to `core/constants/fileTypes.ts`
3. Add case to `OCRServiceFactory.getService()`

## Tech Stack

- TypeScript 5.7 (strict mode)
- Commander.js (CLI framework)
- Google Gemini AI (@google/genai)
- Express (API server)
- React 18 + Vite 5 (web UI)
- Sharp (image processing)
- Mammoth.js (DOCX parsing)
- Turndown + GFM plugin (HTML to Markdown)
- adm-zip (DOCX chart extraction)
- LibreOffice (headless PPTX → PDF conversion)
- cross-spawn (child process management)
