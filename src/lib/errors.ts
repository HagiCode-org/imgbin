import type { RecognitionFailureKind, RecognitionValidationDiagnostic } from '../types.js';

export class AppError extends Error {
  public readonly exitCode: number;

  public constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'AppError';
    this.exitCode = exitCode;
  }
}

export class RecognitionError extends AppError {
  public constructor(
    message: string,
    public readonly kind: RecognitionFailureKind,
    public readonly diagnostics: RecognitionValidationDiagnostic[] = [],
    exitCode = 2
  ) {
    super(message, exitCode);
    this.name = 'RecognitionError';
  }
}
