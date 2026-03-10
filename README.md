# ImgBin

ImgBin is a TypeScript CLI for generating image assets, importing existing images into a managed library, writing searchable metadata, searching managed libraries, creating thumbnails, and running local Claude CLI image metadata analysis.

## Requirements

- Node.js 20+
- Access to an image generation HTTP API for `generate`
- A local `claude` CLI installation for `annotate` / `--annotate`

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

## Release automation

ImgBin includes a GitHub Actions based npm publishing workflow for both prerelease and stable channels.

### Publishing channels

- Pushes to `main` publish a unique prerelease build to the npm `dev` dist-tag.
- Stable releases publish only from Git tags in the `vX.Y.Z` format and target the npm `latest` dist-tag.
- The stable release workflow fails if the Git tag version does not exactly match `package.json`.

### Trusted publishing prerequisites

Before the workflows can publish successfully:

1. configure npm trusted publishing for the `HagiCode-org/imgbin` GitHub repository,
2. ensure the publishing package owner has access to the `@hagicode/imgbin` package on npm, and
3. keep GitHub Actions enabled for the repository.

The workflows are designed to publish with GitHub OIDC identity and provenance, not a long-lived `NPM_TOKEN`.
Keep the trusted publisher configuration pointed at the repository's single publish workflow file.

### Local release verification

Before pushing a release tag, run the same checks used by CI:

```bash
npm run build
npm test
npm run pack:check
```

For a stable release, update `package.json` to the target version first and then push a matching tag such as `v0.1.0`.

## Usage guide

### Quick start for the current HagiCode site workflow

ImgBin now matches the Azure image-generation request format that was previously used in `repos/site/scripts/generate-image.sh`.

That means the current recommended setup is:

1. configure Azure image generation for output,
2. configure a local metadata-analysis model for the Claude-compatible CLI step, and
3. run `imgbin generate` directly or call it through the site wrapper.

### Minimal `.env` example

Put this in `repos/imgbin/.env`:

```bash
# Azure image generation
IMGBIN_IMAGE_API_URL="https://<resource>.openai.azure.com/openai/deployments/<deployment>/images/generations?api-version=<version>"
IMGBIN_IMAGE_API_KEY="<azure-api-key>"

# Optional fallback names also supported by ImgBin
# AZURE_ENDPOINT="https://<resource>.openai.azure.com/openai/deployments/<deployment>/images/generations?api-version=<version>"
# AZURE_API_KEY="<azure-api-key>"

# Metadata analysis model for the local Claude-compatible CLI
IMGBIN_ANALYSIS_API_MODEL="glm-5"

# Optional runtime tuning
IMGBIN_DEFAULT_OUTPUT_DIR="./library"
IMGBIN_IMAGE_API_TIMEOUT_MS="60000"
```

Notes:

- `IMGBIN_IMAGE_API_URL` / `IMGBIN_IMAGE_API_KEY` are the preferred names.
- `AZURE_ENDPOINT` / `AZURE_API_KEY` are accepted as compatibility fallbacks.
- GPT Image is used only for image generation.
- Metadata still comes from the local Claude-compatible analysis step.

## Environment Variables

### Image generation provider

- `IMGBIN_IMAGE_API_URL`: required for `generate` and batch jobs that create new images
- `IMGBIN_IMAGE_API_KEY`: optional bearer token for the image API
- `IMGBIN_IMAGE_API_MODEL`: optional model identifier stored in metadata
- `IMGBIN_IMAGE_API_TIMEOUT_MS`: optional timeout override, defaults to `60000`
- `AZURE_ENDPOINT`: compatibility fallback for `IMGBIN_IMAGE_API_URL`
- `AZURE_API_KEY`: compatibility fallback for `IMGBIN_IMAGE_API_KEY`

### Local Claude CLI analysis

- `IMGBIN_ANALYSIS_CLI_PATH`: optional local Claude executable path; defaults to `claude`
- `IMGBIN_ANALYSIS_API_MODEL`: preferred model identifier for ImgBin's local Claude analysis
- `ANTHROPIC_MODEL`: fallback shared Claude model identifier used when `IMGBIN_ANALYSIS_API_MODEL` is not set
- `IMGBIN_ANALYSIS_TIMEOUT_MS`: optional timeout override for the local Claude process, defaults to `60000`
- `IMGBIN_ANALYSIS_PROMPT_PATH`: optional override for the bundled default prompt file

If `IMGBIN_ANALYSIS_PROMPT_PATH` is not set, ImgBin falls back to `prompts/default-analysis-prompt.txt`.
If `IMGBIN_ANALYSIS_API_MODEL` is empty, ImgBin falls back to `ANTHROPIC_MODEL`.

### General runtime

- `IMGBIN_DEFAULT_OUTPUT_DIR`: optional default output root, defaults to `./library`
- `IMGBIN_THUMBNAIL_SIZE`: optional thumbnail size in pixels, defaults to `512`
- `IMGBIN_THUMBNAIL_FORMAT`: optional thumbnail format, defaults to `webp`
- `IMGBIN_THUMBNAIL_QUALITY`: optional thumbnail quality, defaults to `82`

## Unified workflows

### Generate one image with Azure + metadata analysis

```bash
imgbin generate \
  --prompt "A cheerful hand-drawn hero illustration of an AI coding assistant helping a developer at a desk." \
  --output ./library \
  --annotate
```

What happens:

