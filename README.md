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
        "uniqueIdentifier": msisdn, // optional to prevent user request for too many time to save your delivery cost. If not provided. it will use `type+value`
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
            "agent": <delivery_agent_name_package_name>, // <-- initialize your instance here. DeliveryAgent must implement IDeliveryAgent interface.
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
    "storage": {
        "storage": <storage_instance>, // <-- initialize your instance here. Storage must implement IOTPStorage interface.
    }
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
    fetch(otpReference: string): Promise<IOTPValue & { receiptId?: string, used: number }>

    /**
     * Set the given OTP that is has been sent.
     *
     * Mark that the OTP has been sent
     * @param otpReferene the OTP reference used when `store` was called.
     * @param receiptId the delivery receipt id.
     */
    markAsSent?(otpReference: string, receiptId: stirng): Promise<void>

    /**
     * Mark the given OTP that it has been used.
     *
     * @param otpReferene the OTP reference used when `store` was called.
     * @return Number of time it has been marked as used.
     */
    markAsUsed(otpReference: string): Promise<number>
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
```
