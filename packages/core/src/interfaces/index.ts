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
   * Milliseconds until OTP is expired.
   */
  expiresInMs: number
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
   * Save the provided OTP value before the OTP is to be sent.
   *
   * @param otp - the OTP Value
   * @param parentReference - the optional reference to parent OTP record
   */
  store(otp: IOTPValue, parentReference?: string): Promise<void>

  /**
   * Retrieve the provided OTP from the Reference.
   *
   * @param otpReferene the OTP reference used when `store` was called.
   * @return The OTP value recently stored in the Storage with its additional optional field (receiptId, used).
   */
  fetch(otpReference: string): Promise<IOTPValue & { receiptId?: string; used: number }>

  /**
   * Set the given OTP that is has been sent.
   *
   * Mark that the OTP has been sent
   * @param otpReferene the OTP reference used when `store` was called.
   * @param receiptId the delivery receipt id.
   */
  markAsSent?(otpReference: string, receiptId: string): Promise<void>

  /**
   * Mark the given OTP that it has been used.
   *
   * @param otpReferene the OTP reference used when `store` was called.
   * @return Number of time it has been marked as used.
   */
  markAsUsed(otpReference: string): Promise<number>
}

/**
 * The Public Interface for consume to consume
 */
export interface ITotemOTP {
  /**
   * Use this method when user would like to request an OTP.
   *
   * @param target the delivery target.
   * @param parentReference in case of re-send OTP we can provide this field to create the reference.
   * @return IOTPValue that has been delivered.
   * @throws ResendBlockedError - when requested target is still blocked by OTP's schema.
   * @throws DeliveryFailedError - when the OTP Failed to be delivered by DeliveryAgent.
   * @throws NoSchemaMatchedTargetConfigError - no Schema matched
   * @throws NoDeliveryAgentMatchedConfigError - no Delivery Agent matched
   */
  request(target: IOTPTarget, parentReference: string): Promise<IOTPValue>

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
