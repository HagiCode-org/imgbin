import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = path.join(repoRoot, 'scripts', 'verify-release-version.mjs');

function writeJson(filePath: string, data: unknown) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

describe('verify-release-version script', () => {
  it('accepts a GitHub release event payload as the tag source', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'imgbin-release-version-'));

    try {
      const packageJsonPath = path.join(tempDir, 'package.json');
      const eventPath = path.join(tempDir, 'release-event.json');

      writeJson(packageJsonPath, { name: '@hagicode/imgbin', version: '1.2.3' });
      writeJson(eventPath, { release: { tag_name: 'v1.2.3' } });

      const result = spawnSync(process.execPath, [scriptPath, '', packageJsonPath], {
        cwd: tempDir,
        env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_REF_NAME: '' },
        encoding: 'utf8'
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toBe('1.2.3');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('fails when the published release tag does not match package.json', () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'imgbin-release-version-'));

    try {
      const packageJsonPath = path.join(tempDir, 'package.json');
      const eventPath = path.join(tempDir, 'release-event.json');

      writeJson(packageJsonPath, { name: '@hagicode/imgbin', version: '1.2.3' });
      writeJson(eventPath, { release: { tag_name: 'v1.2.4' } });

      const result = spawnSync(process.execPath, [scriptPath, '', packageJsonPath], {
        cwd: tempDir,
        env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_REF_NAME: '' },
        encoding: 'utf8'
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('does not match package.json version 1.2.3');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
