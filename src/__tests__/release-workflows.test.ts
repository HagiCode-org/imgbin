import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadYaml(relativePath: string) {
  const absolutePath = path.join(repoRoot, relativePath);
  return parseDocument(readFileSync(absolutePath, 'utf8')).toJS() as Record<string, any>;
}

describe('release workflow configuration', () => {
  it('drafts releases from commit history on pushes to main', () => {
    const workflow = loadYaml('.github/workflows/release-drafter.yml');
    const job = workflow.jobs.update_release_draft;
    const steps = job.steps as Array<Record<string, any>>;

    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on.pull_request).toBeUndefined();
    expect(job.permissions.contents).toBe('write');
    expect(steps[0].with['fetch-depth']).toBe(0);
    expect(JSON.stringify(steps)).not.toContain('release-drafter/release-drafter');
    expect(steps.find((step) => step.id === 'notes')?.run).toContain('.github/scripts/release-notes.mjs version');
  });

  it('titles the draft release ImgBin v<version>', () => {
    const workflow = loadYaml('.github/workflows/release-drafter.yml');
    const draftStep = (workflow.jobs.update_release_draft.steps as Array<Record<string, any>>).find((step) =>
      step.name?.startsWith('Create or update')
    );

    expect(draftStep?.env.TITLE_TEMPLATE).toBe('ImgBin v{version}');
    expect(draftStep?.run).toContain('--draft');
  });

  it('publishes stable releases only from the GitHub release published event', () => {
    const workflow = loadYaml('.github/workflows/npm-publish.yml');
    const releaseJob = workflow.jobs['publish-release'];

    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on.push.tags).toBeUndefined();
    expect(workflow.on.release.types).toEqual(['published']);
    expect(releaseJob.if).toContain("github.event_name == 'release'");
    expect(releaseJob.if).toContain("github.event.action == 'published'");

    const checkoutStep = releaseJob.steps.find((step: Record<string, unknown>) => step.name === 'Checkout repository');
    expect(checkoutStep.with.ref).toBe('${{ github.event.release.tag_name }}');

    const resolveVersionStep = releaseJob.steps.find(
      (step: Record<string, unknown>) => step.name === 'Resolve stable release version'
    );
    expect(resolveVersionStep.id).toBe('version');
    expect(resolveVersionStep.env.RELEASE_TAG_NAME).toBe('${{ github.event.release.tag_name }}');
    expect(resolveVersionStep.run).toContain('process.env.RELEASE_TAG_NAME');
    expect(resolveVersionStep.run).toContain('stable vX.Y.Z format');

    const rewriteVersionStep = releaseJob.steps.find(
      (step: Record<string, unknown>) => step.name === 'Temporarily rewrite package.json version for stable publish'
    );
    expect(rewriteVersionStep.env.RELEASE_VERSION).toBe('${{ steps.version.outputs.version }}');
    expect(rewriteVersionStep.run).toContain('packageJson.version = process.env.RELEASE_VERSION');
    expect(rewriteVersionStep.run).toContain('Temporarily rewrote package.json');

    const verifyStep = releaseJob.steps.find(
      (step: Record<string, unknown>) => step.name === 'Verify release tag matches package version'
    );
    expect(verifyStep.run).toContain('publish:verify-release');
    expect(verifyStep.run).toContain('${{ github.event.release.tag_name }}');

    const stepNames = releaseJob.steps.map((step: Record<string, unknown>) => step.name);
    expect(stepNames.indexOf('Resolve stable release version')).toBeLessThan(
      stepNames.indexOf('Temporarily rewrite package.json version for stable publish')
    );
    expect(stepNames.indexOf('Temporarily rewrite package.json version for stable publish')).toBeLessThan(
      stepNames.indexOf('Verify release tag matches package version')
    );
    expect(stepNames.indexOf('Verify release tag matches package version')).toBeLessThan(
      stepNames.indexOf('Install dependencies')
    );
  });
});
