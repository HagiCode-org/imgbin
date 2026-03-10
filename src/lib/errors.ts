export class AppError extends Error {
  public readonly exitCode: number;

  public constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'AppError';
    this.exitCode = exitCode;
  }
}
