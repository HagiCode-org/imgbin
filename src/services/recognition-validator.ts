import type {
  RecognitionContext,
  RecognitionSceneType,
  RecognitionValidationDiagnostic,
  VisionRecognitionResult
} from '../types.js';

export interface RecognitionValidationResult {
  accepted: boolean;
  recoverable: boolean;
  diagnostics: RecognitionValidationDiagnostic[];
  normalized: VisionRecognitionResult;
}

const KEBAB_CASE_TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UI_FIRST_SCENES: RecognitionSceneType[] = ['product-ui', 'admin-ui', 'wireframe', 'game-editor'];
const UI_EVIDENCE_TERMS = ['ui', 'dashboard', 'panel', 'screen', 'interface', 'form', 'admin', 'editor', 'menu', 'toolbar', 'chart', 'table', 'layout', 'navigation', 'settings', 'canvas'];
const ILLUSTRATION_TERMS = ['illustration', 'character', 'art', 'portrait', 'mascot', 'concept', 'poster', 'avatar'];
const RISKY_ENTITY_TERMS = ['anime', 'character', 'skin', 'princess', 'warrior', 'mage', 'dragon', 'cosplay', 'idol', 'waifu', 'naruto', 'genshin'];

export class RecognitionValidator {
  public validate(result: VisionRecognitionResult, context: RecognitionContext): RecognitionValidationResult {
    const normalized: VisionRecognitionResult = {
      ...result,
      title: normalizeString(result.title),
      tags: dedupeStrings((result.tags ?? []).map((tag) => tag.trim())),
      description: normalizeString(result.description),
      sceneType: result.sceneType ?? context.selectedScene
    };

    const diagnostics: RecognitionValidationDiagnostic[] = [];

    if (!normalized.title) {
      diagnostics.push(diagnostic('missing-title', 'Recognition result must include a title.', 'title', true));
    } else if (normalized.title.length > 80) {
      diagnostics.push(diagnostic('title-too-long', 'Recognition title must stay within 80 characters.', 'title', true));
    }

    if (!normalized.tags?.length) {
      diagnostics.push(diagnostic('missing-tags', 'Recognition result must include between 2 and 8 tags.', 'tags', true));
    } else {
      if (normalized.tags.length < 2 || normalized.tags.length > 8) {
        diagnostics.push(diagnostic('tag-count', 'Recognition tags must contain between 2 and 8 items.', 'tags', true));
      }

      const invalidTag = normalized.tags.find((tag) => !KEBAB_CASE_TAG.test(tag));
      if (invalidTag) {
        diagnostics.push(
          diagnostic('tag-format', `Recognition tags must use lowercase kebab-case. Invalid tag: ${invalidTag}`, 'tags', true)
        );
      }
    }

    if (normalized.description && normalized.description.length > 200) {
      diagnostics.push(diagnostic('description-too-long', 'Recognition description must stay within 200 characters.', 'description', true));
    }

    const combinedText = [normalized.title, ...(normalized.tags ?? []), normalized.description].filter(Boolean).join(' ').toLowerCase();
    const hasUiEvidence = UI_EVIDENCE_TERMS.some((term) => combinedText.includes(term));
    const hasIllustrationEvidence = ILLUSTRATION_TERMS.some((term) => combinedText.includes(term));
    const hasRiskyEntity = RISKY_ENTITY_TERMS.some((term) => combinedText.includes(term));

    if (UI_FIRST_SCENES.includes(context.selectedScene) && hasRiskyEntity && !hasUiEvidence) {
      diagnostics.push(
        diagnostic(
          'ui-named-entity-drift',
          'UI-first scenes must stay grounded in interface evidence instead of drifting to characters or IP names.',
          'result',
          true
        )
      );
    }

    if (context.selectedScene === 'illustration-mixed' && (!hasUiEvidence || !hasIllustrationEvidence)) {
      diagnostics.push(
        diagnostic(
          'illustration-mixed-balance',
          'Illustration-mixed scenes must preserve both interface and illustration semantics.',
          'result',
          true
        )
      );
    }

    return {
      accepted: diagnostics.length === 0,
      recoverable: diagnostics.every((item) => item.recoverable),
      diagnostics,
      normalized: {
        ...normalized,
        validationDiagnostics: diagnostics
      }
    };
  }
}

function normalizeString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function diagnostic(
  code: string,
  message: string,
  field: RecognitionValidationDiagnostic['field'],
  recoverable: boolean
): RecognitionValidationDiagnostic {
  return {
    code,
    message,
    field,
    recoverable
  };
}
