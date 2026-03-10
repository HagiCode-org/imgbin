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
  it('uses Release Drafter on pushes to main and pull request updates', () => {
    const workflow = loadYaml('.github/workflows/release-drafter.yml');

    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on.pull_request.types).toEqual(['opened', 'reopened', 'synchronize']);
    expect(workflow.jobs.update_release_draft.permissions.contents).toBe('write');
    expect(workflow.jobs.update_release_draft.permissions['pull-requests']).toBe('write');
    expect(workflow.jobs.update_release_draft.steps[0].uses).toBe('release-drafter/release-drafter@v6');
  });

  it('defines ImgBin release drafter categories and semantic version resolution', () => {
    const config = loadYaml('.github/release-drafter.yml');

    expect(config['name-template']).toBe('ImgBin v$RESOLVED_VERSION');
    expect(config['tag-template']).toBe('v$RESOLVED_VERSION');
    expect(config['version-resolver'].default).toBe('patch');
    expect(config.categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'Features' }),
        expect.objectContaining({ title: 'Fixes' }),
        expect.objectContaining({ title: 'Documentation' })
      ])
    );
  });

  it('publishes stable releases only from the GitHub release published event', () => {
    const workflow = loadYaml('.github/workflows/npm-publish-dev.yml');
    const releaseJob = workflow.jobs['publish-release'];

    expect(workflow.on.push.branches).toEqual(['main']);
    expect(workflow.on.push.tags).toBeUndefined();
    expect(workflow.on.release.types).toEqual(['published']);
    expect(releaseJob.if).toContain("github.event_name == 'release'");
    expect(releaseJob.if).toContain("github.event.action == 'published'");

    const checkoutStep = releaseJob.steps.find((step: Record<string, unknown>) => step.name === 'Checkout repository');
    expect(checkoutStep.with.ref).toBe('${{ github.event.release.tag_name }}');

    const stepNames = releaseJob.steps.map((step: Record<string, unknown>) => step.name);
    expect(stepNames).toEqual(
      expect.arrayContaining([
        'Verify release tag matches package version',
        'Install dependencies',
        'Build package',
        'Run tests',
        'Verify packed files',
        'Publish to npm latest dist-tag'
      ])
    );
  });
});
