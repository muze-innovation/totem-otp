import type {
  IDeliveryAgent,
  IMatchableConfigurationSchema,
  IOTPStorage,
  IOTPTarget,
  IOTPValue,
  ITotemOTP,
  ITotemOTPConfiguration
} from './interfaces'
import {
  NoDeliveryAgentMatchedConfigError,
  NoSchemaMatchedTargetConfigError,
  OTPMismatchedError,
  OTPUsedError,
  ResendBlockedError
} from './errors'
import { generateOTPAndReference } from './utils/generator'

export class TotemOTP implements ITotemOTP {
  public constructor(public readonly configuration: ITotemOTPConfiguration) {}

  private _storage?: IOTPStorage

  private get storageImpl(): IOTPStorage {
    if (!this._storage) {
      this._storage = this.configuration.storage()
    }
    return this._storage!
  }

  public async request(target: IOTPTarget): Promise<IOTPValue> {
    // validate schema
    const schema = this.matchSchema(target)
    // Validate agent
    const agent = this.matchDeliveryAgent(target)

    const nowEpoch = new Date().getTime()
    const generated = generateOTPAndReference(schema.otp, schema.reference)
    const otpVal: IOTPValue = {
      expiresAtMs: nowEpoch + schema.aging.expiresIn,
      resendAllowedAtMs: nowEpoch + schema.aging.canResendIn,
      reference: generated.reference,
      value: generated.otp,
      target
    }

    // If parent reference is requested. Recheck existing ones.
    await this.validateReceipient(target, schema.aging)

    try {
      // save it.
      await this.storageImpl.store(otpVal, nowEpoch + schema.aging.purgeFromDbIn)
      // send it.
      const receiptId = await agent.sendMessageToAudience(otpVal)
      if (this.storageImpl.markAsSent) {
        await this.storageImpl.markAsSent(generated.reference, generated.otp, receiptId)
      }
    } catch (e) {
      await this.invalidateReceipient(target)
      throw e
    }

    return otpVal
  }

  public async validate(reference: string, otpValue: string): Promise<number> {
    const otpFromDb = await this.storageImpl.fetchAndUsed(reference, otpValue)
    if (otpFromDb === null) {
      throw new OTPMismatchedError()
    }
    const successValidateCount = this.matchSchema(otpFromDb.target).aging.successValidateCount
    const used = otpFromDb.used
    if (used > successValidateCount) {
      throw new OTPUsedError(used)
    }
    return used
  }

  // ---------------------------- PRIVATE METHODs ----------------------------- //

  /**
   * Validate if receipient if target is allowed to be called. Block if valid.
   *
   * @throws ResendBlockedError if such receipient is being blocked
   */
  private async validateReceipient(
    target: IOTPTarget,
    aging: IMatchableConfigurationSchema['aging']
  ): Promise<void> {
    const ttls = await this.storageImpl.markRequested(
      this.toReceipientKey(target),
      aging.canResendIn
    )
    if (ttls === 0) {
      return
    }
    throw new ResendBlockedError(ttls)
  }

  private async invalidateReceipient(target: IOTPTarget): Promise<void> {
    // Release the receipient blocked earlier
    return this.storageImpl.unmarkRequested(this.toReceipientKey(target))
  }

  private toReceipientKey(target: IOTPTarget): string {
    return target.uniqueIdentifier || `${target.type}|${target.value}`
  }

  private matchSchema(target: IOTPTarget): IMatchableConfigurationSchema {
    const schemas = this.configuration.schemas
    for (let i = 0; i < schemas.length; i++) {
      if (!schemas[i].match || schemas[i].match(target)) {
        return schemas[i]
      }
    }
    throw new NoSchemaMatchedTargetConfigError()
  }

  private matchDeliveryAgent(target: IOTPTarget): IDeliveryAgent {
    const agents = this.configuration.deliveryAgents
    for (let i = 0; i < agents.length; i++) {
      if (!agents[i].match || agents[i].match(target)) {
        return agents[i].agent()
      }
    }
    throw new NoDeliveryAgentMatchedConfigError()
  }
}
