import {
  generateRandomString,
  generateOTP,
  generateReference,
  generateOTPAndReference,
  type GenerationConfig
} from '../generator'

describe('generator', () => {
  describe('generateRandomString', () => {
    it('should generate a string of correct length', () => {
      const config: GenerationConfig = {
        charset: ['0123456789'],
        length: 6
      }
      const result = generateRandomString(config)
      expect(result).toHaveLength(6)
    })

    it('should generate string using only characters from charset', () => {
      const config: GenerationConfig = {
        charset: ['ABC', '123'],
        length: 10
      }
      const result = generateRandomString(config)
      expect(result).toMatch(/^[ABC123]+$/)
    })

    it('should throw error for empty charset', () => {
      const config: GenerationConfig = {
        charset: [],
        length: 6
      }
      expect(() => generateRandomString(config)).toThrow('Charset cannot be empty')
    })

    it('should throw error for zero length', () => {
      const config: GenerationConfig = {
        charset: ['0123456789'],
        length: 0
      }
      expect(() => generateRandomString(config)).toThrow('Length must be greater than 0')
    })

    it('should throw error for negative length', () => {
      const config: GenerationConfig = {
        charset: ['0123456789'],
        length: -1
      }
      expect(() => generateRandomString(config)).toThrow('Length must be greater than 0')
    })

    it('should throw error for charset with empty strings', () => {
      const config: GenerationConfig = {
        charset: ['', ''],
        length: 6
      }
      expect(() => generateRandomString(config)).toThrow('Combined charset cannot be empty')
    })
  })

  describe('generateOTP', () => {
    it('should generate OTP of correct length', () => {
      const config: GenerationConfig = {
        charset: ['0123456789'],
        length: 6
      }
      const otp = generateOTP(config)
      expect(otp).toHaveLength(6)
      expect(otp).toMatch(/^[0-9]+$/)
    })
  })

  describe('generateReference', () => {
    it('should generate reference of correct length', () => {
      const config: GenerationConfig = {
        charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
        length: 8
      }
      const reference = generateReference(config)
      expect(reference).toHaveLength(8)
      expect(reference).toMatch(/^[A-Z0-9]+$/)
    })
  })

  describe('generateOTPAndReference', () => {
    it('should generate both OTP and reference', () => {
      const otpConfig: GenerationConfig = {
        charset: ['0123456789'],
        length: 6
      }
      const referenceConfig: GenerationConfig = {
        charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
        length: 8
      }

      const result = generateOTPAndReference(otpConfig, referenceConfig)

      expect(result.otp).toHaveLength(6)
      expect(result.otp).toMatch(/^[0-9]+$/)
      expect(result.reference).toHaveLength(8)
      expect(result.reference).toMatch(/^[A-Z0-9]+$/)
    })

    it('should generate different values on subsequent calls', () => {
      const otpConfig: GenerationConfig = {
        charset: ['0123456789'],
        length: 6
      }
      const referenceConfig: GenerationConfig = {
        charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
        length: 8
      }

      const result1 = generateOTPAndReference(otpConfig, referenceConfig)
      const result2 = generateOTPAndReference(otpConfig, referenceConfig)

      // With enough length and charset variety, collision should be extremely unlikely
      expect(result1.otp).not.toBe(result2.otp)
      expect(result1.reference).not.toBe(result2.reference)
    })
  })
})

