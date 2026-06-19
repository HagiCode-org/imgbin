# ImgBin - Agent Configuration

## Root Configuration

Inherits all behavior from `/AGENTS.md` at the monorepo root. Local rules extend or override the root file for this repository.

## Project Context

ImgBin is a TypeScript CLI for generating image assets, importing existing images into a managed library, writing searchable metadata, searching managed libraries, creating thumbnails, and running provider-routed multimodal image metadata analysis. Published as `@hagicode/imgbin`.

## Working Directory

Run commands from `repos/imgbin/`.

## Key Commands

```bash
npm install
npm run dev
npm run build
npm test
```

## Key Paths

- `src/`: CLI source (bin entry: `dist/cli.js`)
- `skills/`: AI-oriented skill documentation
- `prompts/`: prompt templates for image analysis

## Agent Guidelines

- Keep CLI behavior aligned with the published `@hagicode/imgbin` npm package contract.
- For AI-oriented command-usage guidance, consult `skills/README.md` and `skills/imgbin-cli/SKILL.md`.
- Treat image generation and analysis as provider-routed operations; avoid hardcoding specific backends.
- If changing CLI flags or output formats, update the corresponding skill docs under `skills/`.

## References

- `README.md`
- `skills/README.md`
- `skills/imgbin-cli/SKILL.md`
