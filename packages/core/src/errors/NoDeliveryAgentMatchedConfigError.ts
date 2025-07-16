export class NoDeliveryAgentMatchedConfigError extends Error {
  constructor(message: string = 'No delivery agent matched the configuration') {
    super(message)
    this.name = 'NoDeliveryAgentMatchedConfigError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NoDeliveryAgentMatchedConfigError)
    }
  }
}

