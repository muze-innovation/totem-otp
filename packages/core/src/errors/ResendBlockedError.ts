export class ResendBlockedError extends Error {
  constructor(public readonly msUntilNextSend: number) {
    super(`Resend is being blocked for ${msUntilNextSend}ms.`)
    this.name = 'ResendBlockedError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ResendBlockedError)
    }
  }
}
