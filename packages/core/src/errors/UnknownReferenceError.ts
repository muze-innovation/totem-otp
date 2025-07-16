export class UnknownReferenceError extends Error {
  constructor(message: string = 'Unknown OTP reference') {
    super(message)
    this.name = 'UnknownReferenceError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnknownReferenceError)
    }
  }
}

