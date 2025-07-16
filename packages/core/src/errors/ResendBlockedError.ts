export class ResendBlockedError extends Error {
  constructor(message: string = 'Resend is blocked by aging policy') {
    super(message)
    this.name = 'ResendBlockedError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ResendBlockedError)
    }
  }
}

