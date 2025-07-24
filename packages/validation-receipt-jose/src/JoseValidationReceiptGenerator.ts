import type { IOTPValue, IValidationReceipt, IValidationReceiptGenerator } from 'totem-otp'
import { SignJWT, jwtVerify } from 'jose'

export interface JoseValidationReceiptGeneratorOptions {
  /**
   * The shared secret for signing and verifying JWTs
   */
  sharedSecret: string

  /**
   * JWT expiration time in milliseconds (default: 1 hour)
   */
  expirationTimeMs?: number

  /**
   * JWT issuer (default: 'totem-otp')
   */
  issuer?: string

  /**
   * JWT audience (default: 'totem-otp-client')
   */
  audience?: string
}

export class JoseValidationReceiptGenerator implements IValidationReceiptGenerator {
  private readonly sharedSecret: Uint8Array
  private readonly expirationTimeMs: number
  private readonly issuer: string
  private readonly audience: string

  constructor(options: JoseValidationReceiptGeneratorOptions) {
    this.sharedSecret = new TextEncoder().encode(options.sharedSecret)
    this.expirationTimeMs = options.expirationTimeMs ?? 60 * 60 * 1000 // 1 hour default
    this.issuer = options.issuer ?? 'totem-otp'
    this.audience = options.audience ?? 'totem-otp-client'
  }

  async createValidationReceipt(otp: IOTPValue, purpose: string[]): Promise<string> {
    const nowMs = Date.now()
    const expiresAtMs = nowMs + this.expirationTimeMs

    const jwt = await new SignJWT({
      target: otp.target,
      purpose,
      ref: otp.reference
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(nowMs / 1000))
      .setExpirationTime(Math.floor(expiresAtMs / 1000))
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(`${otp.target.type}:${otp.target.value}`)
      .sign(this.sharedSecret)

    return jwt
  }

  async validateReceipt(reference: string, receipt: string): Promise<IValidationReceipt> {
    try {
      const { payload } = await jwtVerify(receipt, this.sharedSecret, {
        issuer: this.issuer,
        audience: this.audience
      })

      // Verify that the JWT was issued for this reference
      if (payload.ref !== reference) {
        throw new Error('JWT reference does not match provided reference')
      }

      // Extract expiration time in milliseconds
      const expiresAtMs = (payload.exp as number) * 1000

      return {
        target: payload.target as IOTPValue['target'],
        purpose: payload.purpose as string[],
        expiresAtMs
      }
    } catch (error) {
      throw new Error(
        `Invalid JWT receipt: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
}
