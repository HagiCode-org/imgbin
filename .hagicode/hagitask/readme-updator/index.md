---
public: true
multilingual: true
languages:
  - en-US
  - zh-CN
sourceLanguage: en-US
style: technical
---

# README requirements

## Audience and focus

- Address developers who use the `@hagicode/imgbin` TypeScript CLI to generate image assets, import images into a managed library, write searchable metadata and search libraries.

## Required content

- Keep AI-oriented docs (pointing to `skills/`), requirements, installation, release automation, usage guide, environment variables, unified workflows, batch manifest examples, metadata model, notes, repository hygiene, development workflow and license.
- Variables must match `.env.example`; command names must match `src/`.

## README languages

- Maintain English in `README.md` and Simplified Chinese in `README_cn.md`, keeping the reciprocal language link and the existing filenames.
- Keep both files aligned in scope and meaning.

## Exclusions

- Exclude provider API keys and values from `.env`, tokens, internal hosts, machine-specific paths and private links.
