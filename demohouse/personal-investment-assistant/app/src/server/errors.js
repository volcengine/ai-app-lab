export class AppError extends Error {
  constructor(message, { code = 'APP_ERROR', status = 500, details = undefined, cause = undefined } = {}) {
    super(message, { cause });
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ProviderError extends AppError {
  constructor(provider, message, options = {}) {
    super(message, {
      code: options.code || 'PROVIDER_ERROR',
      status: options.status || 503,
      details: { provider, ...(options.details || {}) },
      cause: options.cause,
    });
    this.provider = provider;
  }
}

export class EvidenceValidationError extends AppError {
  constructor(message, details) {
    super(message, { code: 'EVIDENCE_VALIDATION_FAILED', status: 422, details });
  }
}
