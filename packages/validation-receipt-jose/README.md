# TotemOTP Validation Receipt JOSE

A JWT-based validation receipt generator for TotemOTP using the JOSE (JSON Object Signing and Encryption) library.

## Installation

```bash
npm install totem-otp-validation-receipt-jose
```

The `jose` library is included as a dependency and will be installed automatically.

## Usage

```typescript
import { TotemOTP } from 'totem-otp'
import { JoseValidationReceiptGenerator } from 'totem-otp-validation-receipt-jose'

// Create the validation receipt generator
const validationReceiptGenerator = new JoseValidationReceiptGenerator({
  sharedSecret: 'your-secret-key-at-least-32-characters-long',
  expirationTimeMs: 60 * 60 * 1000, // 1 hour (optional)
  issuer: 'your-app-name', // optional
  audience: 'your-client-app' // optional
})

// Configure TotemOTP with validation receipt support
const totem = new TotemOTP({
  storage: () => yourStorageInstance,
  schemas: [yourSchema],
  deliveryAgents: [yourDeliveryAgent],
  validationReceipt: () => validationReceiptGenerator
})

// Validate OTP and get JWT receipt
const jwtReceipt = await totem.validate('REF123', '123456', ['login', 'transfer'])

// Later, validate the JWT receipt
const validationResult = await totem.validateReceipt('REF123', jwtReceipt, 'login')
```

## Configuration Options

### JoseValidationReceiptGeneratorOptions

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `sharedSecret` | `string` | ✅ | - | Secret key for signing and verifying JWTs. Should be at least 32 characters long for security |
| `expirationTimeMs` | `number` | ❌ | `3600000` (1 hour) | JWT expiration time in milliseconds |
| `issuer` | `string` | ❌ | `'totem-otp'` | JWT issuer claim |
| `audience` | `string` | ❌ | `'totem-otp-client'` | JWT audience claim |

## JWT Structure

The generated JWT contains the following claims:

```json
{
  "target": {
    "type": "email",
    "value": "user@example.com",
    "uniqueIdentifier": "optional-id"
  },
  "purpose": ["login", "transfer"],
  "ref": "REF123",
  "iss": "your-app-name",
  "aud": "your-client-app", 
  "sub": "email:user@example.com",
  "iat": 1638360000,
  "exp": 1638363600
}
```

### Claims Description

- `target`: The OTP target information (email/msisdn with value and optional unique identifier)
- `purpose`: Array of purposes this receipt is valid for
- `ref`: The OTP reference this receipt was generated for
- `iss`: Issuer (configurable)
- `aud`: Audience (configurable)
- `sub`: Subject in format `{type}:{value}`
- `iat`: Issued at timestamp
- `exp`: Expiration timestamp

## Security Features

- **HMAC SHA-256 Signing**: Uses HS256 algorithm for JWT signing
- **Reference Binding**: JWTs are bound to specific OTP references
- **Expiration**: Built-in JWT expiration handling
- **Issuer/Audience Validation**: Prevents token misuse across different applications
- **Purpose Validation**: Ensures receipts are used for intended purposes only

## Error Handling

The generator throws errors in the following scenarios:

- Invalid JWT format or signature
- JWT signed with different secret
- Expired JWT
- Wrong issuer or audience
- Reference mismatch between JWT and validation call
- Purpose not included in JWT claims

All errors are wrapped in a descriptive format: `"Invalid JWT receipt: {specific error message}"`

## Examples

### Basic Usage

```typescript
const generator = new JoseValidationReceiptGenerator({
  sharedSecret: 'my-super-secret-key-32-chars-min'
})
```

### Advanced Configuration

```typescript
const generator = new JoseValidationReceiptGenerator({
  sharedSecret: process.env.JWT_SECRET,
  expirationTimeMs: 30 * 60 * 1000, // 30 minutes
  issuer: 'my-banking-app',
  audience: 'mobile-client'
})
```

### Error Handling

```typescript
try {
  const result = await totem.validateReceipt(reference, receipt, purpose)
  console.log('Valid receipt:', result)
} catch (error) {
  if (error.message.includes('Invalid JWT receipt')) {
    console.log('Receipt validation failed:', error.message)
  }
}
```

## Best Practices

1. **Use a strong shared secret**: At least 32 characters long, randomly generated
2. **Store secrets securely**: Use environment variables or secure configuration management
3. **Set appropriate expiration**: Balance security with user experience
4. **Validate purposes strictly**: Only grant access to explicitly requested purposes
5. **Use HTTPS**: Always transmit JWTs over secure connections
6. **Monitor for abuse**: Log validation failures and monitor for suspicious patterns

## Dependencies

- [jose](https://github.com/panva/jose): ^5.9.6 (included)
- [totem-otp](../core): ~0.0.5 (peer dependency)

## License

ISC