import type { IOTPValue, IOTPStorage } from 'totem-otp'
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

  /**
   * Used when an OTP was requested. We will use this flag to render the
   * target as not yet ready to received another OTP.
   *
   * @param otpReceipientKey - the target unique key represent the unique OTP receipient address.
   * @param blockedForMs - number of Milliseconds if this request went through until this audience will be ready to received the next one.
   * @returns number - 0 if this receipient key is open for receiving. Otherwise returns TTL until banned will be lifted.
   */
  async markRequested(otpReceipientKey: string, blockedForMs: number): Promise<number> {
    const blockKey = this.getBlockKey(otpReceipientKey)

    // Lua script to atomically increment and conditionally set expiration
    const luaScript = `
      local key = KEYS[1]
      local ttl_ms = tonumber(ARGV[1])
      
      local count = redis.call('INCR', key)
      
      if count == 1 then
        redis.call('PEXPIRE', key, ttl_ms)
        return 0
      else
        local remaining_ttl = redis.call('PTTL', key)
        if remaining_ttl <= 0 then
          -- Key exists but no TTL, reset it
          redis.call('SET', key, '1', 'PX', ttl_ms)
          return 0
        end
        return remaining_ttl
      end
    `

    const result = (await this.redis.eval(luaScript, {
      keys: [blockKey],
      arguments: [blockedForMs.toString()]
    })) as number

    return result
  }

  /**
   * Use this for rollback to banned imposed earlier.
   *
   * @param otpReceipientKey the key of receipient to be lifted.
   */
  async unmarkRequested(otpReceipientKey: string): Promise<void> {
    const blockKey = this.getBlockKey(otpReceipientKey)

    // Decrement the block counter
    await this.redis.decr(blockKey)
  }

  /**
   * Save the provided OTP value before the OTP is to be sent.
   *
   * @param otp - the OTP Value
   * @param deletableAt - the field indicate when this OTP is free to delete from Database.
   */
  async store(otp: IOTPValue, deletableAt: number): Promise<void> {
    const key = this.getCompositeKey(otp.reference, otp.value)
    const ttlSeconds = Math.ceil((deletableAt - Date.now()) / 1000)

    // Store OTP data as a hash
    const hashData = {
      target_type: otp.target.type,
      target_value: otp.target.value,
      target_unique_id: otp.target.uniqueIdentifier || `${otp.target.type}|${otp.target.value}`,
      reference: otp.reference,
      otp_value: otp.value,
      expires_at_ms: otp.expiresAtMs.toString(),
      resend_allowed_at_ms: otp.resendAllowedAtMs.toString(), // this is no longer true. However it is a good to know value.
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

  /**
   * Retrieve the provided OTP from the Reference. Whenever system retrieved
   * the OTP Value from store this means it has been used.
   *
   * @param otpReference the OTP reference used when `store` was called.
   * @param otpValue the OTP Value used as conjunction primary key.
   * @return The OTP value recently stored in the Storage with its additional optional field (receiptId, used).
   */
  async fetchAndUsed(
    otpReference: string,
    otpValue: string
  ): Promise<(IOTPValue & { receiptId?: string; used: number }) | null> {
    const key = this.getCompositeKey(otpReference, otpValue)

    // Use a pipeline to atomically fetch and increment used counter
    const pipeline = this.redis.multi()
    pipeline.hGetAll(key)
    pipeline.hIncrBy(key, 'used', 1)

    const results = await pipeline.exec()

    if (!results || results.length < 2) {
      return null
    }

    // Redis pipeline results are wrapped in reply arrays
    const data: Record<string, string> = results[0] as any
    const newUsedCount = +results[1]

    if (!data || Object.keys(data).length === 0) {
      return null
    }

    // Parse the stored data back to IOTPValue
    const otpValueResult: IOTPValue & { receiptId?: string; used: number } = {
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
      used: newUsedCount,
      receiptId: data.receipt_id || undefined
    }

    return otpValueResult
  }

  /**
   * Set the given OTP that is has been sent.
   *
   * Mark that the OTP has been sent
   * @param otpReference the OTP reference used when `store` was called.
   * @param otpValue the OTP Value used as conjunction primary key.
   * @param receiptId the delivery receipt id.
   */
  async markAsSent(otpReference: string, otpValue: string, receiptId: string): Promise<void> {
    const key = this.getCompositeKey(otpReference, otpValue)
    await this.redis.hSet(key, 'receipt_id', receiptId)
  }

  /**
   * Get the Redis key for OTP storage using composite key (reference:otp)
   */
  private getCompositeKey(reference: string, otpValue: string): string {
    return `${this.keyPrefix}:${reference}:${otpValue}`
  }

  /**
   * Get the Redis key for recipient blocking
   */
  private getBlockKey(otpReceipientKey: string): string {
    return `${this.keyPrefix}:block:${otpReceipientKey}`
  }

  /**
   * Delete an OTP from storage (useful for cleanup)
   */
  async delete(otpReference: string, otpValue: string): Promise<void> {
    const key = this.getCompositeKey(otpReference, otpValue)
    await this.redis.del(key)
  }
}
