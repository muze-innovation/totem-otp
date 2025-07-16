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
  ResendBlockedError,
  UnknownReferenceError
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

  public async request(target: IOTPTarget, parentReference?: string): Promise<IOTPValue> {
    const nowEpoch = new Date().getTime()
    // If parent reference is requested. Recheck existing ones.
    if (parentReference) {
      const otpValue = await this.storageImpl.fetch(parentReference)
      if (otpValue === null) {
        throw new UnknownReferenceError()
      }
      if (otpValue.resendAllowedAtMs > nowEpoch) {
        throw new ResendBlockedError()
      }
    }
    // try to call it.
    const schema = this.matchSchema(target)
    const agent = this.matchDeliveryAgent(target)
    const generated = generateOTPAndReference(schema.otp, schema.reference)
    const otpVal: IOTPValue = {
      expiresAtMs: nowEpoch + schema.aging.expiresIn,
      resendAllowedAtMs: nowEpoch + schema.aging.canResendIn,
      reference: generated.reference,
      value: generated.otp,
      target
    }
    // save it.
    await this.storageImpl.store(
      otpVal,
      parentReference || null,
      nowEpoch + schema.aging.purgeFromDbIn
    )
    // send it.
    const receiptId = await agent.sendMessageToAudience(otpVal)
    if (this.storageImpl.markAsSent) {
      await this.storageImpl.markAsSent(generated.reference, receiptId)
    }
    return otpVal
  }

  public async validate(reference: string, otpValue: string): Promise<number> {
    const otpFromDb = await this.storageImpl.fetch(reference)
    if (otpFromDb === null) {
      throw new UnknownReferenceError()
    }
    if (otpFromDb.value !== otpValue) {
      throw new OTPMismatchedError()
    }
    const successValidateCount = this.matchSchema(otpFromDb.target).aging.successValidateCount
    const used = await this.storageImpl.markAsUsed(reference)
    if (used > successValidateCount) {
      throw new OTPUsedError(used)
    }
    return used
  }

  // ---------------------------- PRIVATE METHODs ----------------------------- //

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
