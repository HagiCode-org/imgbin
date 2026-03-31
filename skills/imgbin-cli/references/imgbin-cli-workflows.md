# ImgBin Workflow Recipes

Use this file for common end-to-end ImgBin tasks.

## Generate A New Asset With Recognition And Thumbnail

Use when you need a new managed asset plus searchable metadata.

```bash
imgbin generate \
  --prompt "orange dashboard hero for docs" \
  --output ./library \
  --tag dashboard \
  --tag hero \
  --annotate \
  --analysis-context "Documentation hero image with product dashboard cards and interface framing." \
  --thumbnail
```

Expected side effects:

- creates `./library/<YYYY-MM>/<slug>/`
- writes `original.<ext>`
- writes `metadata.json`
- writes `thumbnail.<format>`
- syncs the search index if one already exists

## Re-Annotate An Existing Managed Asset

Use when the image file is already in the library and only recognition metadata needs refresh.

```bash
imgbin annotate ./library/2026-03/orange-dashboard-hero \
  --analysis-context "Product dashboard screenshot with KPI cards, navigation, and settings controls." \
  --overwrite
```

Notes:

- `--overwrite` replaces previous recognized title, tags, and description.
- Without `--overwrite`, ImgBin preserves the first accepted recognized values and only refreshes provenance and status details.

## Import A Standalone Image Then Annotate It

Use when the source image is outside the managed library.

```bash
imgbin annotate ./incoming/launch-hero.png \
  --import-to ./library \
  --analysis-context "Launch hero visual combining illustration and interface framing." \
  --tag imported \
  --thumbnail
```

Expected side effects:

- creates a new asset directory under `./library/<YYYY-MM>/`
- copies the file to `original.<ext>`
- writes recognition metadata
- optionally writes a thumbnail

## Refresh Only The Thumbnail

Use when metadata is already acceptable and you only need a new thumbnail using the current thumbnail config.

```bash
imgbin thumbnail ./library/2026-03/orange-dashboard-hero
```

Expected side effects:

- rewrites `thumbnail.<format>`
- updates thumbnail metadata fields in `metadata.json`
- does not run recognition

## Search A Library

### Exact match mode

```bash
imgbin search \
  --library ./library \
  --query "orange hero" \
  --exact
```

### Fuzzy mode with forced rebuild

```bash
imgbin search \
  --library ./library \
  --query "orng herp" \
  --fuzzy \
  --reindex
```

### JSON output for scripts

```bash
imgbin search \
  --library ./library \
  --query "launch hero" \
  --json
```

Expected side effects:

- may create or rebuild `./library/.imgbin/search-index.json`
- returns ranked matches by text or JSON

## Run A Batch Manifest

Use when you want mixed generate, import, annotate, and thumbnail work in one file.

```yaml
jobs:
  - prompt: orange dashboard hero for docs
    output: ./library
    slug: orange-dashboard-hero
    tags: [dashboard, hero]
    annotate: true
    analysisContext: Documentation hero image with dashboard cards.
    thumbnail: true

  - assetPath: ./incoming/marketing-card.png
    importTo: ./library
    analysisContext: Marketing image with card framing and UI accents.
    tags: [marketing, imported]
    thumbnail: true

  - assetPath: ./library/2026-03/existing-card
    overwriteRecognition: true
    analysisContextFile: ./prompts/existing-card-context.txt
```

Run it with:

```bash
imgbin batch --manifest ./jobs/launch.yaml --output ./library
```

Notes:

- Manifest files can be YAML or JSON.
- Relative manifest paths are resolved from the manifest file directory.
- Recognition jobs inside the manifest still require `analysisContext` or `analysisContextFile`.

## Retry Recognition For Pending Or Failed Assets

Use when a library already contains assets whose recognition status is `pending` or `failed`.

```bash
imgbin batch \
  --pending-library ./library \
  --analysis-context-file ./prompts/pending-library-context.txt
```

Expected side effects:

- scans the library recursively for `metadata.json`
- retries recognition only for assets with `status.recognition` set to `pending` or `failed`
- updates each affected asset in place

## Thumbnail-Only Batch Job

Use when a manifest should refresh thumbnails without re-running recognition for a managed asset.

```yaml
jobs:
  - assetPath: ./library/2026-03/orange-dashboard-hero
    annotate: false
    thumbnail: true
```

This is the main manifest shape that intentionally skips analysis context.
