# ImgBin Managed Library Model

Use this file when you need to inspect, debug, or script against ImgBin's managed library on disk.

## Library Shape

ImgBin stores assets on the local filesystem. There is no remote asset database.

```text
<library>/
+-- .imgbin/
|   +-- search-index.json
+-- 2026-03/
|   +-- orange-dashboard-hero/
|       +-- metadata.json
|       +-- original.png
|       +-- thumbnail.webp
```

## Asset Directory Rules

- New asset directories are created under `<output>/<YYYY-MM>/`.
- The month segment uses UTC time from the creation date.
- The slug comes from `--slug`, prompt text, or source filename.
- If the slug already exists for that month, ImgBin appends `-2`, `-3`, and so on.

## Managed Asset Files

### `original.<ext>`

- Generated assets are written as `original.<ext>` based on the response MIME type.
- Imported assets are copied as `original.<ext>` based on the source file extension.
- Recognition reads this file directly.

### `metadata.json`

Every managed asset directory has `metadata.json`.

Important top-level sections:

- `schemaVersion`: current schema version is `2`.
- `assetId`, `slug`, `title`, `tags`, `description`: presentation fields.
- `source`: whether the asset is `generated` or `imported`, plus source path metadata for imports.
- `paths`: absolute asset directory path plus relative filenames for `original` and optional `thumbnail`.
- `generated`: prompt text, generation provider/model, tags, title, prompt provenance, and generation params.
- `recognized`: accepted recognition output, provider provenance, validation summary, retry history, and last error details.
- `manual`: human-maintained overrides. Manual title, tags, and description win over recognized values when presentation fields are resolved.
- `status`: per-step state for `generation`, `recognition`, and `thumbnail`.
- `providerPayload`: raw provider payloads and recognition failure details for diagnostics.
- `timestamps`: creation and update timestamps.
- `extra`: thumbnail dimensions and last error helpers.

### Presentation-field precedence

When ImgBin resolves the surfaced title, tags, and description:

1. `manual.*` wins when present,
2. otherwise `recognized.*`,
3. otherwise generated defaults.

`annotate --overwrite` replaces the stored recognized fields. Without `--overwrite`, ImgBin keeps the first accepted recognized values and only updates provenance and status details.

### `thumbnail.<format>`

- Thumbnail filenames are derived from the configured format:
  - `webp` -> `thumbnail.webp`
  - `png` -> `thumbnail.png`
  - `jpeg` -> `thumbnail.jpg`
- Thumbnail metadata is recorded in `paths.thumbnail` and `extra.thumbnail`.

## Status Semantics

`status.generation`, `status.recognition`, and `status.thumbnail` use these values:

- `pending`
- `succeeded`
- `failed`
- `skipped`

### Why this matters

- `batch --pending-library` scans for assets whose `status.recognition` is `pending` or `failed`.
- Search indexing still includes assets whose metadata parses cleanly, even if recognition or thumbnail status is not `succeeded`.

## Search Index Location

Library search state is stored at `<library>/.imgbin/search-index.json`.

### Contents

- `version`
- `libraryRoot`
- `generatedAt`
- `indexedCount`
- `skippedCount`
- `sourceFingerprints`
- `documents`

### Index lifecycle

- `imgbin search` builds the index if it is missing, unreadable, outdated, or forced with `--reindex`.
- Generate, import, annotate, and thumbnail commands attempt a best-effort single-asset sync when an index already exists.
- Fingerprints are based on each `metadata.json` file's size and modification time.
- Malformed `metadata.json` files are skipped during index build instead of aborting the whole search.

## Searchable Fields

Each index document is built from these field groups:

- `slug`
- `title`
- `tags`
- `description`
- `generated.prompt`
- `generated.promptSource.path`
- `source.originalPath`
- `assetPath`

`assetPath` includes both the managed asset directory and the resolved original file path.

## Filename Hint Rules For Recognition

When recognition runs, ImgBin may derive a filename hint in this order:

1. the imported source filename from `source.originalPath`,
2. the asset slug,
3. the asset directory name.

Placeholder names such as `original.png`, `asset`, `image`, `图片`, or `截图` are ignored. The filename hint is auxiliary only.
