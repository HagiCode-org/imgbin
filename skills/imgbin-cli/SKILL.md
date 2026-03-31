---
name: imgbin-cli
version: 1.0.0
description: "Use ImgBin to generate assets, import or annotate images, refresh thumbnails, search managed libraries, and run batch jobs with provider-routed analysis."
metadata:
  requires:
    bins: ["imgbin"]
  cliHelp: "imgbin --help"
---

# imgbin-cli

Use this skill when the task is to operate the local ImgBin CLI or reason about its managed-library files.

## Start Here

1. Read `references/imgbin-cli-commands.md` when you need to choose between `generate`, `annotate`, `thumbnail`, `batch`, and `search`.
2. Read `references/imgbin-cli-config.md` before running any command that depends on providers, `.env`, prompt overrides, or timeout tuning.
3. Read `references/imgbin-cli-library-model.md` before editing managed-library files, debugging `metadata.json`, or reasoning about `.imgbin/search-index.json`.
4. Read `references/imgbin-cli-workflows.md` for ready-made recipes.

## Scope

ImgBin is a local-filesystem CLI. It generates or imports image assets into a managed library, writes structured metadata, optionally runs multimodal recognition, creates thumbnails, and searches the local library index.

## Command Selection Rules

- Use `generate` to create a new asset from `--prompt` or `--prompt-file`.
- Use `annotate` to analyze an existing managed asset, or add `--import-to` to copy a standalone image into a managed library before analysis.
- Use `thumbnail` when you only need to create or refresh `thumbnail.*` for an existing managed asset.
- Use `batch` for manifest-driven multi-job runs or to rescan a library for assets whose recognition status is still `pending` or `failed`.
- Use `search` to query an existing managed library by metadata and prompt-derived fields.

## Execution Guardrails

- Prefer running from `repos/imgbin` when relying on the checked-in `.env`, bundled prompt file, or relative paths.
- Recognition flows require exactly one context source: `--analysis-context` or `--analysis-context-file`.
- Recognition rules apply to `annotate`, `generate --annotate`, `batch --pending-library`, and manifest jobs that perform recognition.
- Do not point `annotate` at a standalone image unless you also provide `--import-to`; otherwise ImgBin expects a managed asset directory that already contains `metadata.json`.
- `search` expects a library root, not a single asset directory.
- Manifest-relative file paths are resolved from the manifest directory before execution.
- Skills docs are guidance only; if behavior looks inconsistent, verify against `src/commands/*.ts`, `src/services/job-runner.ts`, and `src/lib/config.ts`.

## Reference Map

- Command surface: `references/imgbin-cli-commands.md`
- Provider and env configuration: `references/imgbin-cli-config.md`
- Managed library layout and metadata model: `references/imgbin-cli-library-model.md`
- End-to-end operational recipes: `references/imgbin-cli-workflows.md`
