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
npm run pack:check
```

Requires Node.js 24+. `npm run pack:check` verifies the packed npm contents; run build, test and `pack:check` before a release.

## Key Paths

- `src/`: CLI source (bin entry: `dist/cli.js`); `src/commands/` holds subcommands, `src/providers/` the image and analysis backends
- `src/__tests__/`: vitest tests (including release workflow and version-script checks)
- `scripts/`: npm publish and release-version helpers used by CI
- `.env.example`: documented provider environment variables (copy to `.env`; never commit `.env`)
- `.github/workflows/`: `npm-publish.yml` (npm publish) and `release-draft-action.yml` (release draft)
- `skills/`: AI-oriented skill documentation
- `prompts/`: prompt templates for image analysis

## Agent Guidelines

- Keep CLI behavior aligned with the published `@hagicode/imgbin` npm package contract.
- For AI-oriented command-usage guidance, consult `skills/README.md` and `skills/imgbin-cli/SKILL.md`.
- Treat image generation and analysis as provider-routed operations; avoid hardcoding specific backends.
- If changing CLI flags or output formats, update the corresponding skill docs under `skills/`.
- If adding or renaming provider environment variables, update `.env.example` and the README environment section together.
- Releases: pushes to `main` publish an npm `dev` build and refresh a draft GitHub release from Conventional Commits; publishing a `vX.Y.Z` draft release publishes npm `latest`. Keep the single `npm-publish.yml` workflow filename (npm trusted publishing is bound to it) and do not add an `NPM_TOKEN`.

## References

- `README.md`
- `skills/README.md`
- `skills/imgbin-cli/SKILL.md`
