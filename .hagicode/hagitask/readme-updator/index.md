---
public: true
multilingual: true
languages:
  - en-US
  - zh-CN
sourceLanguage: en-US
style: product
---

# README requirements

## Product focus

- Introduce `@hagicode/imgbin` as a TypeScript command-line tool that gives users four things: generate image assets from a prompt, import existing images into a managed library, write searchable metadata (title, tags, description) through multimodal analysis, and search the library, plus thumbnails and batch runs.
- Address developers and content teams who run the `imgbin` CLI, since the repository is a developer-facing product; keep the AI-oriented skill docs pointer for agent users.
- Lead with what a user can do with the CLI and the quickest path to try it; keep release and publishing mechanics out of the main description.

## Required content

- Open with a short product introduction, the existing badges and the reciprocal language link, then the AI-oriented docs pointer to `skills/`.
- Keep requirements, installation, the usage guide with a minimal `.env` example, the environment variables a user must set, the command workflows users run (`generate`, `annotate`, `thumbnail`, `search`, `batch`), batch manifest examples, the metadata model and the license.
- Variables must match `.env.example`; command names and options must match `src/`; the MIT license statement must match `LICENSE`.

## README languages

- Maintain English in `README.md` and Simplified Chinese in `README_cn.md`, keeping the reciprocal language link and the existing filenames.
- Keep both files aligned in scope and meaning.

## Exclusions

- Exclude provider API keys and values from `.env`, tokens, internal hosts, machine-specific paths and private links.
- Keep repository maintenance instructions out of the README: release automation and publishing workflows, repository hygiene, development workflow, internal architecture and CI. Do not list features the repository does not show.
