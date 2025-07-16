export class OTPMismatchedError extends Error {
  constructor(message: string = 'OTP value does not match') {
    super(message)
    this.name = 'OTPMismatchedError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OTPMismatchedError)
    }
  }
}

