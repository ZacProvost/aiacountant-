export class HttpError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly detail?: unknown;

  constructor(message: string, status = 400, options: { code?: string; detail?: unknown } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = options.code;
    this.detail = options.detail;
  }
}

type MaybeError = Error & { status?: number; code?: string; detail?: unknown };

export const normaliseError = (error: unknown): HttpError => {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof Error) {
    const status = typeof (error as MaybeError).status === 'number' ? (error as MaybeError).status! : 500;
    return new HttpError(error.message, status, {
      code: (error as MaybeError).code,
      detail: (error as MaybeError).detail,
    });
  }
  if (typeof error === 'string') {
    return new HttpError(error, 500);
  }
  return new HttpError('Unexpected server error', 500, { detail: error });
};


