# ImgBin - Agent Configuration

## Root Configuration

Inherits all behavior from `/AGENTS.md` at the monorepo root. Local rules extend or override the root file for this repository.

## Project Context

ImgBin is a TypeScript CLI for generating image assets, importing existing images into a managed library, writing searchable metadata, searching managed libraries, creating thumbnails, and running provider-routed multimodal image metadata analysis. Published as `@hagicode/imgbin`.

## Working Directory

Run commands from `repos/imgbin/`.

## Key Commands

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm test                    # vitest run
pnpm run pack:check
pnpm run dev <args>       # run the CLI from source via tsx
```

Requires Node.js 24+. `pnpm run pack:check` verifies the packed npm contents; run build, test and `pack:check` before a release.

## Key Paths

- `src/`: CLI source (bin entry: `dist/cli.js`); `src/commands/` holds subcommands, `src/providers/` the image and analysis backends, `src/services/` the asset writer, job runner, metadata, search index and thumbnail logic, `src/lib/` shared config, paths, schema and runtime helpers
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

## Package management

- The repository uses pnpm, pinned in `package.json` `packageManager`. Run `corepack enable` once, then `pnpm install`. `pnpm-lock.yaml` is the only lockfile; do not commit `package-lock.json`.
- Settings live in `pnpm-workspace.yaml`. `allowBuilds` lists the dependencies whose install scripts may run (reviewed individually, `false` means reviewed and denied); review any new dependency that has an install script and add it there.
- A local registry mirror belongs in `~/.npmrc` only. Never commit a `registry=` line or a mirror URL; `pnpm run check:registry` (also run in CI) fails on any non-`registry.npmjs.org` `tarball` in the lockfile and on mirror hosts in tracked files.
- Undeclared imports fail under pnpm's strict layout: declare the package instead of hoisting it.
