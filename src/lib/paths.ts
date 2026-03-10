import path from 'node:path';
import { promises as fs } from 'node:fs';

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export function monthSegment(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function resolveUniqueAssetDir(outputRoot: string, slug: string, now: Date): Promise<string> {
  const baseDir = path.resolve(outputRoot, monthSegment(now));
  await ensureDir(baseDir);

  let candidate = path.join(baseDir, slug);
  let index = 2;
  while (await pathExists(candidate)) {
    candidate = path.join(baseDir, `${slug}-${index}`);
    index += 1;
  }

  return candidate;
}

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
