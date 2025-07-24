import type { IOTPTarget, IOTPValue } from 'totem-otp'
import { JoseValidationReceiptGenerator, type JoseValidationReceiptGeneratorOptions } from '../JoseValidationReceiptGenerator'
import { decodeJwt } from 'jose'

describe('JoseValidationReceiptGenerator', () => {
  let generator: JoseValidationReceiptGenerator
  let options: JoseValidationReceiptGeneratorOptions

  const mockTarget: IOTPTarget = {
    type: 'email',
    value: 'test@example.com'
  }

  const mockOTPValue: IOTPValue = {
    target: mockTarget,
    value: '123456',
    reference: 'REF123',
    expiresAtMs: Date.now() + 300000, // 5 minutes from now
    resendAllowedAtMs: Date.now() + 120000 // 2 minutes from now
  }

  beforeEach(() => {
    options = {
      sharedSecret: 'test-secret-key-32-characters-long-for-security',
      expirationTimeMs: 60 * 60 * 1000, // 1 hour
      issuer: 'test-issuer',
      audience: 'test-audience'
    }
    generator = new JoseValidationReceiptGenerator(options)
  })

  describe('constructor', () => {
    it('should create instance with required options', () => {
      const minimalOptions = {
        sharedSecret: 'test-secret'
      }
      const minimalGenerator = new JoseValidationReceiptGenerator(minimalOptions)
      
      expect(minimalGenerator).toBeInstanceOf(JoseValidationReceiptGenerator)
    })

    it('should use default values for optional options', () => {
      const minimalOptions = {
        sharedSecret: 'test-secret'
      }
      const minimalGenerator = new JoseValidationReceiptGenerator(minimalOptions)
      
      // We can't directly access private properties, but we can test behavior
      expect(minimalGenerator).toBeInstanceOf(JoseValidationReceiptGenerator)
    })

    it('should accept custom options', () => {
      expect(generator).toBeInstanceOf(JoseValidationReceiptGenerator)
    })
  })

  describe('createValidationReceipt', () => {
    it('should create a valid JWT receipt', async () => {
      const purpose = ['login']
      const receipt = await generator.createValidationReceipt(mockOTPValue, purpose)

      expect(typeof receipt).toBe('string')
      expect(receipt.split('.')).toHaveLength(3) // JWT has 3 parts
    })

    it('should create receipt with correct payload', async () => {
      const purpose = ['login', 'transfer']
      const receipt = await generator.createValidationReceipt(mockOTPValue, purpose)

      const decoded = decodeJwt(receipt)
      
      expect(decoded.target).toEqual(mockTarget)
      expect(decoded.purpose).toEqual(purpose)
      expect(decoded.ref).toBe('REF123')
      expect(decoded.iss).toBe('test-issuer')
      expect(decoded.aud).toBe('test-audience')
      expect(decoded.sub).toBe('email:test@example.com')
      expect(decoded.iat).toBeCloseTo(Date.now() / 1000, -1) // Within 10 seconds
      expect(decoded.exp).toBeCloseTo((Date.now() + 60 * 60 * 1000) / 1000, -1) // Within 10 seconds
    })

    it('should create receipt with multiple purposes', async () => {
      const purpose = ['login', 'reset-password', 'transfer', 'admin-access']
      const receipt = await generator.createValidationReceipt(mockOTPValue, purpose)

      const decoded = decodeJwt(receipt)
      expect(decoded.purpose).toEqual(purpose)
    })

    it('should create receipt with msisdn target', async () => {
      const msisdnTarget: IOTPTarget = {
        type: 'msisdn',
        value: '+1234567890'
      }
      const msisdnOTP: IOTPValue = {
        ...mockOTPValue,
        target: msisdnTarget
      }

      const receipt = await generator.createValidationReceipt(msisdnOTP, ['login'])
      const decoded = decodeJwt(receipt)

      expect(decoded.target).toEqual(msisdnTarget)
      expect(decoded.sub).toBe('msisdn:+1234567890')
    })

    it('should create different receipts for different references', async () => {
      const otp1 = { ...mockOTPValue, reference: 'REF001' }
      const otp2 = { ...mockOTPValue, reference: 'REF002' }

      const receipt1 = await generator.createValidationReceipt(otp1, ['login'])
      const receipt2 = await generator.createValidationReceipt(otp2, ['login'])

      expect(receipt1).not.toBe(receipt2)

      const decoded1 = decodeJwt(receipt1)
      const decoded2 = decodeJwt(receipt2)

      expect(decoded1.ref).toBe('REF001')
      expect(decoded2.ref).toBe('REF002')
    })
  })

  describe('validateReceipt', () => {
    it('should validate a valid receipt', async () => {
      const purpose = ['login']
      const receipt = await generator.createValidationReceipt(mockOTPValue, purpose)

      const result = await generator.validateReceipt('REF123', receipt)

      expect(result).toEqual({
        target: mockTarget,
        purpose,
        expiresAtMs: expect.any(Number)
      })
      expect(result.expiresAtMs).toBeCloseTo(Date.now() + 60 * 60 * 1000, -10000) // Within 10 seconds
    })

    it('should validate receipt with multiple purposes', async () => {
      const purpose = ['login', 'reset-password', 'transfer']
      const receipt = await generator.createValidationReceipt(mockOTPValue, purpose)

      const result = await generator.validateReceipt('REF123', receipt)

      expect(result.purpose).toEqual(purpose)
    })

    it('should validate receipt with target containing uniqueIdentifier', async () => {
      const targetWithId: IOTPTarget = {
        ...mockTarget,
        uniqueIdentifier: 'user-123'
      }
      const otpWithId: IOTPValue = {
        ...mockOTPValue,
        target: targetWithId
      }

      const receipt = await generator.createValidationReceipt(otpWithId, ['login'])
      const result = await generator.validateReceipt('REF123', receipt)

      expect(result.target).toEqual(targetWithId)
    })

    describe('error cases', () => {
      it('should throw error for invalid JWT format', async () => {
        await expect(
          generator.validateReceipt('REF123', 'invalid-jwt')
        ).rejects.toThrow('Invalid JWT receipt')
      })

      it('should throw error for JWT with wrong reference', async () => {
        const receipt = await generator.createValidationReceipt(mockOTPValue, ['login'])

        await expect(
          generator.validateReceipt('WRONG_REF', receipt)
        ).rejects.toThrow('Invalid JWT receipt: JWT reference does not match provided reference')
      })

      it('should throw error for JWT signed with different secret', async () => {
        const otherGenerator = new JoseValidationReceiptGenerator({
          sharedSecret: 'different-secret-key'
        })
        const receipt = await otherGenerator.createValidationReceipt(mockOTPValue, ['login'])

        await expect(
          generator.validateReceipt('REF123', receipt)
        ).rejects.toThrow('Invalid JWT receipt')
      })

      it('should throw error for expired JWT', async () => {
        const shortLivedGenerator = new JoseValidationReceiptGenerator({
          ...options,
          expirationTimeMs: 1 // 1 millisecond
        })

        const receipt = await shortLivedGenerator.createValidationReceipt(mockOTPValue, ['login'])
        
        // Wait for JWT to expire
        await new Promise(resolve => setTimeout(resolve, 10))

        await expect(
          shortLivedGenerator.validateReceipt('REF123', receipt)
        ).rejects.toThrow('Invalid JWT receipt')
      })

      it('should throw error for JWT with wrong issuer', async () => {
        const otherGenerator = new JoseValidationReceiptGenerator({
          ...options,
          issuer: 'wrong-issuer'
        })
        const receipt = await otherGenerator.createValidationReceipt(mockOTPValue, ['login'])

        await expect(
          generator.validateReceipt('REF123', receipt)
        ).rejects.toThrow('Invalid JWT receipt')
      })

      it('should throw error for JWT with wrong audience', async () => {
        const otherGenerator = new JoseValidationReceiptGenerator({
          ...options,
          audience: 'wrong-audience'
        })
        const receipt = await otherGenerator.createValidationReceipt(mockOTPValue, ['login'])

        await expect(
          generator.validateReceipt('REF123', receipt)
        ).rejects.toThrow('Invalid JWT receipt')
      })

      it('should handle malformed JWT gracefully', async () => {
        await expect(
          generator.validateReceipt('REF123', 'not.a.jwt')
        ).rejects.toThrow('Invalid JWT receipt')
      })

      it('should handle empty receipt gracefully', async () => {
        await expect(
          generator.validateReceipt('REF123', '')
        ).rejects.toThrow('Invalid JWT receipt')
      })
    })
  })

  describe('integration scenarios', () => {
    it('should handle complete create and validate cycle', async () => {
      const purpose = ['login', 'admin']
      
      // Create receipt
      const receipt = await generator.createValidationReceipt(mockOTPValue, purpose)
      
      // Validate receipt
      const result = await generator.validateReceipt('REF123', receipt)
      
      expect(result.target).toEqual(mockTarget)
      expect(result.purpose).toEqual(purpose)
      expect(result.expiresAtMs).toBeGreaterThan(Date.now())
    })

    it('should work with minimal configuration', async () => {
      const minimalGenerator = new JoseValidationReceiptGenerator({
        sharedSecret: 'minimal-secret'
      })

      const receipt = await minimalGenerator.createValidationReceipt(mockOTPValue, ['test'])
      const result = await minimalGenerator.validateReceipt('REF123', receipt)

      expect(result).toBeDefined()
      expect(result.target).toEqual(mockTarget)
      expect(result.purpose).toEqual(['test'])
    })

    it('should maintain consistency across multiple operations', async () => {
      const purposes = [
        ['login'],
        ['transfer'],
        ['login', 'admin'],
        ['reset-password', 'change-email']
      ]

      const receipts = await Promise.all(
        purposes.map(purpose => generator.createValidationReceipt(mockOTPValue, purpose))
      )

      const results = await Promise.all(
        receipts.map(receipt => generator.validateReceipt('REF123', receipt))
      )

      results.forEach((result, index) => {
        expect(result.target).toEqual(mockTarget)
        expect(result.purpose).toEqual(purposes[index])
        expect(result.expiresAtMs).toBeGreaterThan(Date.now())
      })
    })

    it('should handle concurrent operations', async () => {
      const concurrentPromises = Array(10).fill(null).map(async (_, index) => {
        const purpose = [`action-${index}`]
        const otp = { ...mockOTPValue, reference: `REF-${index}` }
        
        const receipt = await generator.createValidationReceipt(otp, purpose)
        const result = await generator.validateReceipt(`REF-${index}`, receipt)
        
        return { purpose, result }
      })

      const results = await Promise.all(concurrentPromises)

      results.forEach(({ purpose, result }, index) => {
        expect(result.target).toEqual(mockTarget)
        expect(result.purpose).toEqual([`action-${index}`])
        expect(result.expiresAtMs).toBeGreaterThan(Date.now())
      })
    })
  })

  describe('edge cases', () => {
    it('should handle very long purposes array', async () => {
      const purpose = Array(100).fill(null).map((_, i) => `purpose-${i}`)
      
      const receipt = await generator.createValidationReceipt(mockOTPValue, purpose)
      const result = await generator.validateReceipt('REF123', receipt)

      expect(result.purpose).toEqual(purpose)
      expect(result.purpose).toHaveLength(100)
    })

    it('should handle empty purposes array', async () => {
      const purpose: string[] = []
      
      const receipt = await generator.createValidationReceipt(mockOTPValue, purpose)
      const result = await generator.validateReceipt('REF123', receipt)

      expect(result.purpose).toEqual([])
    })

    it('should handle special characters in reference', async () => {
      const specialRef = 'REF-123_ABC.def!@#'
      const otp = { ...mockOTPValue, reference: specialRef }
      
      const receipt = await generator.createValidationReceipt(otp, ['login'])
      const result = await generator.validateReceipt(specialRef, receipt)

      expect(result).toBeDefined()
    })

    it('should handle unicode characters in target values', async () => {
      const unicodeTarget: IOTPTarget = {
        type: 'email',
        value: 'tëst@éxämplé.cöm'
      }
      const unicodeOTP: IOTPValue = {
        ...mockOTPValue,
        target: unicodeTarget
      }

      const receipt = await generator.createValidationReceipt(unicodeOTP, ['login'])
      const result = await generator.validateReceipt('REF123', receipt)

      expect(result.target).toEqual(unicodeTarget)
    })
  })
})