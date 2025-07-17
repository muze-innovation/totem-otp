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

  describe('markRequested', () => {
    const recipientKey = 'email|test@example.com'
    const blockedForMs = 120000 // 2 minutes

    it('should return 0 for first request (not blocked)', async () => {
      const result = await storage.markRequested(recipientKey, blockedForMs)
      expect(result).toBe(0)

      // Verify the key exists with correct TTL
      const blockKey = 'totem-otp:block:email|test@example.com'
      const exists = await redisClient.exists(blockKey)
      expect(exists).toBe(1)

      const ttl = await redisClient.pTTL(blockKey)
      expect(ttl).toBeGreaterThan(110000) // Should be close to 2 minutes
      expect(ttl).toBeLessThanOrEqual(120000)
    })

    it('should return remaining TTL for subsequent requests (blocked)', async () => {
      // First request
      await storage.markRequested(recipientKey, blockedForMs)

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100))

      // Second request should return remaining TTL
      const result = await storage.markRequested(recipientKey, blockedForMs)
      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThan(blockedForMs)
    })

    it('should handle concurrent requests atomically', async () => {
      // Multiple concurrent requests
      const promises = Array(5).fill(null).map(() => 
        storage.markRequested(recipientKey, blockedForMs)
      )

      const results = await Promise.all(promises)

      // First request should return 0, others should return TTL
      const firstRequest = results.filter(r => r === 0)
      const blockedRequests = results.filter(r => r > 0)

      expect(firstRequest).toHaveLength(1)
      expect(blockedRequests).toHaveLength(4)
    })

    it('should reset block after TTL expires', async () => {
      const shortBlockMs = 50 // 50ms
      
      // First request
      const result1 = await storage.markRequested(recipientKey, shortBlockMs)
      expect(result1).toBe(0)

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 60))

      // Should be unblocked now
      const result2 = await storage.markRequested(recipientKey, blockedForMs)
      expect(result2).toBe(0)
    })

    it('should handle different recipient keys independently', async () => {
      const recipient1 = 'email|user1@example.com'
      const recipient2 = 'email|user2@example.com'

      const result1 = await storage.markRequested(recipient1, blockedForMs)
      const result2 = await storage.markRequested(recipient2, blockedForMs)

      expect(result1).toBe(0)
      expect(result2).toBe(0)

      // Both should be blocked on second request
      const result3 = await storage.markRequested(recipient1, blockedForMs)
      const result4 = await storage.markRequested(recipient2, blockedForMs)

      expect(result3).toBeGreaterThan(0)
      expect(result4).toBeGreaterThan(0)
    })

    it('should work with custom key prefix', async () => {
      const customStorage = new RedisOTPStorage(redisClient, { keyPrefix: 'custom-otp' })
      
      const result = await customStorage.markRequested(recipientKey, blockedForMs)
      expect(result).toBe(0)

      // Check the custom key exists
      const customBlockKey = 'custom-otp:block:email|test@example.com'
      const exists = await redisClient.exists(customBlockKey)
      expect(exists).toBe(1)
    })
  })

  describe('unmarkRequested', () => {
    const recipientKey = 'email|test@example.com'
    const blockedForMs = 120000

    it('should decrement block counter', async () => {
      // Block the recipient
      await storage.markRequested(recipientKey, blockedForMs)
      await storage.markRequested(recipientKey, blockedForMs)

      // Should be blocked
      const blockedResult = await storage.markRequested(recipientKey, blockedForMs)
      expect(blockedResult).toBeGreaterThan(0)

      // Unmark once
      await storage.unmarkRequested(recipientKey)

      // Should still be blocked but with decremented counter
      const stillBlockedResult = await storage.markRequested(recipientKey, blockedForMs)
      expect(stillBlockedResult).toBeGreaterThan(0)
    })

    it('should handle unmark on non-existent key gracefully', async () => {
      await expect(storage.unmarkRequested('non-existent-key')).resolves.not.toThrow()
    })

    it('should work with custom key prefix', async () => {
      const customStorage = new RedisOTPStorage(redisClient, { keyPrefix: 'custom-otp' })
      
      await customStorage.markRequested(recipientKey, blockedForMs)
      await expect(customStorage.unmarkRequested(recipientKey)).resolves.not.toThrow()
    })
  })

  describe('store', () => {
    it('should store OTP with composite key and correct expiration', async () => {
      const deletableAt = Date.now() + 1800000 // 30 minutes

      await storage.store(mockOTPValue, deletableAt)

      // Check if composite key exists
      const key = 'totem-otp:REF123:123456'
      const exists = await redisClient.exists(key)
      expect(exists).toBe(1)

      // Check TTL is set correctly
      const ttl = await redisClient.ttl(key)
      expect(ttl).toBeGreaterThan(1700) // Should be close to 30 minutes
      expect(ttl).toBeLessThanOrEqual(1800)

      // Verify stored data
      const storedData = await redisClient.hGetAll(key)
      expect(storedData.target_type).toBe('email')
      expect(storedData.target_value).toBe('test@example.com')
      expect(storedData.target_unique_id).toBe('user-123')
      expect(storedData.reference).toBe('REF123')
      expect(storedData.otp_value).toBe('123456')
      expect(storedData.used).toBe('0')
    })

    it('should store OTP without unique identifier', async () => {
      const otpWithoutUniqueId: IOTPValue = {
        ...mockOTPValue,
        target: {
          type: 'email',
          value: 'test@example.com'
        }
      }

      const deletableAt = Date.now() + 1800000
      await storage.store(otpWithoutUniqueId, deletableAt)

      const key = 'totem-otp:REF123:123456'
      const storedData = await redisClient.hGetAll(key)
      expect(storedData.target_unique_id).toBe('email|test@example.com')
    })

    it('should handle custom key prefix', async () => {
      const customStorage = new RedisOTPStorage(redisClient, { keyPrefix: 'custom-otp' })
      const deletableAt = Date.now() + 1800000

      await customStorage.store(mockOTPValue, deletableAt)

      const customKey = 'custom-otp:REF123:123456'
      const exists = await redisClient.exists(customKey)
      expect(exists).toBe(1)
    })

    it('should handle zero TTL gracefully', async () => {
      const deletableAt = Date.now() - 1000 // Already expired

      await storage.store(mockOTPValue, deletableAt)

      const key = 'totem-otp:REF123:123456'
      const exists = await redisClient.exists(key)
      expect(exists).toBe(1) // Should still be stored
    })
  })

  describe('fetchAndUsed', () => {
    beforeEach(async () => {
      const deletableAt = Date.now() + 1800000
      await storage.store(mockOTPValue, deletableAt)
    })

    it('should fetch OTP and increment used counter atomically', async () => {
      const result = await storage.fetchAndUsed('REF123', '123456')

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
        used: 1, // Should be incremented to 1
        receiptId: undefined
      })

      // Verify the used counter was actually incremented in Redis
      const key = 'totem-otp:REF123:123456'
      const usedCount = await redisClient.hGet(key, 'used')
      expect(usedCount).toBe('1')
    })

    it('should return null for non-existent reference/value combination', async () => {
      const result = await storage.fetchAndUsed('NONEXISTENT', '123456')
      expect(result).toBeNull()
    })

    it('should return null for correct reference but wrong OTP value', async () => {
      const result = await storage.fetchAndUsed('REF123', '654321')
      expect(result).toBeNull()
    })

    it('should handle multiple fetch operations and increment correctly', async () => {
      const result1 = await storage.fetchAndUsed('REF123', '123456')
      expect(result1?.used).toBe(1)

      const result2 = await storage.fetchAndUsed('REF123', '123456')
      expect(result2?.used).toBe(2)

      const result3 = await storage.fetchAndUsed('REF123', '123456')
      expect(result3?.used).toBe(3)
    })

    it('should handle OTP without unique identifier', async () => {
      const otpWithoutUniqueId: IOTPValue = {
        ...mockOTPValue,
        reference: 'REF456',
        target: {
          type: 'email',
          value: 'test@example.com'
        }
      }

      const deletableAt = Date.now() + 1800000
      await storage.store(otpWithoutUniqueId, deletableAt)

      const result = await storage.fetchAndUsed('REF456', '123456')
      expect(result?.target.uniqueIdentifier).toBeUndefined()
    })

    it('should fetch OTP with receipt ID', async () => {
      await storage.markAsSent('REF123', '123456', 'receipt-456')

      const result = await storage.fetchAndUsed('REF123', '123456')
      expect(result?.receiptId).toBe('receipt-456')
    })

    it('should handle concurrent fetch operations atomically', async () => {
      const promises = Array(5).fill(null).map(() => 
        storage.fetchAndUsed('REF123', '123456')
      )

      const results = await Promise.all(promises)

      // All should succeed and have incrementing used counts
      results.forEach((result, index) => {
        expect(result).toBeDefined()
        expect(result?.used).toBe(index + 1)
      })

      // Final used count should be 5
      const key = 'totem-otp:REF123:123456'
      const finalUsedCount = await redisClient.hGet(key, 'used')
      expect(finalUsedCount).toBe('5')
    })
  })

  describe('markAsSent', () => {
    beforeEach(async () => {
      const deletableAt = Date.now() + 1800000
      await storage.store(mockOTPValue, deletableAt)
    })

    it('should mark OTP as sent with receipt ID using composite key', async () => {
      await storage.markAsSent('REF123', '123456', 'receipt-789')

      const key = 'totem-otp:REF123:123456'
      const receiptId = await redisClient.hGet(key, 'receipt_id')
      expect(receiptId).toBe('receipt-789')
    })

    it('should update existing receipt ID', async () => {
      await storage.markAsSent('REF123', '123456', 'receipt-old')
      await storage.markAsSent('REF123', '123456', 'receipt-new')

      const key = 'totem-otp:REF123:123456'
      const receiptId = await redisClient.hGet(key, 'receipt_id')
      expect(receiptId).toBe('receipt-new')
    })

    it('should not affect other OTP combinations', async () => {
      // Store another OTP with different value
      const otherOTP: IOTPValue = {
        ...mockOTPValue,
        value: '654321'
      }
      const deletableAt = Date.now() + 1800000
      await storage.store(otherOTP, deletableAt)

      // Mark first OTP as sent
      await storage.markAsSent('REF123', '123456', 'receipt-first')

      // Check that second OTP is not affected
      const key2 = 'totem-otp:REF123:654321'
      const receiptId2 = await redisClient.hGet(key2, 'receipt_id')
      expect(receiptId2).toBe(null)
    })
  })

  describe('delete', () => {
    beforeEach(async () => {
      const deletableAt = Date.now() + 1800000
      await storage.store(mockOTPValue, deletableAt)
    })

    it('should delete OTP using composite key', async () => {
      await storage.delete('REF123', '123456')

      const result = await storage.fetchAndUsed('REF123', '123456')
      expect(result).toBeNull()
    })

    it('should handle deleting non-existent OTP', async () => {
      await expect(storage.delete('NONEXISTENT', '123456')).resolves.not.toThrow()
    })
  })

  describe('integration workflows', () => {
    it('should handle complete OTP lifecycle with blocking', async () => {
      const recipientKey = 'email|test@example.com'
      const blockedForMs = 120000
      const deletableAt = Date.now() + 1800000

      // 1. First request should not be blocked
      const blockResult1 = await storage.markRequested(recipientKey, blockedForMs)
      expect(blockResult1).toBe(0)

      // 2. Store OTP
      await storage.store(mockOTPValue, deletableAt)

      // 3. Mark as sent
      await storage.markAsSent('REF123', '123456', 'receipt-123')

      // 4. Validate (fetch and use)
      const otpResult = await storage.fetchAndUsed('REF123', '123456')
      expect(otpResult).toBeDefined()
      expect(otpResult?.used).toBe(1)
      expect(otpResult?.receiptId).toBe('receipt-123')

      // 5. Second request should be blocked
      const blockResult2 = await storage.markRequested(recipientKey, blockedForMs)
      expect(blockResult2).toBeGreaterThan(0)

      // 6. Unblock
      await storage.unmarkRequested(recipientKey)

      // 7. Clean up
      await storage.delete('REF123', '123456')
      const deletedResult = await storage.fetchAndUsed('REF123', '123456')
      expect(deletedResult).toBeNull()
    })

    it('should maintain data integrity across operations', async () => {
      const deletableAt = Date.now() + 1800000

      // Store OTP
      await storage.store(mockOTPValue, deletableAt)

      // Mark as sent
      await storage.markAsSent('REF123', '123456', 'receipt-abc')

      // Use multiple times
      await storage.fetchAndUsed('REF123', '123456')
      await storage.fetchAndUsed('REF123', '123456')

      // Fetch final state
      const result = await storage.fetchAndUsed('REF123', '123456')

      expect(result).toEqual({
        target: mockOTPValue.target,
        value: mockOTPValue.value,
        reference: mockOTPValue.reference,
        expiresAtMs: mockOTPValue.expiresAtMs,
        resendAllowedAtMs: mockOTPValue.resendAllowedAtMs,
        used: 3, // Third validation
        receiptId: 'receipt-abc'
      })
    })

    it('should handle different OTP values for same reference', async () => {
      const deletableAt = Date.now() + 1800000

      // Store two OTPs with same reference but different values
      const otp1 = { ...mockOTPValue, value: '111111' }
      const otp2 = { ...mockOTPValue, value: '222222' }

      await storage.store(otp1, deletableAt)
      await storage.store(otp2, deletableAt)

      // Should be able to fetch both independently
      const result1 = await storage.fetchAndUsed('REF123', '111111')
      const result2 = await storage.fetchAndUsed('REF123', '222222')

      expect(result1?.value).toBe('111111')
      expect(result1?.used).toBe(1)

      expect(result2?.value).toBe('222222')
      expect(result2?.used).toBe(1)

      // Wrong combinations should return null
      const wrongResult = await storage.fetchAndUsed('REF123', '333333')
      expect(wrongResult).toBeNull()
    })
  })

  describe('expiration handling', () => {
    it('should handle OTP expiration correctly', async () => {
      const shortTTL = 1 // 1 second
      const deletableAt = Date.now() + shortTTL * 1000

      await storage.store(mockOTPValue, deletableAt)

      // Should exist immediately
      expect(await storage.fetchAndUsed('REF123', '123456')).toBeDefined()

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100))

      // Should no longer exist
      expect(await storage.fetchAndUsed('REF123', '123456')).toBeNull()
    })

    it('should handle blocking expiration correctly', async () => {
      const recipientKey = 'email|test@example.com'
      const shortBlockMs = 100 // 100ms

      // Block recipient
      const result1 = await storage.markRequested(recipientKey, shortBlockMs)
      expect(result1).toBe(0)

      // Should be blocked immediately
      const result2 = await storage.markRequested(recipientKey, shortBlockMs)
      expect(result2).toBeGreaterThan(0)

      // Wait for block to expire
      await new Promise(resolve => setTimeout(resolve, 150))

      // Should be unblocked
      const result3 = await storage.markRequested(recipientKey, shortBlockMs)
      expect(result3).toBe(0)
    })
  })

  describe('error handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      const disconnectedClient = createClient({
        socket: {
          host: 'localhost',
          port: 0 // Invalid port
        }
      }) as RedisClientType

      const errorStorage = new RedisOTPStorage(disconnectedClient)

      await expect(errorStorage.store(mockOTPValue, Date.now() + 1800000)).rejects.toThrow()
      await expect(errorStorage.markRequested('test-key', 120000)).rejects.toThrow()
      await expect(errorStorage.fetchAndUsed('REF123', '123456')).rejects.toThrow()
    })
  })
})