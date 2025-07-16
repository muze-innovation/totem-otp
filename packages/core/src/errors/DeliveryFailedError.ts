export class DeliveryFailedError extends Error {
  constructor(message: string = 'OTP delivery failed') {
    super(message)
    this.name = 'DeliveryFailedError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DeliveryFailedError)
    }
  }
}

