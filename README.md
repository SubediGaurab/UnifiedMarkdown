# UnifiedMarkdown (umd)

AI-powered CLI and web UI to convert images, PDFs, DOCX, and PPTX documents to Markdown using Google Gemini.

## Features

- **Format Support:** Convert images (PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF, SVG) and documents (PDF, DOCX, PPTX) to Markdown.
- **Batch Processing:** Scan and convert entire directories in parallel with configurable concurrency.
- **Web UI:** Built-in web dashboard to browse directories, manage conversions, configure exclusions, and monitor jobs in real time via SSE.
- **Directory Exclusions:** Respects `.umdignore` files (gitignore-style patterns) and custom exclusion rules managed through the UI.
- **Claude Code Skills:** Bundled skills let you alternatively convert files using natural language in Claude Code sessions.
- **One settings file:** API keys and models are read only from `~/.umd/.env`.

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

Every setting lives in one file, `~/.umd/.env`. It is the only source of truth: there are no built-in default models, no provider fallbacks, and shell environment variables are not read. If a setting a command needs is missing, `umd` stops with an error that names it.

Create it interactively:

```bash
umd setup
```

Or write it yourself (see `.env.example` in the repository):

```bash
# ~/.umd/.env
GEMINI_API_KEY=your-api-key-here
GEMINI_OCR_MODEL=your-ocr-model      # images, PDFs, slides
GEMINI_TEXT_MODEL=your-text-model    # summaries and captions

# Optional, only for --use-openai (any OpenAI compatible server)
# OPENAI_BASE_URL=http://127.0.0.1:1234/v1
# OPENAI_API_KEY=any-value-if-your-server-needs-none
# OPENAI_OCR_MODEL=
# OPENAI_TEXT_MODEL=
```

The web UI Settings page reads and writes the same file.

## Usage

### Convert a Single File

Converts a file to a `.md` file alongside the original:

```bash
umd convert photo.png
umd convert /path/to/document.pdf
```

### Convert a Directory (Sequential)

```bash
umd convert /path/to/directory
```


### Batch Convert a Directory in Parallel

Scan and convert all supported files concurrently:

```bash
umd orchestrate convert /path/to/directory
umd orch convert /path/to/directory --concurrency 5
umd orch convert /path/to/directory --dry-run
```

### Scan a Directory

Preview what would be converted without converting:

```bash
umd orchestrate scan /path/to/directory
umd orch scan /path/to/directory --pending-only
```


### Start the Web UI

Launch a local web dashboard to visually manage conversions:

```bash
umd orchestrate ui
umd orch ui --port 8080 --open
umd orch ui --host 100.x.y.z     # bind to one address, e.g. a Tailscale IP
```

The UI provides:
- **Dashboard** with live stats and activity feed
- **File Browser** with directory scanning, file tree with selection, and native OS folder picker
- **Jobs** page with real-time progress tracking and log viewer
- **Settings** for managing exclusion rules and editing `~/.umd/.env`

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

The Claude Code skill is optional. Install it into `~/.claude/skills` with:

```bash
umd skill install
```

Run this on the host running the web UI to enable its Claude Code option. In Claude Code, you can then convert files using natural language:

```
Convert document.pdf to markdown
Convert all files in ./docs/ to markdown
```

The web UI also has a "Use Claude Code" toggle for batch conversions, which uses the bundled skill with Claude Code's `--dangerously-skip-permissions` flag.

## License

MIT
