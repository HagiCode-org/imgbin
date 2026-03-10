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
      false,
      {
        id: 'default-analysis-prompt.txt',
        path: '/tmp/default-analysis-prompt.txt',
        type: 'default'
      }
    );

    expect(merged.title).toBe('Manual Hero Title');
    expect(merged.tags).toEqual(['manual-tag']);
    expect(merged.recognized?.title).toBe('Recognized Hero Title');
    expect(merged.recognized?.tags).toEqual(['recognized-tag']);
    expect(merged.recognized?.promptId).toBe('default-analysis-prompt.txt');
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
      false,
      {
        id: 'default-analysis-prompt.txt',
        path: '/tmp/default-analysis-prompt.txt',
        type: 'default'
      }
    );

    const second = service.applyRecognition(
      first,
      {
        title: 'New Recognition',
        tags: ['new-tag'],
        provider: 'fake-provider'
      },
      '2026-03-10T00:00:02.000Z',
      true,
      {
        id: 'custom-analysis-prompt.txt',
        path: '/tmp/custom-analysis-prompt.txt',
        type: 'file'
      }
    );

    expect(second.recognized?.title).toBe('New Recognition');
    expect(second.recognized?.tags).toEqual(['new-tag']);
    expect(second.recognized?.overwriteApplied).toBe(true);
    expect(second.recognized?.promptPath).toBe('/tmp/custom-analysis-prompt.txt');
  });

  it('derives stable search fields from metadata and provenance', () => {
    const metadata = service.createInitialMetadata({
      assetId: 'orange-dashboard-hero',
      slug: 'orange-dashboard-hero',
      assetDir: '/tmp/library/2026-03/orange-dashboard-hero',
      originalFilename: 'original.png',
      prompt: 'orange dashboard hero',
      promptSource: {
        type: 'docs-prompt-file',
        path: '/tmp/prompts/hero.json',
        context: 'marketing dashboard hero'
      },
      tags: ['hero', 'dashboard'],
      createdAt: '2026-03-10T00:00:00.000Z',
      source: {
        type: 'imported',
        originalPath: '/tmp/source/launch-hero.png'
      }
    });

    const document = service.toSearchDocument(metadata);

    expect(document.fields.title).toContain('Orange Dashboard Hero');
    expect(document.fields.tags).toEqual(['hero', 'dashboard']);
    expect(document.fields['generated.prompt']).toContain('orange dashboard hero');
    expect(document.fields['generated.prompt']).toContain('marketing dashboard hero');
    expect(document.fields['generated.promptSource.path']).toContain('/tmp/prompts/hero.json');
    expect(document.fields['source.originalPath']).toContain('/tmp/source/launch-hero.png');
    expect(document.searchText).toContain('orange dashboard hero');
  });
});
