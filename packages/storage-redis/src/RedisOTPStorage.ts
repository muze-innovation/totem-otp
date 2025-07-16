import type { IOTPValue, IOTPStorage } from '@totem-otp/core'
import type { RedisClientType } from 'redis'

export interface RedisOTPStorageOptions {
  /**
   * Optional key prefix for Redis keys
   * @default 'totem-otp'
   */
  keyPrefix?: string
}

export class RedisOTPStorage implements IOTPStorage {
  private readonly keyPrefix: string

  constructor(
    private readonly redis: RedisClientType,
    options: RedisOTPStorageOptions = {}
  ) {
    this.keyPrefix = options.keyPrefix || 'totem-otp'
  }

  async store(otp: IOTPValue, parentReference: string | null, deletableAt: number): Promise<void> {
    const key = this.getKey(otp.reference)
    const ttlSeconds = Math.ceil((deletableAt - Date.now()) / 1000)

    // Store OTP data as a hash
    const hashData = {
      target_type: otp.target.type,
      target_value: otp.target.value,
      target_unique_id: otp.target.uniqueIdentifier || `${otp.target.type}|${otp.target.value}`,
      otp_value: otp.value,
      expires_at_ms: otp.expiresAtMs.toString(),
      resend_allowed_at_ms: otp.resendAllowedAtMs.toString(),
      parent_reference: parentReference || '',
      used: '0',
      created_at: Date.now().toString()
    }

    // Use a pipeline for atomic operations
    const pipeline = this.redis.multi()

    // Store the hash
    pipeline.hSet(key, hashData)

    // Set expiration time
    if (ttlSeconds > 0) {
      pipeline.expire(key, ttlSeconds)
    }

    await pipeline.exec()
  }

  async fetch(
    otpReference: string
  ): Promise<(IOTPValue & { receiptId?: string; used: number }) | null> {
    const key = this.getKey(otpReference)
    const data = await this.redis.hGetAll(key)

    if (!data || Object.keys(data).length === 0) {
      return null
    }

    // Parse the stored data back to IOTPValue
    const otpValue: IOTPValue & { receiptId?: string; used: number } = {
      target: {
        type: data.target_type as 'email' | 'msisdn',
        value: data.target_value,
        uniqueIdentifier:
          data.target_unique_id !== `${data.target_type}|${data.target_value}`
            ? data.target_unique_id
            : undefined
      },
      value: data.otp_value,
      reference: otpReference,
      expiresAtMs: parseInt(data.expires_at_ms),
      resendAllowedAtMs: parseInt(data.resend_allowed_at_ms),
      used: parseInt(data.used || '0'),
      receiptId: data.receipt_id || undefined
    }

    return otpValue
  }

  async markAsSent(otpReference: string, receiptId: string): Promise<void> {
    const key = this.getKey(otpReference)
    await this.redis.hSet(key, 'receipt_id', receiptId)
  }

  async markAsUsed(otpReference: string): Promise<number> {
    const key = this.getKey(otpReference)
    const newUsedCount = await this.redis.hIncrBy(key, 'used', 1)
    return newUsedCount
  }

  /**
   * Get the Redis key for an OTP reference
   */
  private getKey(reference: string): string {
    return `${this.keyPrefix}:${reference}`
  }

  /**
   * Delete an OTP from storage (useful for cleanup)
   */
  async delete(otpReference: string): Promise<void> {
    const key = this.getKey(otpReference)
    await this.redis.del(key)
  }
}
