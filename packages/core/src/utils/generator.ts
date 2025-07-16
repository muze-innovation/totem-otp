/**
 * Generation configuration for OTP/Reference values
 */
export interface GenerationConfig {
  charset: string[]
  length: number
}

/**
 * Generates a random string based on the provided configuration
 * @param config - The generation configuration containing charset and length
 * @returns A randomly generated string
 */
export function generateRandomString(config: GenerationConfig): string {
  if (!config.charset || config.charset.length === 0) {
    throw new Error('Charset cannot be empty')
  }

  if (config.length <= 0) {
    throw new Error('Length must be greater than 0')
  }

  // Combine all character sets into one string
  const allCharacters = config.charset.join('')

  if (allCharacters.length === 0) {
    throw new Error('Combined charset cannot be empty')
  }

  let result = ''
  for (let i = 0; i < config.length; i++) {
    const randomIndex = Math.floor(Math.random() * allCharacters.length)
    result += allCharacters[randomIndex]
  }

  return result
}

/**
 * Generates an OTP value based on the schema configuration
 * @param config - The OTP generation configuration
 * @returns A randomly generated OTP value
 */
export function generateOTP(config: GenerationConfig): string {
  return generateRandomString(config)
}

/**
 * Generates a reference value based on the schema configuration
 * @param config - The reference generation configuration
 * @returns A randomly generated reference value
 */
export function generateReference(config: GenerationConfig): string {
  return generateRandomString(config)
}

/**
 * Generates both OTP and reference values based on schema configuration
 * @param otpConfig - The OTP generation configuration
 * @param referenceConfig - The reference generation configuration
 * @returns An object containing both generated OTP and reference values
 */
export function generateOTPAndReference(
  otpConfig: GenerationConfig,
  referenceConfig: GenerationConfig
): { otp: string; reference: string } {
  return {
    otp: generateOTP(otpConfig),
    reference: generateReference(referenceConfig)
  }
}