1. ImgBin sends an Azure-style image request,
2. writes the generated file into a managed asset directory,
3. runs the local Claude-compatible metadata analysis step, and
4. stores structured metadata in `metadata.json`.

### Generate from raw prompt text

```bash
imgbin generate \
  --prompt "orange dashboard hero for docs" \
  --output ./library \
  --tag dashboard \
  --tag hero \
  --annotate \
  --thumbnail
```

### Generate from a docs-style `prompt.json`

```bash
imgbin generate \
  --prompt-file ../docs/src/content/docs/img/product-overview/value-proposition-ai-assisted-coding/prompt.json \
  --output ./library \
  --annotate
```

ImgBin reads the docs prompt file, extracts `userPrompt`, carries over generation parameters into metadata, and records the prompt file path as prompt provenance.

### Re-run metadata only

If image generation already succeeded and you only want to refresh title/tags/description:

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero --overwrite
```

This is useful after changing `IMGBIN_ANALYSIS_API_MODEL` or updating the analysis prompt.

### Annotate an existing managed asset

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero
```

### Import a standalone image into the library, then analyze it

```bash
imgbin annotate ./incoming/launch-hero.png \
  --import-to ./library \
  --tag imported \
  --thumbnail
```

This copies the source image into a new managed asset directory before writing `metadata.json`.

### Re-run analysis with a custom analysis prompt

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-prompt ./prompts/custom-analysis-prompt.txt \
  --overwrite
```

### Generate or refresh a thumbnail

```bash
imgbin thumbnail ./library/2026-03/orange-dashboard-hero
```

### Search a managed library

Search matches can use asset title, tags, description, generated prompt text, import provenance, and managed asset paths.

```bash
imgbin search \
  --library ./library \
  --query "orange hero" \
  --exact
```

For typo-tolerant retrieval, switch to fuzzy matching:

```bash
imgbin search \
  --library ./library \
  --query "orng herp" \
  --fuzzy
```

To rebuild the library index before searching:

```bash
imgbin search \
  --library ./library \
  --query "dashboard" \
  --reindex
```

To consume results from scripts:

```bash
imgbin search \
  --library ./library \
  --query "launch hero" \
  --json
```

ImgBin stores the reusable search index at `.imgbin/search-index.json` under the library root. Existing libraries do not need migration; the index is created lazily on first search and refreshed automatically after generate, import, annotate, and thumbnail operations when possible.

### Run a batch manifest

```bash
imgbin batch --manifest ./jobs/launch.yaml --output ./library
```

### Batch-process assets whose analysis is still pending or failed

```bash
imgbin batch --pending-library ./library
```

## Batch manifest examples

```yaml
jobs:
  - promptFile: ../docs/src/content/docs/img/product-overview/value-proposition-ai-assisted-coding/prompt.json
    slug: docs-ai-assisted-coding
    tags: [docs, hero]
    annotate: true
    thumbnail: true

  - assetPath: ./incoming/marketing-card.png
    importTo: ./library
    tags: [marketing, imported]
    thumbnail: true

  - assetPath: ./library/2026-03/existing-card
    overwriteRecognition: true
    analysisPromptPath: ./prompts/custom-analysis-prompt.txt

  - pendingLibrary: ./library
```

## Metadata model

Each asset directory stores a `metadata.json` file with these high-level sections:

- `source`: whether the asset was generated by ImgBin or imported from an external file
- `generated`: prompt text, provider context, docs prompt provenance, and generation params
- `recognized`: local Claude analysis suggestions plus prompt provenance
- `manual`: human-maintained title, tags, or description that take precedence by default
- `status`: per-step status for generation, recognition, and thumbnail creation
- `paths`: relative file paths for original and thumbnail assets
- `timestamps`: creation and update timestamps

Manual fields always win over AI suggestions unless you run an explicit overwrite flow. Recognition failures keep the asset on disk and mark the asset as retryable for later batch processing.

### Important payload note

ImgBin does not persist large image base64 blobs such as Azure `b64_json` into `metadata.json`.
The actual generated image is stored as the asset file on disk, while metadata keeps only the structured fields and lightweight provider details needed for diagnostics.

## Notes on analysis behavior

ImgBin does not call a remote Claude URL for metadata analysis. Instead, it:

1. loads the bundled or overridden analysis prompt,
2. passes the selected model to the local `claude` CLI,
3. asks Claude to inspect the local image file directly from disk, and
4. parses the returned JSON into metadata fields.

That means the only required Claude-side runtime setting is a usable model name plus a working local `claude` command.

## Notes on image provider requests

The built-in provider is now optimized for the Azure image-generation request format previously used by the site workflow.

### Current Azure-style request body

```json
{
  "prompt": "orange dashboard hero for docs",
  "size": "1024x1024",
  "quality": "high",
  "output_compression": 100,
  "output_format": "png",
  "n": 1
}
```

### Supported response shapes

1. Azure JSON with `data[0].b64_json`
2. Raw image bytes (`Content-Type: image/png`, etc.)
3. JSON with `imageBase64`
4. JSON with `imageUrl`

## Repository hygiene

This repository ignores local build outputs and generated asset libraries by default:

- `dist/`
- `node_modules/`
- `.env*`
- `library/`
- temporary test output directories such as `.tmp/` and `.vitest-temp/`

If you want to commit sample assets, place them outside ignored runtime directories and document them explicitly.

## Development workflow

```bash
npm install
npm run test
npm run build
```
