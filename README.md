TotemOTP
==

A JavaScript utility library that provide OTP Generation & Validation as an open framework with configurable interface. Please see [Configuration](#configuration) for more information about what you can configure.

# Feature

- OTP Schema (length, string to use etc).
- Basic OTP Aging policy via Configuration.
- OTP Storage is Configurable. Implement it on your own if you wish.
- OTP Delivery is Configurable. Implement on your own that suit your infra.
- Multiple OTP Schema. Matching email, msisdn can be key options.
- Multiple OTP Delivery Agents. Use different delivery agent for different target.
- No Management UI.

# Stack

The code is implemented using TypeScript. Which can simply be used with any framework.

- Language: TypeScript
- Framework: None
- Node20

# Usage

## Install

```bash
npm install totem-otp
```

## In your code

```javascript
import { TotemOTP } from 'totem-otp'

const totem = new TotemOTP(configuration)

// Register as to your endpoint.
app.post('/my-app/request-for-otp', async function(req, res) {
    const msisdn = req.query['msisdn']
    const otp = await totem.request({
        "type": "msisdn",
        "value": msisdn,
        "uniqueIdentifier": msisdn, // optional, will be used to override otpReceipientKey
    })
    res.json(otp)
})

app.post(`/my-app/validate', async function (req, res) {
    const reference = req.body['target']
    const otp = req.body['otp']
    try {
        const usedCount = await totem.validate(reference, otp)
        // do your thing as OTP is now validated.
    } catch (e) {
        res.json({
            success: false,
            reason: e.message,
        })
    }
})

```

# Configuration

Configuration of this service divided into 3 aspects. To keep this simple we basically provide the configurable via typescript interfaces.

## Delivery

This section describe how should your OTP be delivered to your client.

```js
{
    /** ... other configurations ... */
    "delivery_agents": [
        {
            "match": function, // default () => true (match anything)
            "agent": <delivery_agent_instance>, // <-- initialize your instance here. DeliveryAgent must implement IDeliveryAgent interface.
        }
    ]
}
```

## Schema

This section describe how should your OTP & Reference look like. This use Array to allow multiple schema generated. The `match` is a required field which we match per priority.

```js
{
    /** ... other configurations ... */
    "schemas": [
        {
            "match": function, // default () => true (match anything)
            "otp": {
                "charset": ["0123456789"], // complete charset (case in-sensitive) of character allowed for generating OTP value.
                "length": 6
            },
            "reference": {
                "charset": ["0123456789", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
                "length": 6
            },
            "aging": {
                "successValidateCount": 1, // How many time this OTP can be correctly validated
                "purgeFromDbIn": 1000 * 60 * 30, // will be considered safe to remove from Storage 30 minutes
                "canResendIn": 1000 * 60 * 2, // will allow resend-in 2 minutes
                "expiresIn": 1000 * 60 * 5 // will no longer be usable in 5 minutes
            }
        }
    ]
}
```

## Storage

This section describe how to store your OTP, and how to retrieve it for comparsion.

```js
{
    /** ... other configurations ... */
    "storage": <function_to_create_storage_instance>, // <-- initialize your instance here. Storage must implement IOTPStorage interface.
}
```

## Implementation Interfaces

```typescript

export interface IOTPTarget {
    type: "msisdn" | "email",
    /**
     * the well formatted value.
     *
     * - msisdn must be e164 format.
     * - email must be an email format.
     */
    value: string,
    /**
     * Unique Identifier of the deliverable target
     * if none provide it will resolved by creating the unique target with `${type}|${value}`.
     */
    uniqueIdentifier?: string
}

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
     * Epoch Milliseconds until OTP is expired.
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
    markAsSent?(otpReference: string, otpValue: string, receiptId: stirng): Promise<void>
}
```

## Usage Interfaces

When your codebase need to invoke Totem's functions.

```typescript
export interface ITotemOTP {

    /**
     * Use this method when user would like to request an OTP.
     *
     * @param target the delivery target.
     * @return IOTPValue that has been delivered.
     * @throws NoSchemaMatchedTargetConfigError - no Schema matched
     * @throws NoDeliveryAgentMatchedConfigError - no Delivery Agent matched
     * @throws ResendBlockedError - when requested target is still blocked by OTP's schema.
     * @throws DeliveryFailedError - when the OTP Failed to be delivered by DeliveryAgent.
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
     * @throws OTPUsedError - the provided OTP has already been used. (Already correctly validated).
     * @throws OTPMismatchedError - the provided OTP mismatched with the given reference.
     */
    validate(reference: string, otpValue: string): Promise<number>
}
```
