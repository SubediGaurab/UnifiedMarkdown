# UnifiedMarkdown (umd)

AI-powered CLI tool to convert images, PDFs, and Word documents to Markdown using Google Gemini.

## Features

- Convert images (PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF, SVG) to Markdown
- Convert PDF documents to Markdown
- Convert DOCX files to Markdown with embedded image captions and chart descriptions
- Batch process entire directories
- Powered by Google Gemini AI for accurate text extraction
- Automatic backup of existing `.md` files
- Easy setup with interactive configuration

## Prerequisites

- Node.js >= 18.0.0
- Google Gemini API key (free tier available at [Google AI Studio](https://aistudio.google.com/apikey))
- LibreOffice (for PPTX conversion):
  - Ubuntu/Debian: `sudo apt install libreoffice`
  - MacOS: `brew install libreoffice`
  - Windows: Install from official website

## Installation

### Global Installation (Recommended)

Install from npm:

```bash
npm install -g unified-markdown
```

Or install locally from the repository:

```bash
# Clone the repository
git clone <repository-url>
cd UnifiedMarkdown

# Install globally
npm install -g .
```

### Local Development

```bash
# Clone the repository
git clone <repository-url>
cd UnifiedMarkdown

# Install dependencies
npm install

# Build and link globally for local development
npm run link
```

## Setup

After installation, run the setup command to configure your API key:

```bash
umd setup
```

This interactive setup will:
1. Prompt you for your Gemini API key
2. Validate the key with a test request
3. Save it to `~/.umd/config.json`

You can get a free API key from [Google AI Studio](https://aistudio.google.com/apikey).

### Alternative: Environment Variable

Instead of running setup, you can set the `GEMINI_API_KEY` environment variable:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Add this to your `~/.bashrc`, `~/.zshrc`, or equivalent to make it permanent.

## Usage

### Convert a Single File

Convert an image to Markdown:

```bash
umd convert image.png
```

Convert a PDF to Markdown:

```bash
umd convert document.pdf
```

Convert a Word document to Markdown:

```bash
umd convert document.docx
```

### Convert with Absolute Path

```bash
umd convert /path/to/file/image.png
```

### Batch Process a Directory

Convert all supported files in a directory:

```bash
umd convert /path/to/directory
```

### Output

The tool creates a `.md` file with the same name as the input file:
- `image.png` → `image.png.md`
- `document.pdf` → `document.pdf.md`

If a `.md` file already exists, it's automatically backed up with a timestamp:
- `image.png.md` → `image.png.md.20251123.143022` (YYYYMMDD.HHMMSS)

## Supported File Types

### Images
- PNG (`.png`)
- JPEG (`.jpg`, `.jpeg`)
- WebP (`.webp`)
- GIF (`.gif`)
- BMP (`.bmp`)
- TIFF (`.tiff`, `.tif`)
- SVG (`.svg`)

### Documents
- PDF (`.pdf`)
- Word (`.docx`)
- PowerPoint (`.pptx`)
