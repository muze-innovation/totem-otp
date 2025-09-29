export class OTPExpiredError extends Error {
  constructor() {
    super(`OTP has been expired.`)
    this.name = 'OTPExpireError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OTPExpiredError)
    }
  }
}
