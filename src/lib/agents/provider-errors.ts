export class ProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable = false) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Timeout-specific error for explicit handling. */
export class ProviderTimeoutError extends ProviderError {
  constructor(message: string) {
    super(message, "TIMEOUT", false);
    this.name = "ProviderTimeoutError";
  }
}
