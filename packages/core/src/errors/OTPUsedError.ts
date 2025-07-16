export class OTPUsedError extends Error {
  constructor(times: number) {
    super(`OTP Has been used too many times. ${times}`)
    this.name = 'OTPUsedError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OTPUsedError)
    }
  }
}

