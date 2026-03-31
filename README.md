# ImgBin

[![npm version](https://img.shields.io/npm/v/%40hagicode%2Fimgbin?logo=npm)](https://www.npmjs.com/package/@hagicode/imgbin)

[简体中文](./README_cn.md)

ImgBin is a TypeScript CLI for generating image assets, importing existing images into a managed library, writing searchable metadata, searching managed libraries, creating thumbnails, and running provider-routed multimodal image metadata analysis.

## AI-oriented docs

For repo-local AI guidance and command-selection references, start at [`./skills/README.md`](./skills/README.md) and then open [`./skills/imgbin-cli/SKILL.md`](./skills/imgbin-cli/SKILL.md). These skill docs complement the human-oriented README; they do not replace it.

## Requirements

- Node.js 20+
- Access to an image generation HTTP API for `generate`
- One configured analysis backend for `annotate` / `--annotate`: `claude`, `codex`, or a compatible HTTP vision API

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

ImgBin includes a GitHub Actions based npm publishing workflow for both prerelease and stable channels, plus a GitHub Release Drafter workflow that keeps the next stable release in draft form.

### Publishing channels

- Pushes to `main` publish a unique prerelease build to the npm `dev` dist-tag.
- Pushes to `main` also refresh the GitHub draft release notes through Release Drafter.
- Stable releases publish only when a GitHub draft release for tag `vX.Y.Z` is published and target the npm `latest` dist-tag.
- The stable release workflow derives the publish version from the GitHub Release tag, temporarily rewrites `package.json` to that version inside CI, and then verifies the rewritten manifest before publishing.

### Release draft flow

ImgBin now mirrors the Release Drafter pattern already used in `repos/hagicode-desktop`.

1. Merge PRs into `main` with the appropriate release labels (`major`, `minor`, `patch`, `feature`, `bug`, `docs`, and related categories).
2. Let `repos/imgbin/.github/workflows/release-drafter.yml` refresh the draft release notes in GitHub Releases.
3. Review the draft release in the GitHub UI.
4. If the release is not ready, continue merging fixes or delete the draft release directly in GitHub.
5. When ready, publish the draft release in GitHub. That `release.published` event triggers the stable npm `latest` publish workflow.

Release Drafter manages the draft notes only. Draft review, delete, and publish remain native GitHub Release operations; ImgBin intentionally does not add a custom draft lifecycle script on top.

### Trusted publishing prerequisites

Before the workflows can publish successfully:

1. configure npm trusted publishing for the `HagiCode-org/imgbin` GitHub repository,
2. ensure the publishing package owner has access to the `@hagicode/imgbin` package on npm, and
3. keep GitHub Actions enabled for the repository.

The workflows are designed to publish with GitHub OIDC identity and provenance, not a long-lived `NPM_TOKEN`.
Keep the trusted publisher configuration pointed at the repository's single publish workflow file.

### Local release verification

Before publishing a stable draft release, run the same checks used by CI:

```bash
npm run build
npm test
npm run pack:check
```

For a stable release:

1. make sure the Release Drafter draft uses the target stable tag such as `v0.1.1`,
2. optionally simulate the workflow locally by rewriting a temporary copy of `package.json` to `0.1.1` and running `node scripts/verify-release-version.mjs v0.1.1 /path/to/temp-package.json`, and
3. publish that draft release from the GitHub UI.

The stable publish workflow checks out the published release tag, resolves `0.1.1` from `v0.1.1`, temporarily rewrites `package.json` to `0.1.1`, and then validates that rewritten manifest before running `npm publish --tag latest`.

### Troubleshooting release drafts

- If the draft notes are empty or mis-categorized, check the merged PR labels against `repos/imgbin/.github/release-drafter.yml`.
- If `latest` did not publish after releasing the draft, inspect `repos/imgbin/.github/workflows/npm-publish-dev.yml` for the `release.published` run.
- If the workflow reports a version mismatch, compare the published release tag with the temporary `package.json` rewrite step output and rerun after correcting the release tag or manifest source.
- If you need to discard a pending stable release, delete the draft release in GitHub before publishing it.

## Usage guide

### Quick start for the current HagiCode site workflow

ImgBin now matches the Azure image-generation request format that was previously used in `repos/site/scripts/generate-image.sh`.

That means the current recommended setup is:

1. configure Azure image generation for output,
2. configure a non-interactive multimodal analysis provider (`claude`, `codex`, or `http`), and
3. run `imgbin generate` directly or call it through the site wrapper or CI automation.

### Minimal `.env` example

Put this in `repos/imgbin/.env`:

```bash
# Azure image generation
IMGBIN_IMAGE_API_URL="https://<resource>.openai.azure.com/openai/deployments/<deployment>/images/generations?api-version=<version>"
IMGBIN_IMAGE_API_KEY="<azure-api-key>"

# Optional fallback names also supported by ImgBin
# AZURE_ENDPOINT="https://<resource>.openai.azure.com/openai/deployments/<deployment>/images/generations?api-version=<version>"
# AZURE_API_KEY="<azure-api-key>"

# Select one metadata analysis backend
IMGBIN_ANALYSIS_PROVIDER="codex"

# Codex multimodal analysis
IMGBIN_CODEX_CLI_PATH="codex"
IMGBIN_CODEX_MODEL="gpt-5-codex"
# Optional if Codex is already configured globally
# IMGBIN_CODEX_BASE_URL="https://api.openai.com/v1"
# IMGBIN_CODEX_API_KEY="<codex-api-key>"

# Claude-compatible analysis remains available
# IMGBIN_ANALYSIS_PROVIDER="claude"
# IMGBIN_ANALYSIS_CLI_PATH="claude"
# IMGBIN_ANALYSIS_API_MODEL="glm-5"
# ANTHROPIC_MODEL="glm-5"

# Or route analysis through a compatible HTTP vision endpoint
# IMGBIN_ANALYSIS_PROVIDER="http"
# IMGBIN_VISION_API_URL="https://example.com/vision"
# IMGBIN_VISION_API_KEY="<vision-api-key>"
# IMGBIN_VISION_API_MODEL="vision-model"

# Optional runtime tuning
IMGBIN_DEFAULT_OUTPUT_DIR="./library"
IMGBIN_IMAGE_API_TIMEOUT_MS="60000"
IMGBIN_ANALYSIS_TIMEOUT_MS="60000"
```

Notes:

- `IMGBIN_IMAGE_API_URL` / `IMGBIN_IMAGE_API_KEY` are the preferred names.
- `AZURE_ENDPOINT` / `AZURE_API_KEY` are accepted as compatibility fallbacks.
- GPT Image is used only for image generation.
- `IMGBIN_ANALYSIS_PROVIDER` defaults to `claude` for backward compatibility when omitted.
- All three analysis backends share the same scene-aware prompt builder, validation rules, and metadata provenance fields.

## Environment Variables

### Image generation provider

- `IMGBIN_IMAGE_API_URL`: required for `generate` and batch jobs that create new images
- `IMGBIN_IMAGE_API_KEY`: optional bearer token for the image API
- `IMGBIN_IMAGE_API_MODEL`: optional model identifier stored in metadata
- `IMGBIN_IMAGE_API_TIMEOUT_MS`: optional timeout override, defaults to `60000`
- `AZURE_ENDPOINT`: compatibility fallback for `IMGBIN_IMAGE_API_URL`
- `AZURE_API_KEY`: compatibility fallback for `IMGBIN_IMAGE_API_KEY`

### Multimodal analysis routing

- `IMGBIN_ANALYSIS_PROVIDER`: selects `claude`, `codex`, or `http`; defaults to `claude`
- `IMGBIN_ANALYSIS_PROMPT_PATH`: optional override for the bundled default prompt file
- `IMGBIN_ANALYSIS_TIMEOUT_MS`: shared timeout fallback for analysis providers, defaults to `60000`

### Claude CLI analysis

- `IMGBIN_ANALYSIS_CLI_PATH`: optional local Claude executable path; defaults to `claude`
- `IMGBIN_CLAUDE_CLI_PATH`: explicit alias for the Claude executable path
- `IMGBIN_ANALYSIS_API_MODEL`: preferred model identifier for ImgBin's local Claude analysis
- `IMGBIN_CLAUDE_MODEL`: explicit alias for the Claude model identifier
- `ANTHROPIC_MODEL`: fallback shared Claude model identifier used when `IMGBIN_ANALYSIS_API_MODEL` is not set
- `IMGBIN_CLAUDE_TIMEOUT_MS`: optional timeout override for the local Claude process

If `IMGBIN_ANALYSIS_PROMPT_PATH` is not set, ImgBin falls back to `prompts/default-analysis-prompt.txt`.
If `IMGBIN_ANALYSIS_API_MODEL` is empty, ImgBin falls back to `ANTHROPIC_MODEL`.

### Codex CLI analysis

- `IMGBIN_CODEX_CLI_PATH`: optional Codex executable path; defaults to `codex`
- `IMGBIN_CODEX_MODEL`: optional Codex model identifier
- `IMGBIN_CODEX_TIMEOUT_MS`: optional timeout override for the Codex process
- `IMGBIN_CODEX_BASE_URL`: optional base URL override forwarded as `OPENAI_BASE_URL`
- `IMGBIN_CODEX_API_KEY`: optional API key override forwarded as `CODEX_API_KEY`

### HTTP vision analysis

- `IMGBIN_VISION_API_URL`: required when `IMGBIN_ANALYSIS_PROVIDER=http`
- `IMGBIN_VISION_API_KEY`: optional bearer token for the HTTP vision API
- `IMGBIN_VISION_API_MODEL`: optional model identifier stored in metadata
- `IMGBIN_VISION_API_TIMEOUT_MS`: optional timeout override for the HTTP vision API

ImgBin appends runtime scene profiles and filename guidance to every CLI-based analysis request. Imported assets prefer the original source filename, generated assets fall back to the managed slug, and placeholder names such as `original.png` or `asset` are ignored. The filename remains a soft hint only; visible image evidence still wins when they disagree.

### General runtime

- `IMGBIN_DEFAULT_OUTPUT_DIR`: optional default output root, defaults to `./library`
- `IMGBIN_THUMBNAIL_SIZE`: optional thumbnail size in pixels, defaults to `512`
- `IMGBIN_THUMBNAIL_FORMAT`: optional thumbnail format, defaults to `webp`
- `IMGBIN_THUMBNAIL_QUALITY`: optional thumbnail quality, defaults to `82`

## Unified workflows

### Generate one image with Azure + multimodal metadata analysis

```bash
imgbin generate \
  --prompt "A cheerful hand-drawn hero illustration of an AI coding assistant helping a developer at a desk." \
  --output ./library \
  --analysis-context "This is a documentation hero illustration with a desk scene and AI assistant visual motif." \
  --annotate
```

What happens:

1. ImgBin sends an Azure-style image request,
2. writes the generated file into a managed asset directory,
3. routes multimodal analysis through the configured provider,
4. validates the returned JSON before accepting it, and
5. stores structured metadata plus provider provenance in `metadata.json`.

### Generate from raw prompt text

```bash
imgbin generate \
  --prompt "orange dashboard hero for docs" \
  --output ./library \
  --tag dashboard \
  --tag hero \
  --analysis-context "This is a docs hero image that mixes product-dashboard cues with illustration styling." \
  --annotate \
  --thumbnail
```

### Generate from a docs-style `prompt.json`

```bash
imgbin generate \
  --prompt-file ../docs/src/content/docs/img/product-overview/value-proposition-ai-assisted-coding/prompt.json \
  --output ./library \
  --analysis-context "This prompt file generates a documentation hero asset with interface-inspired card layout." \
  --annotate
```

ImgBin reads the docs prompt file, extracts `userPrompt`, carries over generation parameters into metadata, and records the prompt file path as prompt provenance.

### Re-run metadata only

If image generation already succeeded and you only want to refresh title/tags/description:

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "This is a product dashboard screenshot used in docs." \
  --overwrite
```

This is useful after changing the configured analysis provider, model, or prompt.

### Filename-guided analysis

ImgBin now enriches multimodal metadata analysis with a lightweight filename hint:

- imported assets prefer the source filename from `source.originalPath`,
- generated assets fall back to the managed asset slug or directory name, and
- placeholder names such as `original.jpg` or `asset` are skipped automatically.

This guidance is appended at runtime, so it applies to both the bundled default prompt and any `--analysis-prompt` override. Treat it as a soft hint: if the filename conflicts with the image itself, the visible image content should take precedence.

### Non-interactive provider examples

Codex in CI:

```bash
IMGBIN_ANALYSIS_PROVIDER=codex \
IMGBIN_CODEX_CLI_PATH=codex \
IMGBIN_CODEX_MODEL=gpt-5-codex \
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "This is a product dashboard screenshot used in CI validation." \
  --overwrite
```

HTTP provider in automation:

```bash
IMGBIN_ANALYSIS_PROVIDER=http \
IMGBIN_VISION_API_URL=https://example.com/vision \
IMGBIN_VISION_API_KEY=token \
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "This is a product dashboard screenshot used in automation." \
  --overwrite
```

### Annotate an existing managed asset

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "This is a product dashboard screenshot with KPI cards and navigation."
```

### Import a standalone image into the library, then analyze it

```bash
imgbin annotate ./incoming/launch-hero.png \
  --import-to ./library \
  --analysis-context "This is a launch hero visual combining marketing illustration and interface framing." \
  --tag imported \
  --thumbnail
```

This copies the source image into a new managed asset directory before writing `metadata.json`.

### Re-run analysis with a custom analysis prompt

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-prompt ./prompts/custom-analysis-prompt.txt \
  --analysis-context "This is a product dashboard screenshot used for launch documentation." \
  --overwrite
```

### Add custom analysis context for tricky screenshots

Image recognition now requires analysis context. Pass a short project-aware hint so ImgBin can classify tricky screenshots more accurately while still prioritizing visible image evidence.

```bash
imgbin annotate ./library/2026-03/adventure-squad \
  --analysis-context "这是冒险团副本管理页面，重点识别副本配置、队伍编成、已分配英雄和右侧编辑器面板。" \
  --overwrite
```

You can also store that context in a file:

```bash
imgbin annotate ./library/2026-03/adventure-squad \
  --analysis-context-file ./prompts/adventure-squad-context.txt \
  --overwrite
```

`annotate`, `generate --annotate`, and any batch job that performs recognition must provide either `--analysis-context` or `--analysis-context-file` (or the manifest equivalents `analysisContext` / `analysisContextFile`).

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

Every manifest job that performs recognition must include `analysisContext` or `analysisContextFile`.

### Batch-process assets whose analysis is still pending or failed

```bash
imgbin batch \
  --pending-library ./library \
  --analysis-context-file ./prompts/pending-library-context.txt
```

## Batch manifest examples

```yaml
jobs:
  - promptFile: ../docs/src/content/docs/img/product-overview/value-proposition-ai-assisted-coding/prompt.json
    slug: docs-ai-assisted-coding
    tags: [docs, hero]
    annotate: true
    analysisContext: This is a product hero illustration used in documentation.
    thumbnail: true

  - assetPath: ./incoming/marketing-card.png
    importTo: ./library
    analysisContext: This is a marketing image with product-card framing and interface accents.
    tags: [marketing, imported]
    thumbnail: true

  - assetPath: ./library/2026-03/existing-card
    overwriteRecognition: true
    analysisPromptPath: ./prompts/custom-analysis-prompt.txt
    analysisContextFile: ./prompts/existing-card-context.txt

  - pendingLibrary: ./library
    analysisContextFile: ./prompts/pending-library-context.txt
```

## Metadata model

Each asset directory stores a `metadata.json` file with these high-level sections:

- `source`: whether the asset was generated by ImgBin or imported from an external file
- `generated`: prompt text, provider context, docs prompt provenance, and generation params
- `recognized`: multimodal analysis suggestions, provider provenance, validator diagnostics, retry history, and optional custom context provenance
- `manual`: human-maintained title, tags, or description that take precedence by default
- `status`: per-step status for generation, recognition, and thumbnail creation
- `paths`: relative file paths for original and thumbnail assets
- `timestamps`: creation and update timestamps

Manual fields always win over AI suggestions unless you run an explicit overwrite flow. Recognition failures keep the asset on disk and mark the asset as retryable for later batch processing.

### Important payload note

ImgBin does not persist large image base64 blobs such as Azure `b64_json` into `metadata.json`.
The actual generated image is stored as the asset file on disk, while metadata keeps only the structured fields and lightweight provider details needed for diagnostics.

## Notes on analysis behavior

ImgBin routes metadata analysis through the configured provider. For CLI-based providers, it:

1. loads the bundled or overridden analysis prompt,
2. appends scene-aware guidance and filename hints at runtime,
3. asks the selected provider to inspect the local image directly (`claude` by path, `codex` by `--image`, or HTTP by base64 payload), and
4. validates the returned JSON before merging it into metadata.

That means non-interactive runs only need a deterministic provider selection plus the corresponding CLI/API configuration.

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
