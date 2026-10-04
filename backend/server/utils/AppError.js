// src/utils/AppError.js
const DEFAULT_STATUS_CODE = 500;

export class AppError extends Error {
  constructor(message_EN = "Something went wrong", message_AR = "حدث خطأ ما", statusCode = DEFAULT_STATUS_CODE, options = {}) {
    const normalizedMessageEN = String(message_EN);
    const normalizedMessageAR = String(message_AR);

    super(normalizedMessageEN);

    this.name = "AppError";

    this.message_EN = normalizedMessageEN;
    this.message_AR = normalizedMessageAR;

    this.statusCode = AppError.normalizeStatusCode(statusCode);

    this.isOperational = options.isOperational !== undefined ? Boolean(options.isOperational) : this.statusCode < 500;

    if (options.code !== undefined && options.code !== null) {
      this.code = String(options.code);
    }

    if (options.cause !== undefined && options.cause !== null) {
      this.cause = options.cause;
    }

    if (options.details !== undefined) {
      this.details = options.details;
    }

    if (options.meta !== undefined) {
      this.meta = options.meta;
    }

    Error.captureStackTrace?.(this, AppError);
  }

  // Status Code
  static normalizeStatusCode(statusCode) {
    const parsedStatusCode = Number(statusCode);

    if (!Number.isInteger(parsedStatusCode) || parsedStatusCode < 100 || parsedStatusCode > 599) {
      return DEFAULT_STATUS_CODE;
    }

    return parsedStatusCode;
  }

  // JSON Representation
  toJSON() {
    return {
      name: this.name,
      message_EN: this.message_EN,
      message_AR: this.message_AR,
      statusCode: this.statusCode,
      isOperational: this.isOperational,

      ...(this.code && { code: this.code }),

      ...(this.details !== undefined && { details: this.details }),

      ...(this.meta !== undefined && { meta: this.meta })
    };
  }

  // String Representation
  toString() {
    return [`${this.name}:`, `[${this.statusCode}]`, this.message_EN, "-", this.message_AR].join(" ");
  }
}
