import path from 'node:path';
import { promises as fs } from 'node:fs';
import { AppError } from '../lib/errors.js';
import type {
  SearchCommandInput,
  SearchCommandResult,
  SearchIndexDocument,
  SearchMatchMode,
  SearchQueryService,
  SearchResult,
  SearchableField
} from '../types.js';
import { SearchIndexService } from './search-index.js';

const FIELD_WEIGHTS: Record<SearchableField, number> = {
  slug: 1.1,
  title: 1.4,
  tags: 1.25,
  description: 0.9,
  'generated.prompt': 1,
  'generated.promptSource.path': 0.75,
  'source.originalPath': 0.75,
  assetPath: 0.8
};

export class SearchService implements SearchQueryService {
  public constructor(private readonly searchIndexService: SearchIndexService) {}

  public async search(input: SearchCommandInput): Promise<SearchCommandResult> {
    const library = path.resolve(input.library);
    const query = input.query.trim();
    if (!query) {
      throw new AppError('Search query cannot be empty.', 2);
    }

    await this.assertDirectory(library);

    const indexPath = this.searchIndexService.getIndexPath(library);
    let index = await this.searchIndexService.load(library);
    let rebuilt = false;
    let rebuildReason: string | undefined;

    if (input.reindex) {
      rebuildReason = 'Search index rebuilt on request.';
    } else if (!index) {
      rebuildReason = 'Search index missing or unreadable.';
    } else {
      const freshness = await this.searchIndexService.isFresh(index);
      if (!freshness.fresh) {
        rebuildReason = freshness.reason;
      }
    }

    if (rebuildReason) {
      const buildResult = await this.searchIndexService.build(library);
      index = buildResult.index;
      await this.searchIndexService.save(library, index);
      rebuilt = true;
    }

    if (!index) {
      throw new AppError(`Search index unavailable for ${library}.`, 2);
    }

    const rankedResults = index.documents
      .map((document) => this.matchDocument(document, query, input.mode))
      .filter((result): result is SearchResult => Boolean(result))
      .sort((left, right) => sortResults(left, right));
    const results = rankedResults.slice(0, input.limit);

    return {
      success: true,
      query,
      mode: input.mode,
      library,
      rebuilt,
      rebuildReason,
      indexPath,
      indexedCount: index.indexedCount,
      skippedCount: index.skippedCount,
      totalMatches: rankedResults.length,
      results
    };
  }

  private matchDocument(document: SearchIndexDocument, query: string, mode: SearchMatchMode): SearchResult | undefined {
    return mode === 'fuzzy' ? this.matchDocumentFuzzy(document, query) : this.matchDocumentExact(document, query);
  }

  private matchDocumentExact(document: SearchIndexDocument, query: string): SearchResult | undefined {
    const normalizedQuery = normalizeText(query);
    const queryTokens = tokenize(normalizedQuery);
    if (queryTokens.length === 0) {
      return undefined;
    }

    const documentTokens = tokenize(document.searchText);
    if (queryTokens.some((token) => !documentTokens.includes(token))) {
      return undefined;
    }

    const matchedFields: SearchableField[] = [];
    let score = 0;

    for (const field of typedFieldNames(document.fields)) {
      const normalizedFieldText = normalizeText(document.fields[field].join(' '));
      if (!normalizedFieldText) {
        continue;
      }

      const tokenMatches = queryTokens.filter((token) => normalizedFieldText.includes(token)).length;
      if (tokenMatches === 0) {
        continue;
      }

      matchedFields.push(field);
      score += FIELD_WEIGHTS[field] * (tokenMatches / queryTokens.length);
      if (normalizedFieldText.includes(normalizedQuery)) {
        score += FIELD_WEIGHTS[field];
      }
    }

    if (matchedFields.length === 0) {
      return undefined;
    }

    return buildResult(document, score, matchedFields);
  }

  private matchDocumentFuzzy(document: SearchIndexDocument, query: string): SearchResult | undefined {
    const normalizedQuery = normalizeText(query);
    const queryTokens = tokenize(normalizedQuery);
    if (queryTokens.length === 0) {
      return undefined;
    }

    const exact = this.matchDocumentExact(document, query);
    if (exact) {
      return {
        ...exact,
        score: exact.score + 5
      };
    }

    const matchedFields: SearchableField[] = [];
    let score = 0;

    for (const field of typedFieldNames(document.fields)) {
      const values = document.fields[field];
      if (values.length === 0) {
        continue;
      }

      const fieldScore = Math.max(...values.map((value) => scoreQueryAgainstValue(normalizedQuery, queryTokens, value)), 0);
      if (fieldScore < 0.55) {
        continue;
      }

      matchedFields.push(field);
      score += fieldScore * FIELD_WEIGHTS[field];
    }

    if (matchedFields.length === 0) {
      return undefined;
    }

    return buildResult(document, score, matchedFields);
  }

  private async assertDirectory(library: string): Promise<void> {
    let stats;
    try {
      stats = await fs.stat(library);
    } catch {
      throw new AppError(`Library path does not exist: ${library}`, 2);
    }

    if (!stats.isDirectory()) {
      throw new AppError(`Library path is not a directory: ${library}`, 2);
    }
  }
}

function buildResult(document: SearchIndexDocument, score: number, matchedFields: SearchableField[]): SearchResult {
  return {
    assetId: document.assetId,
    slug: document.slug,
    assetDir: document.assetDir,
    metadataPath: document.metadataPath,
    title: document.title,
    tags: document.tags,
    description: document.description,
    score: Number(score.toFixed(4)),
    matchedFields: Array.from(new Set(matchedFields))
  };
}

function scoreQueryAgainstValue(normalizedQuery: string, queryTokens: string[], value: string): number {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return 0;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return 0.98;
  }

  const valueTokens = tokenize(normalizedValue);
  if (valueTokens.length === 0) {
    return 0;
  }

  const tokenScores = queryTokens.map((token) => {
    const direct = valueTokens.includes(token) ? 1 : 0;
    if (direct > 0) {
      return direct;
    }

    return Math.max(...valueTokens.map((valueToken) => tokenSimilarity(token, valueToken)), 0);
  });

  return tokenScores.reduce((sum, current) => sum + current, 0) / tokenScores.length;
}

function tokenSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }

  const distance = levenshteinDistance(left, right);
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) {
    return 0;
  }

  return Math.max(0, 1 - distance / maxLength);
}

function levenshteinDistance(left: string, right: string): number {
  const matrix = Array.from({ length: left.length + 1 }, () => new Array<number>(right.length + 1).fill(0));

  for (let row = 0; row <= left.length; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column <= right.length; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim();
}

function tokenize(value: string): string[] {
  return Array.from(new Set(normalizeText(value).split(/\s+/).filter(Boolean)));
}

function typedFieldNames(fields: SearchIndexDocument['fields']): SearchableField[] {
  return Object.keys(fields) as SearchableField[];
}

function sortResults(left: SearchResult, right: SearchResult): number {
  if (left.score !== right.score) {
    return right.score - left.score;
  }

  const titleOrder = left.title.localeCompare(right.title);
  if (titleOrder !== 0) {
    return titleOrder;
  }

  return left.assetDir.localeCompare(right.assetDir);
}
