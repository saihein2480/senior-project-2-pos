/**
 * An error whose message is safe to show the caller.
 *
 * Server modules throw this for expected outcomes (bad input, missing
 * document, a forbidden target). Route handlers turn it into a JSON response
 * with `status`; anything else is treated as an internal failure and only a
 * generic message leaves the server.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
