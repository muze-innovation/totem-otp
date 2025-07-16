export class NoSchemaMatchedTargetConfigError extends Error {
  constructor(message: string = 'No schema matched the target configuration') {
    super(message)
    this.name = 'NoSchemaMatchedTargetConfigError'

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NoSchemaMatchedTargetConfigError)
    }
  }
}

