import { describe, expect, it } from 'vitest';
import { MetadataService } from '../services/metadata.js';

const service = new MetadataService();

describe('metadata merge rules', () => {
  it('preserves manual fields when recognition is applied', () => {
    const metadata = service.createInitialMetadata({
      assetId: 'hero-card',
      slug: 'hero-card',
      assetDir: '/tmp/hero-card',
      originalFilename: 'original.png',
      prompt: 'hero card',
      tags: ['hero'],
      createdAt: '2026-03-10T00:00:00.000Z'
    });

    const merged = service.applyRecognition(
      {
        ...metadata,
        manual: {
          title: 'Manual Hero Title',
          tags: ['manual-tag']
        }
      },
      {
        title: 'Recognized Hero Title',
        tags: ['recognized-tag'],
        description: 'Recognized description',
        provider: 'fake-provider'
      },
      '2026-03-10T00:00:01.000Z',
      false
    );

    expect(merged.title).toBe('Manual Hero Title');
    expect(merged.tags).toEqual(['manual-tag']);
    expect(merged.recognized?.title).toBe('Recognized Hero Title');
    expect(merged.recognized?.tags).toEqual(['recognized-tag']);
  });

  it('overwrites recognized fields when overwrite is enabled', () => {
    const metadata = service.createInitialMetadata({
      assetId: 'panel',
      slug: 'panel',
      assetDir: '/tmp/panel',
      originalFilename: 'original.png',
      prompt: 'panel',
      tags: ['old'],
      createdAt: '2026-03-10T00:00:00.000Z'
    });

    const first = service.applyRecognition(
      metadata,
      {
        title: 'Old Recognition',
        tags: ['old-tag'],
        provider: 'fake-provider'
      },
      '2026-03-10T00:00:01.000Z',
      false
    );

    const second = service.applyRecognition(
      first,
      {
        title: 'New Recognition',
        tags: ['new-tag'],
        provider: 'fake-provider'
      },
      '2026-03-10T00:00:02.000Z',
      true
    );

    expect(second.recognized?.title).toBe('New Recognition');
    expect(second.recognized?.tags).toEqual(['new-tag']);
    expect(second.recognized?.overwriteApplied).toBe(true);
  });
});
