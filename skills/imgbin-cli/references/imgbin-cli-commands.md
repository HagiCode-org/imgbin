# ImgBin CLI Commands Reference

Use this file to map a task to the correct public command and confirm the main guardrails before execution.

## Command Selector

| Task | Command | Key requirement |
| --- | --- | --- |
| Generate a new image asset | `imgbin generate` | Provide exactly one of `--prompt` or `--prompt-file` |
| Analyze an existing managed asset | `imgbin annotate <assetPath>` | Provide exactly one analysis-context input |
| Import a standalone image, then analyze it | `imgbin annotate <file> --import-to <library>` | `--import-to` is required for non-managed files |
| Refresh only the thumbnail | `imgbin thumbnail <assetPath>` | Asset must already be managed |
| Run multiple jobs from YAML or JSON | `imgbin batch --manifest <path>` | Manifest jobs that perform recognition need context |
| Re-process assets whose recognition is pending or failed | `imgbin batch --pending-library <dir>` | Also requires analysis context |
| Search a managed library | `imgbin search --library <dir> --query <text>` | Library root must exist |

## Global CLI Surface

- Binary: `imgbin`
- Global options: `--quiet`, `--verbose`, `--help`
- Command help: `imgbin <command> --help`

## `generate`

Create a new managed asset from raw prompt text or a docs-style `prompt.json` file.

### Choose it when

- You need a new image file in a managed library.
- You want prompt provenance recorded in `metadata.json`.
- You may optionally chain recognition and thumbnail generation in the same run.

### Required inputs

- Exactly one of:
  - `--prompt <text>`
  - `--prompt-file <path>`

### Main options

- `--output <dir>`: output library root. Falls back to `IMGBIN_DEFAULT_OUTPUT_DIR`.
- `--slug <slug>`: override the asset slug.
- `--title <title>`: seed the presentation title.
- `--tag <tag>`: add one or more tags.
- `--annotate`: run multimodal recognition after generation.
- `--analysis-prompt <path>`: override the default analysis prompt file.
- `--analysis-context <text>` or `--analysis-context-file <path>`: required when `--annotate` is set.
- `--thumbnail`: create `thumbnail.*` after generation.
- `--dry-run`: preview work without writing files.

### Guardrails

- Do not pass both `--prompt` and `--prompt-file`.
- `--annotate` without analysis context fails fast.
- Do not pass both analysis-context flags together.
- Generation also fails if no image provider config is available.

### Side effects

- Creates a managed asset directory under `<output>/<YYYY-MM>/<slug>`.
- Writes the generated image as `original.<ext>`.
- Writes `metadata.json`.
- Best-effort syncs `.imgbin/search-index.json` if an index already exists for that library.

## `annotate`

Analyze a managed asset, or import a standalone image into a managed library before analysis.

### Choose it when

- You need recognition metadata for an existing asset.
- You want to re-run recognition with a new provider, prompt, or analysis context.
- You need to import a loose image file into the managed library first.

### Required inputs

- Positional `assetPath`.
- Exactly one of:
  - `--analysis-context <text>`
  - `--analysis-context-file <path>`

### Main options

- `--overwrite`: replace previously recognized fields instead of preserving the first accepted recognition values.
- `--import-to <dir>`: copy a standalone image into a managed library before analysis.
- `--analysis-prompt <path>`: override the default analysis prompt file.
- `--slug <slug>`: slug override for import flows.
- `--title <title>`: seed title when importing.
- `--tag <tag>`: add tags when importing.
- `--thumbnail`: create or refresh the thumbnail after analysis.
- `--dry-run`: preview work without writing files.

### Guardrails

- Without `--import-to`, ImgBin expects `assetPath` to resolve to a managed asset directory, or a file inside one, that already contains `metadata.json`.
- With `--import-to`, the source file is copied into a new managed asset directory before recognition.
- Do not pass both analysis-context flags together.
- Recognition is mandatory for this command; there is no annotate-without-context mode.

### Side effects

- Updates `recognized`, `status.recognition`, provider payload data, and timestamps in `metadata.json`.
- Import flows also create a new asset directory and copy the source image to `original.<ext>`.
- `--thumbnail` updates `paths.thumbnail` and thumbnail status.
- Best-effort syncs the search index for the containing library.

## `thumbnail`

Create or refresh a thumbnail for an existing managed asset.

### Choose it when

- You only need a thumbnail refresh.
- Recognition metadata should remain untouched.

### Required inputs

- Positional `assetPath` pointing to a managed asset directory or a file inside one.

### Main options

- `--dry-run`: preview work without writing files.

### Guardrails

- ImgBin resolves `assetPath` to a managed asset directory by checking for `metadata.json`.
- This command does not run recognition.

### Side effects

- Writes `thumbnail.<format>` using the configured thumbnail format.
- Updates `paths.thumbnail`, thumbnail dimensions in `extra.thumbnail`, and `status.thumbnail`.
- Best-effort syncs the search index.

## `batch`

Run multiple jobs from a manifest, or rescan a managed library for assets whose recognition is still incomplete.

### Choose it when

- You need repeatable multi-step jobs from YAML or JSON.
- You need to retry recognition for a library full of `pending` or `failed` assets.

### Required inputs

- Exactly one of:
  - `--manifest <path>`
  - `--pending-library <dir>`

### Main options

- `--output <dir>`: overrides the output root for generated jobs.
- `--analysis-context <text>` or `--analysis-context-file <path>`: required for `--pending-library` runs.
- `--dry-run`: preview work without writing files.

### Guardrails

- Do not pass both `--manifest` and `--pending-library`.
- Do not pass both analysis-context flags together.
- `--pending-library` scans for assets where `metadata.status.recognition` is `pending` or `failed`.
- Manifest jobs resolve file paths relative to the manifest file directory.
- Manifest jobs that perform recognition must include `analysisContext` or `analysisContextFile`.
- A thumbnail-only manifest job is the main exception: `assetPath` + `thumbnail: true` + `annotate: false` can skip recognition.

### Side effects

- Manifest generate jobs can create new asset directories.
- Manifest annotate/import jobs can update recognition metadata and thumbnails.
- Pending-library mode can touch many existing asset directories in one run.

## `search`

Search a managed library by metadata, prompt, import provenance, and asset paths.

### Choose it when

- You need asset lookup by title, tags, description, prompt text, or path.
- You need text output for people or JSON output for automation.

### Required inputs

- `--library <dir>`
- `--query <text>`

### Main options

- `--exact`: token-based exact matching.
- `--fuzzy`: typo-tolerant matching.
- `--limit <n>`: positive integer, default `10`.
- `--json`: emit machine-readable JSON output.
- `--reindex`: force a full rebuild before searching.

### Guardrails

- Do not pass `--exact` and `--fuzzy` together.
- Empty query text fails.
- `--library` must exist and be a directory.
- If the stored index is missing or stale, search rebuilds it automatically even without `--reindex`.

### Side effects

- May create or rewrite `<library>/.imgbin/search-index.json`.
- Skips malformed `metadata.json` files during indexing instead of failing the whole search.
