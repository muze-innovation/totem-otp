export type OTPTargetType = 'msisdn' | 'email'

/**
 * Deliverable Target
 */
export interface IOTPTarget {
  /**
   * Type of the deliverable target
   */
  type: OTPTargetType
  /**
   * the well formatted value.
   *
   * - msisdn must be e164 format.
   * - email must be an email format.
   */
  value: string
  /**
   * Unique Identifier of the deliverable target
   * if none provide it will resolved by creating the unique target with `${type}|${value}`.
   */
  uniqueIdentifier?: string
}

/**
 * OTP Value
 */
export interface IOTPValue {
  /**
   * Delivered to
   */
  target: IOTPTarget
  /**
   * Value of the OTP to validate
   */
  value: string
  /**
   * Reference generated for validation
   */
  reference: string
  /**
   * Epoch Milliseconds that marks this OTP has been expired
   */
  expiresAtMs: number
  /**
   * Epoch Milliseconds that will allowed the resend
   */
  resendAllowedAtMs: number
}

/**
 * The message delivery service
 */
export interface IDeliveryAgent {
  /**
   * Calling this when framework has computed the OTP value
   * @param otp the value & target of the OTP to deliver to.
   * @returns receipt_id of the delivery
   */
  sendMessageToAudience(otp: IOTPValue): Promise<string>
}

/**
 * The OTP persistant storage
 */
export interface IOTPStorage {
  /**
   * Used when an OTP was requested. We will use this flag to render the
   * target as not yet ready to received another OTP.
   *
   * @param otpReceipientKey - the target unique key represent the unique OTP receipient address.
   * @param blockedForMs - number of Milliseconds if this request went through until this audience will be ready to received the next one.
   * @returns number - 0 if this receipient key is open for receiving. Otherwise returns TTL until banned will be lifted.
   */
  markRequested(otpReceipientKey: string, blockedForMs: number): Promise<number>

  /**
   * Use this for rollback to banned imposed earlier.
   *
   * @param otpReceipientKey the key of receipient to be lifted.
   */
  unmarkRequested(otpReceipientKey: string): Promise<void>

  /**
   * Save the provided OTP value before the OTP is to be sent.
   *
   * @param otp - the OTP Value
   * @param deletableAt - the field indicate when this OTP is free to delete from Database.
   */
  store(otp: IOTPValue, deletableAt: number): Promise<void>

  /**
   * Retrieve the provided OTP from the Reference. Whenever system retrieved
   * the OTP Value from store this means it has been used.
   *
   * @param otpReferene the OTP reference used when `store` was called.
   * @param otpValue the OTP Value used as conjunction primary key.
   * @return The OTP value recently stored in the Storage with its additional optional field (receiptId, used).
   */
  fetchAndUsed(
    otpReference: string,
    otpValue: string
  ): Promise<(IOTPValue & { receiptId?: string; used: number }) | null>

  /**
   * Set the given OTP that is has been sent.
   *
   * Mark that the OTP has been sent
   * @param otpReference the OTP reference used when `store` was called.
   * @param otpValue the OTP Value used as conjunction primary key.
   * @param receiptId the delivery receipt id.
   */
  markAsSent?(otpReference: string, otpValue: string, receiptId: string): Promise<void>
}

/**
 * The Public Interface for consume to consume
 */
export interface ITotemOTP {
  /**
   * Use this method when user would like to request an OTP.
   *
   * @param target the delivery target.
   * @return IOTPValue that has been delivered.
   * @throws ResendBlockedError - when requested target is still blocked by OTP's schema.
   * @throws DeliveryFailedError - when the OTP Failed to be delivered by DeliveryAgent.
   * @throws NoSchemaMatchedTargetConfigError - no Schema matched
   * @throws NoDeliveryAgentMatchedConfigError - no Delivery Agent matched
   */
  request(target: IOTPTarget): Promise<IOTPValue>

  /**
   * Use this method when application has otpValue to compare from frontend.
   *
   * Upon success - this OTP record will be marked as used.
   *
   * @param reference the OTP reference sent from frontend.
   * @param otpValue the actual OTP value from frontend.
   * @return positive integer of how many time this OTP has been successfully validated. e.g. return 1 for the first time it is successfully validated.
   * @throws UnknownReferenceError - no OTP belong to this reference.
   * @throws OTPUsedError - the provided OTP has already been used. (Already correctly validated).
   * @throws OTPMismatchedError - the provided OTP mismatched with the given reference.
   */
  validate(reference: string, otpValue: string): Promise<number>
}

export interface IMatchableConfigurationDeliveryAgent {
  match?: (target: IOTPTarget) => boolean
  agent: () => IDeliveryAgent
}

export interface IMatchableConfigurationSchema {
  match?: (target: IOTPTarget) => boolean
  otp: { charset: string[]; length: number }
  reference: { charset: string[]; length: number }
  aging: {
    successValidateCount: number // How many time this OTP can be correctly validated
    purgeFromDbIn: number // will be considered safe to remove from Storage 30 minutes
    canResendIn: number // will allow resend-in 2 minutes
    expiresIn: number // will no longer be usable in 5 minutes
  }
}

/**
 * Configuration for initialize the ITotemOTP instance
 */
export interface ITotemOTPConfiguration {
  /**
   * Storage
   */
  storage: () => IOTPStorage

  /**
   * Schemas
   */
  schemas: IMatchableConfigurationSchema[]

  /**
   * Agents
   */
  deliveryAgents: IMatchableConfigurationDeliveryAgent[]
}
