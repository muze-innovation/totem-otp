import type { IOTPValue } from '@totem-otp/core'

import { createClient, RedisClientType } from 'redis'
import { RedisMemoryServer } from 'redis-memory-server'
import { RedisOTPStorage } from '../RedisOTPStorage'

describe('RedisOTPStorage', () => {
  let redisServer: RedisMemoryServer
  let redisClient: RedisClientType
  let storage: RedisOTPStorage

  const mockOTPValue: IOTPValue = {
    target: {
      type: 'email',
      value: 'test@example.com',
      uniqueIdentifier: 'user-123'
    },
    value: '123456',
    reference: 'REF123',
    expiresAtMs: Date.now() + 300000, // 5 minutes
    resendAllowedAtMs: Date.now() + 120000 // 2 minutes
  }

  beforeAll(async () => {
    // Start Redis memory server
    redisServer = new RedisMemoryServer()
    const host = await redisServer.getHost()
    const port = await redisServer.getPort()

    // Create Redis client
    redisClient = createClient({
      socket: {
        host,
        port
      }
    })

    await redisClient.connect()
  })

  afterAll(async () => {
    await redisClient.disconnect()
    await redisServer.stop()
  })

  beforeEach(async () => {
    // Clear Redis database
    await redisClient.flushDb()

    // Create fresh storage instance
    storage = new RedisOTPStorage(redisClient)
  })

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const defaultStorage = new RedisOTPStorage(redisClient)
      expect(defaultStorage).toBeInstanceOf(RedisOTPStorage)
    })

    it('should create instance with custom key prefix', () => {
      const customStorage = new RedisOTPStorage(redisClient, { keyPrefix: 'custom-otp' })
      expect(customStorage).toBeInstanceOf(RedisOTPStorage)
    })
  })

  describe('store', () => {
    it('should store OTP with correct expiration', async () => {
      const deletableAt = Date.now() + 1800000 // 30 minutes

      await storage.store(mockOTPValue, null, deletableAt)

      // Check if key exists
      const key = 'totem-otp:REF123'
      const exists = await redisClient.exists(key)
      expect(exists).toBe(1)

      // Check TTL is set correctly
      const ttl = await redisClient.ttl(key)
      expect(ttl).toBeGreaterThan(1700) // Should be close to 30 minutes
      expect(ttl).toBeLessThanOrEqual(1800)
    })

    it('should store OTP with parent reference', async () => {
      const deletableAt = Date.now() + 1800000

      await storage.store(mockOTPValue, 'PARENT123', deletableAt)

      const storedOTP = await storage.fetch('REF123')
      expect(storedOTP).toBeDefined()

      // Check parent reference in Redis hash
      const key = 'totem-otp:REF123'
      const parentRef = await redisClient.hGet(key, 'parent_reference')
      expect(parentRef).toBe('PARENT123')
    })

    it('should store OTP without parent reference', async () => {
      const deletableAt = Date.now() + 1800000

      await storage.store(mockOTPValue, null, deletableAt)

      const key = 'totem-otp:REF123'
      const parentRef = await redisClient.hGet(key, 'parent_reference')
      expect(parentRef).toBe('')
    })

    it('should handle custom key prefix', async () => {
      const customStorage = new RedisOTPStorage(redisClient, { keyPrefix: 'custom-otp' })
      const deletableAt = Date.now() + 1800000

      await customStorage.store(mockOTPValue, null, deletableAt)

      const customKey = 'custom-otp:REF123'
      const exists = await redisClient.exists(customKey)
      expect(exists).toBe(1)
    })

    it('should handle zero TTL gracefully', async () => {
      const deletableAt = Date.now() - 1000 // Already expired

      await storage.store(mockOTPValue, null, deletableAt)

      const key = 'totem-otp:REF123'
      const exists = await redisClient.exists(key)
      expect(exists).toBe(1) // Should still be stored
    })
  })

  describe('fetch', () => {
    beforeEach(async () => {
      const deletableAt = Date.now() + 1800000
      await storage.store(mockOTPValue, null, deletableAt)
    })

    it('should fetch stored OTP correctly', async () => {
      const result = await storage.fetch('REF123')

      expect(result).toEqual({
        target: {
          type: 'email',
          value: 'test@example.com',
          uniqueIdentifier: 'user-123'
        },
        value: '123456',
        reference: 'REF123',
        expiresAtMs: mockOTPValue.expiresAtMs,
        resendAllowedAtMs: mockOTPValue.resendAllowedAtMs,
        used: 0,
        receiptId: undefined
      })
    })

    it('should return null for non-existent OTP', async () => {
      const result = await storage.fetch('NONEXISTENT')
      expect(result).toBeNull()
    })

    it('should handle OTP without unique identifier', async () => {
      const otpWithoutUniqueId: IOTPValue = {
        ...mockOTPValue,
        target: {
          type: 'email',
          value: 'test@example.com'
        }
      }

      const deletableAt = Date.now() + 1800000
      await storage.store(otpWithoutUniqueId, null, deletableAt)

      const result = await storage.fetch('REF123')
      expect(result?.target.uniqueIdentifier).toBeUndefined()
    })

    it('should fetch OTP with receipt ID', async () => {
      await storage.markAsSent('REF123', 'receipt-456')

      const result = await storage.fetch('REF123')
      expect(result?.receiptId).toBe('receipt-456')
    })

    it('should fetch OTP with used count', async () => {
      await storage.markAsUsed('REF123')
      await storage.markAsUsed('REF123')

      const result = await storage.fetch('REF123')
      expect(result?.used).toBe(2)
    })
  })

  describe('markAsSent', () => {
    beforeEach(async () => {
      const deletableAt = Date.now() + 1800000
      await storage.store(mockOTPValue, null, deletableAt)
    })

    it('should mark OTP as sent with receipt ID', async () => {
      await storage.markAsSent('REF123', 'receipt-789')

      const key = 'totem-otp:REF123'
      const receiptId = await redisClient.hGet(key, 'receipt_id')
      expect(receiptId).toBe('receipt-789')
    })

    it('should update existing receipt ID', async () => {
      await storage.markAsSent('REF123', 'receipt-old')
      await storage.markAsSent('REF123', 'receipt-new')

      const key = 'totem-otp:REF123'
      const receiptId = await redisClient.hGet(key, 'receipt_id')
      expect(receiptId).toBe('receipt-new')
    })
  })

  describe('markAsUsed', () => {
    beforeEach(async () => {
      const deletableAt = Date.now() + 1800000
      await storage.store(mockOTPValue, null, deletableAt)
    })

    it('should increment used count and return new value', async () => {
      const count1 = await storage.markAsUsed('REF123')
      expect(count1).toBe(1)

      const count2 = await storage.markAsUsed('REF123')
      expect(count2).toBe(2)

      const count3 = await storage.markAsUsed('REF123')
      expect(count3).toBe(3)
    })

    it('should handle non-existent OTP', async () => {
      const count = await storage.markAsUsed('NONEXISTENT')
      expect(count).toBe(1) // Redis HINCRBY creates field if it doesn't exist
    })
  })

  describe('utility methods', () => {
    beforeEach(async () => {
      const deletableAt = Date.now() + 1800000
      await storage.store(mockOTPValue, null, deletableAt)
    })

    describe('delete', () => {
      it('should delete OTP from storage', async () => {
        await storage.delete('REF123')

        const result = await storage.fetch('REF123')
        expect(result).toBeNull()
      })

      it('should handle deleting non-existent OTP', async () => {
        await expect(storage.delete('NONEXISTENT')).resolves.not.toThrow()
      })
    })
  })

  describe('Redis connection handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      const disconnectedClient = createClient({
        socket: {
          host: 'localhost',
          port: 0 // Invalid port
        }
      }) as RedisClientType

      const errorStorage = new RedisOTPStorage(disconnectedClient)

      await expect(errorStorage.store(mockOTPValue, null, Date.now() + 1800000)).rejects.toThrow()
    })
  })

  describe('data persistence', () => {
    it('should maintain data integrity across operations', async () => {
      const deletableAt = Date.now() + 1800000

      // Store OTP
      await storage.store(mockOTPValue, 'PARENT123', deletableAt)

      // Mark as sent
      await storage.markAsSent('REF123', 'receipt-abc')

      // Mark as used multiple times
      await storage.markAsUsed('REF123')
      await storage.markAsUsed('REF123')

      // Fetch and verify all data is intact
      const result = await storage.fetch('REF123')

      expect(result).toEqual({
        target: mockOTPValue.target,
        value: mockOTPValue.value,
        reference: mockOTPValue.reference,
        expiresAtMs: mockOTPValue.expiresAtMs,
        resendAllowedAtMs: mockOTPValue.resendAllowedAtMs,
        used: 2,
        receiptId: 'receipt-abc'
      })
    })
  })

  describe('expiration handling', () => {
    it('should handle OTP expiration correctly', async () => {
      const shortTTL = 1 // 1 second
      const deletableAt = Date.now() + shortTTL * 1000

      await storage.store(mockOTPValue, null, deletableAt)

      // Should exist immediately
      expect(await storage.fetch('REF123')).toBeDefined()

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100))

      // Should no longer exist
      expect(await storage.fetch('REF123')).toBeNull()
    })
  })
})
