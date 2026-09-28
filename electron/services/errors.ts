import type { ApiErrorCode } from '../../shared/types';

/** Typed application error surfaced to the renderer as { ok:false, error }. */
export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static validation(msg: string, details?: unknown): ApiError {
    return new ApiError('VALIDATION', msg, details);
  }
  static auth(): ApiError {
    return new ApiError('AUTH_REQUIRED', 'Please sign in to continue.');
  }
  static locked(): ApiError {
    return new ApiError('LOCKED', 'The application is locked. Enter your password to continue.');
  }
  static notFound(entity: string, id?: string | number): ApiError {
    return new ApiError('NOT_FOUND', `The requested ${entity} was not found${id !== undefined ? ` (${id})` : ''}.`);
  }
  static duplicate(msg: string): ApiError {
    return new ApiError('DUPLICATE', msg);
  }
  static forbidden(msg: string): ApiError {
    return new ApiError('FORBIDDEN', msg);
  }
  static state(msg: string): ApiError {
    return new ApiError('STATE', msg);
  }
  static file(msg: string): ApiError {
    return new ApiError('FILE', msg);
  }
  static db(msg: string): ApiError {
    return new ApiError('DB', msg);
  }
}
