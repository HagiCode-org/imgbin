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
      },
      {
        provenance: {
          providerId: 'claude',
          provider: 'fake-provider',
          promptId: 'default-analysis-prompt.txt',
          promptPath: '/tmp/default-analysis-prompt.txt',
          promptSourceType: 'default',
          sceneType: 'product-ui',
          attempt: 1,
          mode: 'initial',
          updatedAt: '2026-03-10T00:00:01.000Z',
          analysisContextType: 'inline',
          analysisContextPreview: 'dashboard context'
        },
        diagnostics: [],
        retryHistory: []
      }
    );

    expect(merged.title).toBe('Manual Hero Title');
    expect(merged.tags).toEqual(['manual-tag']);
    expect(merged.recognized?.title).toBe('Recognized Hero Title');
    expect(merged.recognized?.tags).toEqual(['recognized-tag']);
    expect(merged.recognized?.promptId).toBe('default-analysis-prompt.txt');
    expect(merged.recognized?.provenance?.providerId).toBe('claude');
    expect(merged.recognized?.provenance?.analysisContextType).toBe('inline');
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
      },
      {
        provenance: {
          providerId: 'claude',
          provider: 'fake-provider',
          promptId: 'default-analysis-prompt.txt',
          promptPath: '/tmp/default-analysis-prompt.txt',
          promptSourceType: 'default',
          sceneType: 'general',
          attempt: 1,
          mode: 'initial',
          updatedAt: '2026-03-10T00:00:01.000Z'
        },
        diagnostics: [],
        retryHistory: []
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
      },
      {
        provenance: {
          providerId: 'http',
          provider: 'fake-provider',
          promptId: 'custom-analysis-prompt.txt',
          promptPath: '/tmp/custom-analysis-prompt.txt',
          promptSourceType: 'file',
          sceneType: 'admin-ui',
          attempt: 1,
          mode: 'initial',
          updatedAt: '2026-03-10T00:00:02.000Z'
        },
        diagnostics: [],
        retryHistory: []
      }
    );

    expect(second.recognized?.title).toBe('New Recognition');
    expect(second.recognized?.tags).toEqual(['new-tag']);
    expect(second.recognized?.overwriteApplied).toBe(true);
    expect(second.recognized?.promptPath).toBe('/tmp/custom-analysis-prompt.txt');
    expect(second.recognized?.provenance?.providerId).toBe('http');
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

  it('records validation diagnostics without mutating existing presentation fields', () => {
    const metadata = service.createInitialMetadata({
      assetId: 'validation-asset',
      slug: 'validation-asset',
      assetDir: '/tmp/validation-asset',
      originalFilename: 'original.png',
      prompt: 'validation asset',
      tags: ['existing'],
      createdAt: '2026-03-10T00:00:00.000Z'
    });

    const failed = service.markRecognitionFailure(
      metadata,
      '2026-03-10T00:00:01.000Z',
      'Validation failed: UI drift',
      'validation',
      [
        {
          code: 'ui-named-entity-drift',
          message: 'UI-first scenes must stay grounded in interface evidence.',
          field: 'result',
          recoverable: true
        }
      ],
      [
        {
          attempt: 1,
          mode: 'initial',
          reason: 'UI drift',
          diagnostics: [
            {
              code: 'ui-named-entity-drift',
              message: 'UI-first scenes must stay grounded in interface evidence.',
              field: 'result',
              recoverable: true
            }
          ]
        }
      ]
    );

    expect(failed.title).toBe('Validation Asset');
    expect(failed.status.recognition).toBe('failed');
    expect(failed.recognized?.lastErrorKind).toBe('validation');
    expect(failed.recognized?.validation?.accepted).toBe(false);
    expect(failed.recognized?.retryHistory).toHaveLength(1);
  });
});
