import type {
  IDeliveryAgent,
  IMatchableConfigurationSchema,
  IOTPStorage,
  IOTPTarget,
  IOTPValue,
  ITotemOTPConfiguration,
  IMatchableConfigurationDeliveryAgent
} from '../interfaces'
import { TotemOTP } from '../totem-otp'
import {
  NoDeliveryAgentMatchedConfigError,
  NoSchemaMatchedTargetConfigError,
  OTPMismatchedError,
  OTPUsedError,
  ResendBlockedError,
  UnknownReferenceError
} from '../errors'

describe('TotemOTP', () => {
  let mockStorage: jest.Mocked<IOTPStorage>
  let mockDeliveryAgent: jest.Mocked<IDeliveryAgent>
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

    // Mock storage
    mockStorage = {
      store: jest.fn().mockResolvedValue(undefined),
      fetch: jest.fn().mockResolvedValue(null),
      markAsSent: jest.fn().mockResolvedValue(undefined),
      markAsUsed: jest.fn().mockResolvedValue(1)
    }

    // Mock delivery agent
    mockDeliveryAgent = {
      sendMessageToAudience: jest.fn().mockResolvedValue('receipt-123')
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
      it('should successfully request OTP without parent reference', async () => {
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

        expect(mockStorage.store).toHaveBeenCalledWith(
          expect.objectContaining({
            target: mockTarget,
            value: expect.stringMatching(/^[0-9]{6}$/),
            reference: expect.stringMatching(/^[A-Z0-9]{8}$/),
            expiresAtMs: expect.any(Number),
            resendAllowedAtMs: expect.any(Number)
          }),
          null,
          expect.any(Number)
        )

        expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalledWith(
          expect.objectContaining({
            target: mockTarget,
            value: expect.stringMatching(/^[0-9]{6}$/),
            reference: expect.stringMatching(/^[A-Z0-9]{8}$/),
            expiresAtMs: expect.any(Number),
            resendAllowedAtMs: expect.any(Number)
          })
        )

        expect(mockStorage.markAsSent).toHaveBeenCalledWith(
          expect.stringMatching(/^[A-Z0-9]{8}$/),
          'receipt-123'
        )
      })

      it('should successfully request OTP with valid parent reference', async () => {
        const pastTime = Date.now() - 120000 // 2 minutes ago
        const mockParentOTP = {
          ...mockOTPValue,
          resendAllowedAtMs: pastTime
        }

        mockStorage.fetch.mockResolvedValue({
          ...mockParentOTP,
          receiptId: 'receipt-456',
          used: 0
        })

        const result = await totemOTP.request(mockTarget, 'PARENT123')

        expect(result).toEqual(
          expect.objectContaining({
            target: mockTarget,
            value: expect.stringMatching(/^[0-9]{6}$/),
            reference: expect.stringMatching(/^[A-Z0-9]{8}$/),
            expiresAtMs: expect.any(Number),
            resendAllowedAtMs: expect.any(Number)
          })
        )

        expect(mockStorage.fetch).toHaveBeenCalledWith('PARENT123')
        expect(mockStorage.store).toHaveBeenCalledWith(
          expect.any(Object),
          'PARENT123',
          expect.any(Number)
        )
      })

      it('should not call markAsSent if storage does not implement it', async () => {
        mockStorage.markAsSent = undefined

        const result = await totemOTP.request(mockTarget)

        expect(result).toBeDefined()
        expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalled()
        // Should not throw error even without markAsSent
      })
    })

    describe('error cases', () => {
      it('should throw UnknownReferenceError when parent reference does not exist', async () => {
        mockStorage.fetch.mockResolvedValue(null)

        await expect(totemOTP.request(mockTarget, 'INVALID_REF')).rejects.toThrow(
          UnknownReferenceError
        )

        expect(mockStorage.fetch).toHaveBeenCalledWith('INVALID_REF')
      })

      it('should throw ResendBlockedError when resend is not allowed yet', async () => {
        const futureTime = Date.now() + 60000 // 1 minute in future
        const mockParentOTP = {
          ...mockOTPValue,
          resendAllowedAtMs: futureTime
        }

        mockStorage.fetch.mockResolvedValue({
          ...mockParentOTP,
          receiptId: 'receipt-456',
          used: 0
        })

        await expect(totemOTP.request(mockTarget, 'PARENT123')).rejects.toThrow(ResendBlockedError)

        expect(mockStorage.fetch).toHaveBeenCalledWith('PARENT123')
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

      it('should handle delivery agent failure', async () => {
        mockDeliveryAgent.sendMessageToAudience.mockRejectedValue(new Error('Delivery failed'))

        await expect(totemOTP.request(mockTarget)).rejects.toThrow('Delivery failed')

        expect(mockStorage.store).toHaveBeenCalled()
        expect(mockDeliveryAgent.sendMessageToAudience).toHaveBeenCalled()
      })

      it('should handle storage failure', async () => {
        mockStorage.store.mockRejectedValue(new Error('Storage failed'))

        await expect(totemOTP.request(mockTarget)).rejects.toThrow('Storage failed')

        expect(mockStorage.store).toHaveBeenCalled()
      })
    })
  })

  describe('validate', () => {
    describe('success cases', () => {
      it('should successfully validate OTP', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 0
        }

        mockStorage.fetch.mockResolvedValue(mockStoredOTP)
        mockStorage.markAsUsed.mockResolvedValue(1)

        const result = await totemOTP.validate('REF123', '123456')

        expect(result).toBe(1)
        expect(mockStorage.fetch).toHaveBeenCalledWith('REF123')
        expect(mockStorage.markAsUsed).toHaveBeenCalledWith('REF123')
      })

      it('should handle multiple validation attempts within limit', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 0
        }

        mockStorage.fetch.mockResolvedValue(mockStoredOTP)
        mockStorage.markAsUsed.mockResolvedValue(1)
        mockSchema.aging.successValidateCount = 3

        const result = await totemOTP.validate('REF123', '123456')

        expect(result).toBe(1)
        expect(mockStorage.markAsUsed).toHaveBeenCalledWith('REF123')
      })
    })

    describe('error cases', () => {
      it('should throw UnknownReferenceError when reference does not exist', async () => {
        mockStorage.fetch.mockResolvedValue(null)

        await expect(totemOTP.validate('INVALID_REF', '123456')).rejects.toThrow(
          UnknownReferenceError
        )

        expect(mockStorage.fetch).toHaveBeenCalledWith('INVALID_REF')
      })

      it('should throw OTPMismatchedError when OTP value does not match', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 0
        }

        mockStorage.fetch.mockResolvedValue(mockStoredOTP)

        await expect(totemOTP.validate('REF123', '654321')).rejects.toThrow(OTPMismatchedError)

        expect(mockStorage.fetch).toHaveBeenCalledWith('REF123')
      })

      it('should throw OTPUsedError when OTP has been used too many times', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 0
        }

        mockStorage.fetch.mockResolvedValue(mockStoredOTP)
        mockStorage.markAsUsed.mockResolvedValue(2)
        mockSchema.aging.successValidateCount = 1

        await expect(totemOTP.validate('REF123', '123456')).rejects.toThrow(OTPUsedError)

        expect(mockStorage.markAsUsed).toHaveBeenCalledWith('REF123')
      })

      it('should handle storage fetch failure', async () => {
        mockStorage.fetch.mockRejectedValue(new Error('Storage fetch failed'))

        await expect(totemOTP.validate('REF123', '123456')).rejects.toThrow('Storage fetch failed')

        expect(mockStorage.fetch).toHaveBeenCalledWith('REF123')
      })

      it('should handle storage markAsUsed failure', async () => {
        const mockStoredOTP = {
          ...mockOTPValue,
          receiptId: 'receipt-123',
          used: 0
        }

        mockStorage.fetch.mockResolvedValue(mockStoredOTP)
        mockStorage.markAsUsed.mockRejectedValue(new Error('Mark as used failed'))

        await expect(totemOTP.validate('REF123', '123456')).rejects.toThrow('Mark as used failed')

        expect(mockStorage.markAsUsed).toHaveBeenCalledWith('REF123')
      })
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
    it('should handle concurrent requests', async () => {
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
})

