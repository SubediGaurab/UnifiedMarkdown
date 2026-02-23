# UnifiedMarkdown (umd)

AI-powered CLI and web UI to convert images, PDFs, DOCX, and PPTX documents to Markdown using Google Gemini.

## Features

- **Format Support:** Convert images (PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF, SVG) and documents (PDF, DOCX, PPTX) to Markdown.
- **Batch Processing:** Scan and convert entire directories in parallel with configurable concurrency.
- **Web UI:** Built-in web dashboard to browse directories, manage conversions, configure exclusions, and monitor jobs in real time via SSE.
- **Directory Exclusions:** Respects `.umdignore` files (gitignore-style patterns) and custom exclusion rules managed through the UI.
- **Claude Code Skills:** Bundled skills let you convert files using natural language in Claude Code sessions.
- **Easy Setup:** Interactive CLI configuration for your Gemini API key.

## Prerequisites

- Node.js >= 18.0.0
- Google Gemini API key (free tier available at [Google AI Studio](https://aistudio.google.com/apikey))
- LibreOffice (required for PPTX/PPT conversion only):
  - macOS: `brew install libreoffice`
  - Ubuntu/Debian: `sudo apt install libreoffice`
  - Windows: Install from official website

## Installation

```bash
npm install -g unified-markdown
```

## Setup

Run the interactive setup to configure your Gemini API key:

```bash
umd setup
```

Alternatively, set the environment variable directly:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Configuration is stored at `~/.umd/config.json`.

## Usage

### Convert a Single File

Converts a file to a `.md` file alongside the original:

```bash
umd convert photo.png
umd convert /path/to/document.pdf
```

### Convert a Directory

```bash
umd convert /path/to/directory
```

### Scan a Directory

Preview what would be converted without converting:

```bash
umd orchestrate scan /path/to/directory
umd orch scan /path/to/directory --pending-only
```

### Batch Convert in Parallel

Scan and convert all supported files concurrently:

```bash
umd orchestrate convert /path/to/directory
umd orch convert /path/to/directory --concurrency 5
umd orch convert /path/to/directory --dry-run
```

### Start the Web UI

Launch a local web dashboard to visually manage conversions:

```bash
umd orchestrate ui
umd orch ui --port 8080 --open
```

The UI provides:
- **Dashboard** with live stats and activity feed
- **File Browser** with directory scanning, file tree with selection, and native OS folder picker
- **Jobs** page with real-time progress tracking and log viewer
- **Settings** for managing exclusion rules and viewing configuration

### Check Job Status

```bash
umd orchestrate status          # Show recent jobs
umd orch status <jobId>         # Show specific job details
umd orch status --all           # Show all jobs
```

## Supported File Types

- **Images:** `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`, `.tiff`, `.tif`, `.svg`
- **Documents:** `.pdf`, `.docx`, `.pptx`, `.ppt`

## `.umdignore`

Place a `.umdignore` file in any directory to exclude files from scanning and batch conversion. Uses gitignore-style patterns:

```
# Ignore all PDFs in this directory
*.pdf

# Ignore a specific subdirectory
drafts/

# Negation to re-include
!important.pdf
```

## Alternative: Claude Code Skills

If you use [Claude Code](https://docs.anthropic.com/en/docs/claude-code), this package includes bundled skills that are automatically installed to `~/.claude/skills` during `npm install`. Convert files using natural language:

```
Convert document.pdf to markdown
Convert all files in ./docs/ to markdown
```

The web UI also has a "Use Claude Code" toggle for batch conversions, which uses the bundled skill with Claude Code's `--dangerously-skip-permissions` flag.

## License

MIT
