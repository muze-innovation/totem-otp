export class ValidationReceiptError extends Error {
  constructor(message: string) {
    super(`Validation receipt error: ${message}`)
    this.name = 'ValidationReceiptError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ValidationReceiptError)
    }
  }
}

