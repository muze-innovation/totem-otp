export class UnmatchedValidationReceipt extends Error {
  constructor() {
    super('No validation receipt generator implementation available')
    this.name = 'UnmatchedValidationReceipt'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnmatchedValidationReceipt)
    }
  }
}

