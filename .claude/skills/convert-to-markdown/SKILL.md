---
name: convert-to-markdown
description: Convert documents into clean Markdown (MD). Handles single files or entire directories. Use when the user wants to convert any file or directory to markdown format.
---

# Convert to Markdown

Convert visual and binary documents into clean, structured Markdown format.

## Supported File Types

PNG, JPG, JPEG, WEBP, GIF, BMP, TIFF, TIF, SVG, PDF, DOCX, PPT, PPTX

Skip text-native formats: .txt, .json, .md, .csv, .xml, .yaml, .yml, .html, .css, .js, .ts, etc.

## Conversion Instructions

```
You are a document digitization expert. Convert the provided document into clean, well-structured Markdown.

Structure:
- Use heading hierarchy (#, ##, ###) based on visual importance
- Lists for enumerated/bulleted items
- Blockquotes for callouts or distinct sections
- Tables for tabular data with proper alignment

Text Styling:
- **Bold** for emphasized text
- *Italics* for subtle emphasis or captions
- `Code` for technical terms
- Code blocks with language tags for code/data

Non-Text Elements:
- [Image: description] for images
- [Signature: name] or [Signature]
- [Chart: title] with key data if legible
- [Field: label] for form fields

Quality:
- Extract ALL text content
- Maintain logical reading order
- Preserve numbering and list structures
- Handle multi-column layouts sequentially
```

## Output Rules

```
- Save converted content to `{original_filename}.md` in the same directory as the source file
  - Example: `report.pdf` → `report.pdf.md`
- If the `.md` file already exists, create a timestamped backup first: `{original_filename}.{YYYYMMDD}.{HHMMSS}.md`
- Each sub-agent returns a one-line summary of what the document contained
```

## Workflow

### Step 1: Determine Input Type

Check whether the user's input path is a single file or a directory.

### Step 2a: Single File

Spawn one sub-agent (Task tool, subagent_type: "general-purpose", model: "opus") with:
- The conversion instructions
- The file path to convert
- The output rules above

### Step 2b: Directory (Batch Mode)

1. **Discover files**: Recursively list all files in the directory, excluding hidden files/directories (names starting with `.`).

2. **Filter**: Keep only files with supported extensions (see list above). Skip any file that already has a corresponding `.md` output file (e.g., skip `photo.png` if `photo.png.md` exists).

3. **Convert in parallel**: For each file to process, spawn a sub-agent (Task tool, subagent_type: "general-purpose", model: "opus") with the same conversion instructions and output rules. Run sub-agents in parallel — launch all Task calls in a single response.

4. **Report results**: After all sub-agents complete, present a summary table:

   | File | Status | Summary |
   |------|--------|---------|
   | report.pdf | Done | Quarterly earnings report with 3 charts |
   | photo.png | Done | Team photo from 2024 offsite |
   | notes.docx | Skipped | Already converted |
   | corrupt.pdf | Error | Failed to extract text |

   Status values: **Done** (converted), **Skipped** (already had .md), **Error** (failed)
