import type {
  IDeliveryAgent,
  IOTPStorage,
  IOTPTarget,
  IOTPValue,
  ITotemOTPConfiguration
} from '../interfaces'
import { TotemOTP } from '../totem-otp'
import { OTPUsedError, OTPMismatchedError, ResendBlockedError } from '../errors'

describe('TotemOTP Integration Tests', () => {
  let mockStorage: jest.Mocked<IOTPStorage>
  let mockDeliveryAgent: jest.Mocked<IDeliveryAgent>
  let configuration: ITotemOTPConfiguration
  let totemOTP: TotemOTP

  beforeEach(() => {
    jest.clearAllMocks()

    mockStorage = {
      markRequested: jest.fn().mockResolvedValue(0), // 0 means not blocked
      unmarkRequested: jest.fn().mockResolvedValue(undefined),
      store: jest.fn().mockResolvedValue(undefined),
      fetchAndUsed: jest.fn().mockResolvedValue(null),
      markAsSent: jest.fn().mockResolvedValue(undefined)
    }

    mockDeliveryAgent = {
      sendMessageToAudience: jest.fn().mockResolvedValue('receipt-123')
    }

    configuration = {
      storage: () => mockStorage,
      schemas: [
        {
          match: (target: IOTPTarget) => target.type === 'email',
          otp: { charset: ['0123456789'], length: 6 },
          reference: { charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'], length: 8 },
          aging: {
            successValidateCount: 1,
            purgeFromDbIn: 1800000, // 30 minutes
            canResendIn: 120000, // 2 minutes
            expiresIn: 300000 // 5 minutes
          }
        },
        {
          match: (target: IOTPTarget) => target.type === 'msisdn',
          otp: { charset: ['0123456789'], length: 4 },
          reference: { charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ'], length: 6 },
          aging: {
            successValidateCount: 3,
            purgeFromDbIn: 900000, // 15 minutes
            canResendIn: 60000, // 1 minute
            expiresIn: 180000 // 3 minutes
          }
        }
      ],
      deliveryAgents: [
        {
          match: (target: IOTPTarget) => target.type === 'email',
          agent: () => mockDeliveryAgent
        },
        {
          match: (target: IOTPTarget) => target.type === 'msisdn',
          agent: () => mockDeliveryAgent
        }
      ]
    }

    totemOTP = new TotemOTP(configuration)
  })

  describe('complete OTP flow', () => {
    it('should complete full OTP lifecycle for email', async () => {
      const emailTarget: IOTPTarget = {
        type: 'email',
        value: 'test@example.com'
      }

      // Step 1: Request OTP
      const otpResponse = await totemOTP.request(emailTarget)

      expect(otpResponse).toEqual({
        target: emailTarget,
        value: expect.stringMatching(/^[0-9]{6}$/),
        reference: expect.stringMatching(/^[A-Z0-9]{8}$/),
        expiresAtMs: expect.any(Number),
        resendAllowedAtMs: expect.any(Number)
      })

      // Verify request flow
      expect(mockStorage.markRequested).toHaveBeenCalledWith('email|test@example.com', 120000)
      expect(mockStorage.store).toHaveBeenCalled()
      expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalled()
      expect(mockStorage.markAsSent).toHaveBeenCalled()

      // Step 2: Simulate storage returning the OTP for validation
      mockStorage.fetchAndUsed.mockResolvedValue({
        ...otpResponse,
        receiptId: 'receipt-123',
        used: 1 // After successful validation
      })

      // Step 3: Validate OTP
      const validationResult = await totemOTP.validate(otpResponse.reference, otpResponse.value)

      expect(validationResult).toBe(1)
      expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith(
        otpResponse.reference,
        otpResponse.value
      )
    })

    it('should complete full OTP lifecycle for msisdn with multiple validations', async () => {
      const msisdnTarget: IOTPTarget = {
        type: 'msisdn',
        value: '+1234567890'
      }

      // Step 1: Request OTP
      const otpResponse = await totemOTP.request(msisdnTarget)

      expect(otpResponse).toEqual({
        target: msisdnTarget,
        value: expect.stringMatching(/^[0-9]{4}$/), // MSISDN uses 4-digit OTP
        reference: expect.stringMatching(/^[A-Z]{6}$/), // MSISDN uses 6-char reference
        expiresAtMs: expect.any(Number),
        resendAllowedAtMs: expect.any(Number)
      })

      // Step 2: Simulate storage returning the OTP for validation
      mockStorage.fetchAndUsed.mockResolvedValueOnce({
        ...otpResponse,
        receiptId: 'receipt-456',
        used: 1 // First validation
      })

      // Step 3: Validate OTP multiple times (allowed up to 3 times)
      const firstValidation = await totemOTP.validate(otpResponse.reference, otpResponse.value)
      expect(firstValidation).toBe(1)

      mockStorage.fetchAndUsed.mockResolvedValueOnce({
        ...otpResponse,
        receiptId: 'receipt-456',
        used: 2 // Second validation
      })
      const secondValidation = await totemOTP.validate(otpResponse.reference, otpResponse.value)
      expect(secondValidation).toBe(2)

      mockStorage.fetchAndUsed.mockResolvedValueOnce({
        ...otpResponse,
        receiptId: 'receipt-456',
        used: 3 // Third validation
      })
      const thirdValidation = await totemOTP.validate(otpResponse.reference, otpResponse.value)
      expect(thirdValidation).toBe(3)

      // Step 4: Fourth validation should fail
      mockStorage.fetchAndUsed.mockResolvedValueOnce({
        ...otpResponse,
        receiptId: 'receipt-456',
        used: 4 // Exceeds limit
      })
      await expect(totemOTP.validate(otpResponse.reference, otpResponse.value)).rejects.toThrow(
        OTPUsedError
      )
    })

    it('should handle blocked recipient scenario', async () => {
      const target: IOTPTarget = {
        type: 'email',
        value: 'test@example.com'
      }

      // First request succeeds
      const initialOTP = await totemOTP.request(target)
      expect(initialOTP).toBeDefined()

      // Second request is blocked
      mockStorage.markRequested.mockResolvedValue(60000) // 1 minute remaining

      await expect(totemOTP.request(target)).rejects.toThrow(ResendBlockedError)

      expect(mockStorage.markRequested).toHaveBeenCalledWith('email|test@example.com', 120000)
    })
  })

  describe('error scenarios with realistic timing', () => {
    it('should handle validation with wrong OTP after successful request', async () => {
      const target: IOTPTarget = {
        type: 'email',
        value: 'test@example.com'
      }

      // Request OTP
      const otpResponse = await totemOTP.request(target)

      // Try to validate with wrong OTP (fetchAndUsed returns null for wrong combination)
      mockStorage.fetchAndUsed.mockResolvedValue(null)

      await expect(totemOTP.validate(otpResponse.reference, '000000')).rejects.toThrow(
        OTPMismatchedError
      )

      expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith(otpResponse.reference, '000000')
    })

    it('should handle race condition in concurrent validations', async () => {
      const target: IOTPTarget = {
        type: 'email',
        value: 'test@example.com'
      }

      const otp: IOTPValue = {
        target: target,
        value: '123456',
        reference: 'RACE123',
        expiresAtMs: Date.now() + 300000,
        resendAllowedAtMs: Date.now() + 120000
      }

      // Simulate concurrent validation attempts
      mockStorage.fetchAndUsed
        .mockResolvedValueOnce({
          ...otp,
          receiptId: 'receipt-race',
          used: 1 // First validation succeeds
        })
        .mockResolvedValueOnce({
          ...otp,
          receiptId: 'receipt-race',
          used: 2 // Second validation exceeds limit for email (limit is 1)
        })

      const validationPromises = [
        totemOTP.validate(otp.reference, otp.value),
        totemOTP.validate(otp.reference, otp.value)
      ]

      const results = await Promise.allSettled(validationPromises)

      // First should succeed
      expect(results[0].status).toBe('fulfilled')
      expect((results[0] as PromiseFulfilledResult<number>).value).toBe(1)

      // Second should fail
      expect(results[1].status).toBe('rejected')
      expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(OTPUsedError)
    })

    it('should handle request failure and cleanup', async () => {
      const target: IOTPTarget = {
        type: 'email',
        value: 'test@example.com'
      }

      // Simulate delivery failure
      mockDeliveryAgent.sendMessageToAudience.mockRejectedValue(new Error('Delivery failed'))

      await expect(totemOTP.request(target)).rejects.toThrow('Delivery failed')

      // Should unmark the recipient on failure
      expect(mockStorage.unmarkRequested).toHaveBeenCalledWith('email|test@example.com')
    })
  })

  describe('schema and agent matching', () => {
    it('should use correct schema based on target type', async () => {
      const emailTarget: IOTPTarget = { type: 'email', value: 'test@example.com' }
      const msisdnTarget: IOTPTarget = { type: 'msisdn', value: '+1234567890' }

      const emailOTP = await totemOTP.request(emailTarget)
      const msisdnOTP = await totemOTP.request(msisdnTarget)

      // Email should use 6-digit OTP and 8-char reference
      expect(emailOTP.value).toMatch(/^[0-9]{6}$/)
      expect(emailOTP.reference).toMatch(/^[A-Z0-9]{8}$/)

      // MSISDN should use 4-digit OTP and 6-char reference
      expect(msisdnOTP.value).toMatch(/^[0-9]{4}$/)
      expect(msisdnOTP.reference).toMatch(/^[A-Z]{6}$/)
    })
  })

  describe('storage interaction patterns', () => {
    it('should call storage methods in correct order', async () => {
      const target: IOTPTarget = {
        type: 'email',
        value: 'test@example.com'
      }

      const callOrder: string[] = []

      mockStorage.markRequested.mockImplementation(async () => {
        callOrder.push('markRequested')
        return 0
      })

      mockStorage.store.mockImplementation(async () => {
        callOrder.push('store')
      })

      mockStorage.markAsSent!.mockImplementation(async () => {
        callOrder.push('markAsSent')
      })

      await totemOTP.request(target)

      expect(callOrder).toEqual(['markRequested', 'store', 'markAsSent'])
    })

    it('should handle storage operations that take time', async () => {
      const target: IOTPTarget = {
        type: 'email',
        value: 'test@example.com'
      }

      // Simulate slow storage operations
      mockStorage.store.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      mockDeliveryAgent.sendMessageToAudience.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return 'receipt-slow'
      })

      const startTime = Date.now()
      const result = await totemOTP.request(target)
      const endTime = Date.now()

      expect(result).toBeDefined()
      expect(endTime - startTime).toBeGreaterThan(10) // Should take at least 10ms
    })
  })
})

