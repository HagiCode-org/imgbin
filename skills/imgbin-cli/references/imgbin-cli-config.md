# ImgBin CLI Configuration Reference

Use this file when you need to wire providers, environment variables, prompt overrides, or analysis preconditions.

## Configuration Loading Rules

- ImgBin loads `.env` from the current working directory.
- When you rely on the checked-in repo config, run commands from `repos/imgbin`.
- Relative CLI paths such as `--analysis-prompt` and `--analysis-context-file` are resolved from the current working directory.
- Manifest-relative paths are resolved from the manifest file directory before execution.
- The bundled default analysis prompt lives at `repos/imgbin/prompts/default-analysis-prompt.txt`.

## Core Runtime Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `IMGBIN_DEFAULT_OUTPUT_DIR` | Default managed library root for commands that create assets | `./library` |
| `IMGBIN_ANALYSIS_PROMPT_PATH` | Global override for the default analysis prompt file | Bundled prompt file |
| `IMGBIN_THUMBNAIL_SIZE` | Thumbnail size in pixels | `512` |
| `IMGBIN_THUMBNAIL_FORMAT` | Thumbnail format: `webp`, `png`, or `jpeg` | `webp` |
| `IMGBIN_THUMBNAIL_QUALITY` | Thumbnail quality, `1-100` | `82` |

## Image Generation Provider

Generation depends on the HTTP image API config.

### Required for `generate`

- `IMGBIN_IMAGE_API_URL`
  - Compatibility fallback: `AZURE_ENDPOINT`

### Optional generation settings

- `IMGBIN_IMAGE_API_KEY`
  - Compatibility fallback: `AZURE_API_KEY`
- `IMGBIN_IMAGE_API_MODEL`
- `IMGBIN_IMAGE_API_TIMEOUT_MS`
  - Default: `60000`

### Notes

- If no image provider config resolves, `generate` fails before any asset directory is created.
- Batch jobs that generate images use the same provider config.

## Analysis Provider Selection

Recognition depends on `IMGBIN_ANALYSIS_PROVIDER`.

- Supported values: `claude`, `codex`, `http`
- Default when unset: `claude`
- Shared fallback timeout: `IMGBIN_ANALYSIS_TIMEOUT_MS` with default `60000`

Use a deterministic provider for automation. The command contract stays the same across providers; only the backing analysis transport changes.

## Claude CLI Analysis

Used when `IMGBIN_ANALYSIS_PROVIDER=claude`.

### Executable resolution

- `IMGBIN_CLAUDE_CLI_PATH`
- fallback: `IMGBIN_ANALYSIS_CLI_PATH`
- fallback default: `claude`

### Model resolution

- `IMGBIN_CLAUDE_MODEL`
- fallback: `IMGBIN_ANALYSIS_API_MODEL`
- fallback: `ANTHROPIC_MODEL`
- current implementation then falls back to `IMGBIN_VISION_API_MODEL` if the earlier variables are unset

### Timeout resolution

- `IMGBIN_CLAUDE_TIMEOUT_MS`
- fallback: `IMGBIN_ANALYSIS_TIMEOUT_MS`
- fallback: `IMGBIN_ANALYSIS_API_TIMEOUT_MS`
- fallback default: `60000`

### Notes

- Claude runs as a local process and inspects the local image path directly.
- If no model resolves, recognition fails during provider resolution.

## Codex CLI Analysis

Used when `IMGBIN_ANALYSIS_PROVIDER=codex`.

### Main variables

- `IMGBIN_CODEX_CLI_PATH` default: `codex`
- `IMGBIN_CODEX_MODEL` optional model override
- `IMGBIN_CODEX_TIMEOUT_MS` with fallback to `IMGBIN_ANALYSIS_TIMEOUT_MS`, then default `60000`
- `IMGBIN_CODEX_BASE_URL` optional override forwarded as `OPENAI_BASE_URL`
- `IMGBIN_CODEX_API_KEY` optional override forwarded as `CODEX_API_KEY`

### Notes

- Codex runs locally with `codex exec --experimental-json --image <file>`.
- The CLI prompt is sent on stdin and the structured response is extracted from the event stream.

## HTTP Vision Analysis

Used when `IMGBIN_ANALYSIS_PROVIDER=http`.

### Required

- `IMGBIN_VISION_API_URL`

### Optional

- `IMGBIN_VISION_API_KEY`
- `IMGBIN_VISION_API_MODEL`
- `IMGBIN_VISION_API_TIMEOUT_MS`
  - fallback: `IMGBIN_ANALYSIS_TIMEOUT_MS`
  - fallback default: `60000`

### Notes

- ImgBin POSTs JSON that includes `imageBase64`, `mimeType`, prompt metadata, filename hints, and recognition context.
- If `IMGBIN_VISION_API_URL` is missing while provider=`http`, recognition fails during provider resolution.

## Analysis Context Requirements

Recognition commands require context. This is enforced by both command parsing and prompt loading.

### Recognition flows that require context

- `imgbin annotate`
- `imgbin generate --annotate`
- `imgbin batch --pending-library`
- Manifest jobs that import an asset, annotate an asset, or generate with `annotate: true`

### Allowed forms

- Inline: `--analysis-context <text>` or manifest `analysisContext`
- File-based: `--analysis-context-file <path>` or manifest `analysisContextFile`

### Rules

- Provide exactly one context source, never both.
- Empty context files are rejected.
- ImgBin stores only a short preview plus source metadata in recognition provenance; it does not copy the entire context text into top-level metadata fields.
- Analysis context is treated as a supporting hint. Visible image evidence still wins when they conflict.

## Prompt Override Rules

- Global default prompt path comes from `IMGBIN_ANALYSIS_PROMPT_PATH` or the bundled prompt.
- Per-command `--analysis-prompt <path>` overrides that default for the current run.
- The resolved prompt path and prompt source type are recorded in recognition provenance.

## Automation Defaults

For CI or scripts, a stable pattern is:

1. set `IMGBIN_ANALYSIS_PROVIDER` explicitly,
2. provide the provider-specific executable or API settings,
3. provide one analysis-context input for every recognition flow, and
4. set timeouts explicitly when the default `60000` is too low for the environment.
