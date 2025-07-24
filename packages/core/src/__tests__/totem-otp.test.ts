import type {
  IDeliveryAgent,
  IMatchableConfigurationSchema,
  IOTPStorage,
  IOTPTarget,
  IOTPValue,
  ITotemOTPConfiguration,
  IMatchableConfigurationDeliveryAgent,
  IValidationReceiptGenerator,
  IValidationReceipt
} from '../interfaces'
import { TotemOTP } from '../totem-otp'
import {
  NoDeliveryAgentMatchedConfigError,
  NoSchemaMatchedTargetConfigError,
  OTPMismatchedError,
  OTPUsedError,
  ResendBlockedError,
  UnmatchedValidationReceipt,
  ValidationReceiptError
} from '../errors'

describe('TotemOTP', () => {
  let mockStorage: jest.Mocked<IOTPStorage>
  let mockDeliveryAgent: jest.Mocked<IDeliveryAgent>
  let mockValidationReceiptGenerator: jest.Mocked<IValidationReceiptGenerator>
  let mockSchema: IMatchableConfigurationSchema
  let mockDeliveryAgentConfig: IMatchableConfigurationDeliveryAgent
  let configuration: ITotemOTPConfiguration
  let totemOTP: TotemOTP

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
    jest.clearAllMocks()

    // Mock storage with new API
    mockStorage = {
      markRequested: jest.fn().mockResolvedValue(0), // 0 means not blocked
      unmarkRequested: jest.fn().mockResolvedValue(undefined),
      store: jest.fn().mockResolvedValue(undefined),
      fetchAndUsed: jest.fn().mockResolvedValue(null),
      markAsSent: jest.fn().mockResolvedValue(undefined)
    }

    // Mock delivery agent
    mockDeliveryAgent = {
      sendMessageToAudience: jest.fn().mockResolvedValue('receipt-123')
    }

    // Mock validation receipt generator
    mockValidationReceiptGenerator = {
      createValidationReceipt: jest.fn().mockResolvedValue('receipt-token-123'),
      validateReceipt: jest.fn().mockResolvedValue({
        target: mockTarget,
        purpose: ['login', 'reset-password'],
        expiresAtMs: Date.now() + 600000 // 10 minutes from now
      })
    }

    // Mock schema
    mockSchema = {
      match: jest.fn().mockReturnValue(true),
      otp: {
        charset: ['0123456789'],
        length: 6
      },
      reference: {
        charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'],
        length: 8
      },
      aging: {
        successValidateCount: 1,
        purgeFromDbIn: 1800000, // 30 minutes
        canResendIn: 120000, // 2 minutes
        expiresIn: 300000 // 5 minutes
      }
    }

    // Mock delivery agent configuration
    mockDeliveryAgentConfig = {
      match: jest.fn().mockReturnValue(true),
      agent: jest.fn().mockReturnValue(mockDeliveryAgent)
    }

    // Configuration
    configuration = {
      storage: jest.fn().mockReturnValue(mockStorage),
      schemas: [mockSchema],
      deliveryAgents: [mockDeliveryAgentConfig]
    }

    totemOTP = new TotemOTP(configuration)
  })

  describe('constructor', () => {
    it('should create TotemOTP instance with configuration', () => {
      expect(totemOTP).toBeInstanceOf(TotemOTP)
      expect(totemOTP.configuration).toBe(configuration)
    })
  })

  describe('request', () => {
    describe('success cases', () => {
      it('should successfully request OTP', async () => {
        const result = await totemOTP.request(mockTarget)

        expect(result).toEqual(
          expect.objectContaining({
            target: mockTarget,
            value: expect.stringMatching(/^[0-9]{6}$/),
            reference: expect.stringMatching(/^[A-Z0-9]{8}$/),
            expiresAtMs: expect.any(Number),
            resendAllowedAtMs: expect.any(Number)
          })
        )

        // Check recipient validation was called
        expect(mockStorage.markRequested).toHaveBeenCalledWith(
          'email|test@example.com',
          120000 // canResendIn
        )

        // Check storage was called
        expect(mockStorage.store).toHaveBeenCalledWith(
          expect.objectContaining({
            target: mockTarget,
            value: expect.stringMatching(/^[0-9]{6}$/),
            reference: expect.stringMatching(/^[A-Z0-9]{8}$/),
            expiresAtMs: expect.any(Number),
            resendAllowedAtMs: expect.any(Number)
          }),
          expect.any(Number) // deletableAt
        )

        // Check delivery agent was called
        expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalledWith(
          expect.objectContaining({
            target: mockTarget,
            value: expect.stringMatching(/^[0-9]{6}$/),
            reference: expect.stringMatching(/^[A-Z0-9]{8}$/),
            expiresAtMs: expect.any(Number),
            resendAllowedAtMs: expect.any(Number)
          })
        )

        // Check markAsSent was called
        expect(mockStorage.markAsSent).toHaveBeenCalledWith(
          expect.stringMatching(/^[A-Z0-9]{8}$/),
          expect.stringMatching(/^[0-9]{6}$/),
          'receipt-123'
        )
      })

      it('should use unique identifier for recipient key when provided', async () => {
        const targetWithId = {
          ...mockTarget,
          uniqueIdentifier: 'custom-id-123'
        }

        await totemOTP.request(targetWithId)

        expect(mockStorage.markRequested).toHaveBeenCalledWith('custom-id-123', 120000)
      })

      it('should not call markAsSent if storage does not implement it', async () => {
        delete mockStorage.markAsSent

        const result = await totemOTP.request(mockTarget)

        expect(result).toBeDefined()
        expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalled()
        // Should not throw error even without markAsSent
      })
    })

    describe('error cases', () => {
      // Note: This test case is no longer applicable since the new API doesn't support parent references

      it('should throw ResendBlockedError when recipient is blocked', async () => {
        mockStorage.markRequested.mockResolvedValue(60000) // 1 minute remaining

        await expect(totemOTP.request(mockTarget)).rejects.toThrow(ResendBlockedError)

        expect(mockStorage.markRequested).toHaveBeenCalledWith('email|test@example.com', 120000)
      })

      it('should throw NoSchemaMatchedTargetConfigError when no schema matches', async () => {
        mockSchema.match = jest.fn().mockReturnValue(false)

        await expect(totemOTP.request(mockTarget)).rejects.toThrow(NoSchemaMatchedTargetConfigError)

        expect(mockSchema.match).toHaveBeenCalledWith(mockTarget)
      })

      it('should throw NoDeliveryAgentMatchedConfigError when no delivery agent matches', async () => {
        mockDeliveryAgentConfig.match = jest.fn().mockReturnValue(false)

        await expect(totemOTP.request(mockTarget)).rejects.toThrow(
          NoDeliveryAgentMatchedConfigError
        )

        expect(mockDeliveryAgentConfig.match).toHaveBeenCalledWith(mockTarget)
      })

      it('should handle delivery agent failure and unmark recipient', async () => {
        mockDeliveryAgent.sendMessageToAudience.mockRejectedValue(new Error('Delivery failed'))

        await expect(totemOTP.request(mockTarget)).rejects.toThrow('Delivery failed')

        expect(mockStorage.store).toHaveBeenCalled()
        expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalled()
        expect(mockStorage.unmarkRequested).toHaveBeenCalledWith('email|test@example.com')
      })

      it('should handle storage failure and unmark recipient', async () => {
        mockStorage.store.mockRejectedValue(new Error('Storage failed'))

        await expect(totemOTP.request(mockTarget)).rejects.toThrow('Storage failed')

        expect(mockStorage.store).toHaveBeenCalled()
        expect(mockStorage.unmarkRequested).toHaveBeenCalledWith('email|test@example.com')
      })
    })
  })

  describe('validate', () => {
    describe('success cases', () => {
      it('should successfully validate OTP', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 1 // After validation, used count is 1
        }

        mockStorage.fetchAndUsed.mockResolvedValue(mockStoredOTP)

        const result = await totemOTP.validate('REF123', '123456')

        expect(result).toBe(1)
        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '123456')
      })

      it('should handle multiple validation attempts within limit', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 2 // Second validation
        }

        mockStorage.fetchAndUsed.mockResolvedValue(mockStoredOTP)
        mockSchema.aging.successValidateCount = 3

        const result = await totemOTP.validate('REF123', '123456')

        expect(result).toBe(2)
        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '123456')
      })
    })

    describe('error cases', () => {
      it('should throw OTPMismatchedError when reference/value does not exist', async () => {
        mockStorage.fetchAndUsed.mockResolvedValue(null)

        await expect(totemOTP.validate('INVALID_REF', '123456')).rejects.toThrow(OTPMismatchedError)

        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('INVALID_REF', '123456')
      })

      it('should throw OTPMismatchedError when OTP value does not match', async () => {
        // fetchAndUsed would return null for wrong combination of reference and value
        mockStorage.fetchAndUsed.mockResolvedValue(null)

        await expect(totemOTP.validate('REF123', '654321')).rejects.toThrow(OTPMismatchedError)

        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '654321')
      })

      it('should throw OTPUsedError when OTP has been used too many times', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 2 // Exceeds successValidateCount of 1
        }

        mockStorage.fetchAndUsed.mockResolvedValue(mockStoredOTP)
        mockSchema.aging.successValidateCount = 1

        await expect(totemOTP.validate('REF123', '123456')).rejects.toThrow(OTPUsedError)

        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '123456')
      })

      it('should handle storage fetchAndUsed failure', async () => {
        mockStorage.fetchAndUsed.mockRejectedValue(new Error('Storage fetchAndUsed failed'))

        await expect(totemOTP.validate('REF123', '123456')).rejects.toThrow(
          'Storage fetchAndUsed failed'
        )

        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '123456')
      })

      // Note: In the new API, marking as used is handled by fetchAndUsed internally
      // so there's no separate markAsUsed failure to test
    })
  })

  describe('private methods', () => {
    describe('matchSchema', () => {
      it('should return first schema when no match function is provided', async () => {
        delete mockSchema.match

        const result = await totemOTP.request(mockTarget)

        expect(result).toBeDefined()
        expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalled()
      })

      it('should return matching schema when multiple schemas exist', async () => {
        const schema1 = {
          ...mockSchema,
          match: jest.fn().mockReturnValue(false)
        }
        const schema2 = {
          ...mockSchema,
          match: jest.fn().mockReturnValue(true)
        }

        configuration.schemas = [schema1, schema2]
        totemOTP = new TotemOTP(configuration)

        const result = await totemOTP.request(mockTarget)

        expect(result).toBeDefined()
        expect(schema1.match).toHaveBeenCalledWith(mockTarget)
        expect(schema2.match).toHaveBeenCalledWith(mockTarget)
      })
    })

    describe('matchDeliveryAgent', () => {
      it('should return first delivery agent when no match function is provided', async () => {
        delete mockDeliveryAgentConfig.match

        const result = await totemOTP.request(mockTarget)

        expect(result).toBeDefined()
        expect(mockDeliveryAgentConfig.agent).toHaveBeenCalled()
      })

      it('should return matching delivery agent when multiple agents exist', async () => {
        const agent1 = {
          ...mockDeliveryAgentConfig,
          match: jest.fn().mockReturnValue(false)
        }
        const agent2 = {
          ...mockDeliveryAgentConfig,
          match: jest.fn().mockReturnValue(true)
        }

        configuration.deliveryAgents = [agent1, agent2]
        totemOTP = new TotemOTP(configuration)

        const result = await totemOTP.request(mockTarget)

        expect(result).toBeDefined()
        expect(agent1.match).toHaveBeenCalledWith(mockTarget)
        expect(agent2.match).toHaveBeenCalledWith(mockTarget)
      })
    })
  })

  describe('edge cases', () => {
    it('should handle concurrent requests when not blocked', async () => {
      // All requests should succeed since markRequested returns 0 (not blocked)
      const requests = Array(5)
        .fill(null)
        .map(() => totemOTP.request(mockTarget))

      const results = await Promise.all(requests)

      expect(results).toHaveLength(5)
      results.forEach((result) => {
        expect(result).toEqual(
          expect.objectContaining({
            target: mockTarget,
            value: expect.stringMatching(/^[0-9]{6}$/),
            reference: expect.stringMatching(/^[A-Z0-9]{8}$/),
            expiresAtMs: expect.any(Number),
            resendAllowedAtMs: expect.any(Number)
          })
        )
      })

      expect(mockStorage.markRequested).toHaveBeenCalledTimes(5)
      expect(mockStorage.store).toHaveBeenCalledTimes(5)
      expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalledTimes(5)
    })

    it('should handle storage lazy initialization', async () => {
      let storageCallCount = 0
      const lazyConfiguration = {
        ...configuration,
        storage: jest.fn(() => {
          storageCallCount++
          return mockStorage
        })
      }

      const lazyTotemOTP = new TotemOTP(lazyConfiguration)

      await lazyTotemOTP.request(mockTarget)
      await lazyTotemOTP.request(mockTarget)

      expect(storageCallCount).toBe(1) // Storage should be cached
      expect(lazyConfiguration.storage).toHaveBeenCalledTimes(1)
    })
  })

  describe('validate with ValidationReceipt (overloaded method)', () => {
    beforeEach(() => {
      // Add validation receipt generator to configuration
      configuration.validationReceipt = jest.fn().mockReturnValue(mockValidationReceiptGenerator)
      totemOTP = new TotemOTP(configuration)
    })

    describe('success cases', () => {
      it('should successfully validate OTP and create validation receipt', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 1
        }

        mockStorage.fetchAndUsed.mockResolvedValue(mockStoredOTP)

        const result = await totemOTP.validate('REF123', '123456', ['login'])

        expect(result).toBe('receipt-token-123')
        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '123456')
        expect(mockValidationReceiptGenerator.createValidationReceipt).toHaveBeenCalledWith(
          mockStoredOTP,
          ['login']
        )
      })

      it('should handle multiple purposes in validation receipt', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 1
        }

        mockStorage.fetchAndUsed.mockResolvedValue(mockStoredOTP)

        const result = await totemOTP.validate('REF123', '123456', [
          'login',
          'reset-password',
          'transfer'
        ])

        expect(result).toBe('receipt-token-123')
        expect(mockValidationReceiptGenerator.createValidationReceipt).toHaveBeenCalledWith(
          mockStoredOTP,
          ['login', 'reset-password', 'transfer']
        )
      })
    })

    describe('error cases', () => {
      it('should throw UnmatchedValidationReceipt when no validation receipt generator is configured', async () => {
        // Remove validation receipt from configuration
        delete configuration.validationReceipt
        totemOTP = new TotemOTP(configuration)

        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 1
        }

        mockStorage.fetchAndUsed.mockResolvedValue(mockStoredOTP)

        await expect(totemOTP.validate('REF123', '123456', ['login'])).rejects.toThrow(
          UnmatchedValidationReceipt
        )

        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '123456')
      })

      it('should still throw OTPMismatchedError when OTP is invalid (with purpose)', async () => {
        mockStorage.fetchAndUsed.mockResolvedValue(null)

        await expect(totemOTP.validate('INVALID_REF', '123456', ['login'])).rejects.toThrow(
          OTPMismatchedError
        )

        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('INVALID_REF', '123456')
        expect(mockValidationReceiptGenerator.createValidationReceipt).not.toHaveBeenCalled()
      })

      it('should still throw OTPUsedError when OTP is used too many times (with purpose)', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 2 // Exceeds successValidateCount of 1
        }

        mockStorage.fetchAndUsed.mockResolvedValue(mockStoredOTP)
        mockSchema.aging.successValidateCount = 1

        await expect(totemOTP.validate('REF123', '123456', ['login'])).rejects.toThrow(OTPUsedError)

        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '123456')
        expect(mockValidationReceiptGenerator.createValidationReceipt).not.toHaveBeenCalled()
      })

      it('should handle validation receipt generator failure', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 1
        }

        mockStorage.fetchAndUsed.mockResolvedValue(mockStoredOTP)
        mockValidationReceiptGenerator.createValidationReceipt.mockRejectedValue(
          new Error('Receipt generation failed')
        )

        await expect(totemOTP.validate('REF123', '123456', ['login'])).rejects.toThrow(
          'Receipt generation failed'
        )

        expect(mockStorage.fetchAndUsed).toHaveBeenCalledWith('REF123', '123456')
        expect(mockValidationReceiptGenerator.createValidationReceipt).toHaveBeenCalledWith(
          mockStoredOTP,
          ['login']
        )
      })
    })
  })

  describe('validateReceipt', () => {
    beforeEach(() => {
      // Add validation receipt generator to configuration
      configuration.validationReceipt = jest.fn().mockReturnValue(mockValidationReceiptGenerator)
      totemOTP = new TotemOTP(configuration)
    })

    describe('success cases', () => {
      it('should successfully validate receipt with matching purpose', async () => {
        const mockReceipt: IValidationReceipt = {
          target: mockTarget,
          purpose: ['login'],
          expiresAtMs: Date.now() + 600000 // 10 minutes from now
        }

        mockValidationReceiptGenerator.validateReceipt.mockResolvedValue(mockReceipt)

        const result = await totemOTP.validateReceipt('REF123', 'receipt-token-123', 'login')

        expect(result).toEqual(mockReceipt)
        expect(mockValidationReceiptGenerator.validateReceipt).toHaveBeenCalledWith(
          'REF123',
          'receipt-token-123'
        )
      })

      it('should validate receipt with multiple purposes when one matches', async () => {
        const mockReceipt: IValidationReceipt = {
          target: mockTarget,
          purpose: ['login', 'reset-password', 'transfer'],
          expiresAtMs: Date.now() + 600000
        }

        mockValidationReceiptGenerator.validateReceipt.mockResolvedValue(mockReceipt)

        const result = await totemOTP.validateReceipt(
          'REF123',
          'receipt-token-123',
          'reset-password'
        )

        expect(result).toEqual(mockReceipt)
        expect(mockValidationReceiptGenerator.validateReceipt).toHaveBeenCalledWith(
          'REF123',
          'receipt-token-123'
        )
      })
    })

    describe('error cases', () => {
      it('should throw UnmatchedValidationReceipt when no validation receipt generator is configured', async () => {
        // Remove validation receipt from configuration
        delete configuration.validationReceipt
        totemOTP = new TotemOTP(configuration)

        await expect(
          totemOTP.validateReceipt('REF123', 'receipt-token-123', 'login')
        ).rejects.toThrow(UnmatchedValidationReceipt)
      })

      it('should throw ValidationReceiptError when receipt has expired', async () => {
        const expiredReceipt: IValidationReceipt = {
          target: mockTarget,
          purpose: ['login'],
          expiresAtMs: Date.now() - 1000 // 1 second ago (expired)
        }

        mockValidationReceiptGenerator.validateReceipt.mockResolvedValue(expiredReceipt)

        await expect(
          totemOTP.validateReceipt('REF123', 'receipt-token-123', 'login')
        ).rejects.toThrow(new ValidationReceiptError('Receipt has expired'))

        expect(mockValidationReceiptGenerator.validateReceipt).toHaveBeenCalledWith(
          'REF123',
          'receipt-token-123'
        )
      })

      it('should throw ValidationReceiptError when purpose does not match', async () => {
        const mockReceipt: IValidationReceipt = {
          target: mockTarget,
          purpose: ['login'],
          expiresAtMs: Date.now() + 600000
        }

        mockValidationReceiptGenerator.validateReceipt.mockResolvedValue(mockReceipt)

        await expect(
          totemOTP.validateReceipt('REF123', 'receipt-token-123', 'transfer')
        ).rejects.toThrow(new ValidationReceiptError('Receipt does not include purpose: transfer'))

        expect(mockValidationReceiptGenerator.validateReceipt).toHaveBeenCalledWith(
          'REF123',
          'receipt-token-123'
        )
      })

      it('should wrap generator errors in ValidationReceiptError', async () => {
        mockValidationReceiptGenerator.validateReceipt.mockRejectedValue(
          new Error('Invalid receipt format')
        )

        await expect(
          totemOTP.validateReceipt('REF123', 'invalid-receipt', 'login')
        ).rejects.toThrow(new ValidationReceiptError('Invalid receipt format'))

        expect(mockValidationReceiptGenerator.validateReceipt).toHaveBeenCalledWith(
          'REF123',
          'invalid-receipt'
        )
      })

      it('should preserve ValidationReceiptError when generator throws it', async () => {
        const originalError = new ValidationReceiptError('Custom validation error')
        mockValidationReceiptGenerator.validateReceipt.mockRejectedValue(originalError)

        await expect(
          totemOTP.validateReceipt('REF123', 'invalid-receipt', 'login')
        ).rejects.toThrow(originalError)

        expect(mockValidationReceiptGenerator.validateReceipt).toHaveBeenCalledWith(
          'REF123',
          'invalid-receipt'
        )
      })

      it('should handle non-Error objects from generator', async () => {
        mockValidationReceiptGenerator.validateReceipt.mockRejectedValue('String error')

        await expect(
          totemOTP.validateReceipt('REF123', 'invalid-receipt', 'login')
        ).rejects.toThrow(new ValidationReceiptError('Invalid receipt'))

        expect(mockValidationReceiptGenerator.validateReceipt).toHaveBeenCalledWith(
          'REF123',
          'invalid-receipt'
        )
      })
    })

    describe('edge cases', () => {
      it('should handle receipt with exactly matching expiration time', async () => {
        const nowMs = Date.now()
        const mockReceipt: IValidationReceipt = {
          target: mockTarget,
          purpose: ['login'],
          expiresAtMs: nowMs // Expires exactly at current time
        }

        jest.spyOn(Date, 'now').mockReturnValue(nowMs)
        mockValidationReceiptGenerator.validateReceipt.mockResolvedValue(mockReceipt)

        await expect(
          totemOTP.validateReceipt('REF123', 'receipt-token-123', 'login')
        ).rejects.toThrow(new ValidationReceiptError('Receipt has expired'))

        jest.restoreAllMocks()
      })

      it('should be case sensitive when matching purpose', async () => {
        const mockReceipt: IValidationReceipt = {
          target: mockTarget,
          purpose: ['Login'], // Capital L
          expiresAtMs: Date.now() + 600000
        }

        mockValidationReceiptGenerator.validateReceipt.mockResolvedValue(mockReceipt)

        await expect(
          totemOTP.validateReceipt('REF123', 'receipt-token-123', 'login') // lowercase l
        ).rejects.toThrow(new ValidationReceiptError('Receipt does not include purpose: login'))
      })
    })
  })
})
