# ImgBin

ImgBin is a TypeScript CLI for generating image assets, writing searchable metadata, creating thumbnails, and enriching images with AI recognition.

## Requirements

- Node.js 20+
- Access to an image generation HTTP API
- Optional access to a vision recognition HTTP API

## Installation

```bash
npm install
npm run build
```

During local development you can run the CLI without building:

```bash
npm run dev -- --help
```

You can bootstrap local configuration from the checked-in example:

```bash
cp .env.example .env
```

## Environment Variables

### Image generation provider

- `IMGBIN_IMAGE_API_URL`: required for `generate` and `batch` jobs that create new images
- `IMGBIN_IMAGE_API_KEY`: optional bearer token for the image API
- `IMGBIN_IMAGE_API_MODEL`: optional model identifier stored in metadata
- `IMGBIN_IMAGE_API_TIMEOUT_MS`: optional timeout override, defaults to `60000`

### Vision recognition provider

- `IMGBIN_VISION_API_URL`: required for `annotate` or `--annotate`
- `IMGBIN_VISION_API_KEY`: optional bearer token for the vision API
- `IMGBIN_VISION_API_MODEL`: optional model identifier stored in metadata
- `IMGBIN_VISION_API_TIMEOUT_MS`: optional timeout override, defaults to `60000`

### General runtime

- `IMGBIN_DEFAULT_OUTPUT_DIR`: optional default output root, defaults to `./library`
- `IMGBIN_THUMBNAIL_SIZE`: optional thumbnail size in pixels, defaults to `512`
- `IMGBIN_THUMBNAIL_FORMAT`: optional thumbnail format, defaults to `webp`
- `IMGBIN_THUMBNAIL_QUALITY`: optional thumbnail quality, defaults to `82`

## Commands

### Generate an image asset

```bash
imgbin generate \
  --prompt "orange dashboard hero for docs" \
  --output ./library \
  --tag dashboard \
  --tag hero \
  --annotate \
  --thumbnail
```

This creates a deterministic asset directory like `library/2026-03/orange-dashboard-hero/` containing:

- `original.<ext>`
- `thumbnail.webp` when thumbnail generation is enabled
- `metadata.json`

### Annotate an existing asset

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero
```

### Generate or refresh a thumbnail

```bash
imgbin thumbnail ./library/2026-03/orange-dashboard-hero
```

### Run a batch manifest

```bash
imgbin batch --manifest ./jobs/launch.yaml --output ./library --dry-run
```

Supported batch manifest shapes:

```yaml
jobs:
  - prompt: orange dashboard hero for docs
    slug: orange-dashboard-hero
    tags: [dashboard, hero]
    annotate: true
    thumbnail: true
  - assetPath: ./library/2026-03/existing-card
    annotate: true
```

## Metadata model

Each asset directory stores a `metadata.json` file with these high-level sections:

- `title` and `tags`: resolved fields used for search and display
- `generated`: prompt and generation provider context
- `recognized`: AI recognition suggestions
- `manual`: human-maintained title, tags, or description that take precedence by default
- `status`: per-step status for generation, recognition, and thumbnail creation
- `paths`: relative file paths for original and thumbnail assets
- `timestamps`: creation and update timestamps

Manual fields always win over AI suggestions unless your workflow edits them directly. Recognition updates refresh the `recognized` block and recalculate resolved `title` / `tags` without deleting manual values.

## Repository hygiene

This repository starts from scratch, so local build outputs and generated asset libraries are ignored by default:

- `dist/`
- `node_modules/`
- `.env*`
- `library/`
- temporary test output directories such as `.tmp/` and `.vitest-temp/`

If you want to commit sample assets, place them outside ignored runtime directories and document them explicitly.

## Notes on HTTP providers

The built-in HTTP providers use simple JSON contracts:

### Image generation request

```json
{
  "prompt": "orange dashboard hero for docs",
  "model": "my-image-model",
  "tags": ["dashboard", "hero"]
}
```

Supported image generation responses:

1. Raw image bytes (`Content-Type: image/png`, etc.)
2. JSON with `imageBase64`
3. JSON with `imageUrl`

### Vision recognition request

```json
{
  "imageBase64": "...",
  "mimeType": "image/png",
  "model": "my-vision-model"
}
```

Expected vision recognition response:

```json
{
  "title": "Orange analytics hero",
  "tags": ["dashboard", "orange", "saas"],
  "description": "A bright analytics dashboard for a landing page."
}
```

## Development workflow

```bash
npm install
npm run test
npm run build
```
