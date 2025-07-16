# @totem-otp/delivery-webhook

HTTP webhook delivery agent for TotemOTP framework.

## Installation

```bash
npm install @totem-otp/delivery-webhook
```

## Usage

### Basic Usage

```typescript
import { WebhookDeliveryAgent } from '@totem-otp/delivery-webhook'
import { TotemOTP } from 'totem-otp'

// Create webhook delivery agent
const webhookAgent = new WebhookDeliveryAgent({
  webhookUrl: 'https://your-webhook-endpoint.com/otp'
})

// Use with TotemOTP
const totem = new TotemOTP({
  storage: () => yourStorageInstance,
  schemas: [
    {
      match: (target) => target.type === 'email',
      otp: { charset: ['0123456789'], length: 6 },
      reference: { charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'], length: 8 },
      aging: {
        successValidateCount: 1,
        purgeFromDbIn: 1800000, // 30 minutes
        canResendIn: 120000, // 2 minutes
        expiresIn: 300000 // 5 minutes
      }
    }
  ],
  deliveryAgents: [
    {
      match: (target) => target.type === 'email',
      agent: () => webhookAgent
    }
  ]
})
```

### Custom Body Builder

```typescript
const webhookAgent = new WebhookDeliveryAgent({
  webhookUrl: 'https://your-webhook-endpoint.com/otp',
  bodyBuilder: (otp) => ({
    // Custom webhook payload
    recipient: otp.target.value,
    code: otp.value,
    expires: new Date(otp.expiresAtMs).toISOString(),
    reference: otp.reference,
    type: otp.target.type
  })
})
```

### Custom Headers and Method

```typescript
const webhookAgent = new WebhookDeliveryAgent({
  webhookUrl: 'https://your-webhook-endpoint.com/otp',
  method: 'PUT',
  headers: {
    'Authorization': 'Bearer your-token',
    'X-Custom-Header': 'custom-value'
  },
  timeout: 10000 // 10 seconds
})
```

## Configuration Options

```typescript
interface WebhookDeliveryAgentOptions {
  /**
   * Webhook destination URL
   */
  webhookUrl: string
  
  /**
   * Optional callback function to compute the request body
   * If not provided, a default body structure will be used
   */
  bodyBuilder?: (otp: IOTPValue) => Record<string, any>
  
  /**
   * Optional HTTP headers to include in the request
   * @default { 'Content-Type': 'application/json' }
   */
  headers?: Record<string, string>
  
  /**
   * Optional HTTP method
   * @default 'POST'
   */
  method?: 'POST' | 'PUT' | 'PATCH'
  
  /**
   * Optional timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  timeout?: number
}
```

## Default Webhook Payload

When no custom `bodyBuilder` is provided, the webhook will receive:

```json
{
  "event": "otp_requested",
  "timestamp": "2025-07-16T17:00:00.000Z",
  "data": {
    "target": {
      "type": "email",
      "value": "user@example.com",
      "uniqueIdentifier": "user-123"
    },
    "otp": {
      "value": "123456",
      "reference": "REF12345",
      "expiresAt": "2025-07-16T17:05:00.000Z",
      "resendAllowedAt": "2025-07-16T17:02:00.000Z"
    }
  }
}
```

## Receipt ID Handling

The delivery agent attempts to extract a receipt ID from the webhook response:

### JSON Response
```json
{
  "receiptId": "receipt-123",
  // or "receipt_id", "id", "messageId", "message_id"
}
```

### Text Response
```
receipt-123
```

If no receipt ID is found, a fallback ID is generated in the format:
```
webhook_{timestamp}_{hash}_{otpReference}
```

## Custom Body Builders

### Email-Style Delivery Agent

```typescript
const emailAgent = new WebhookDeliveryAgent({
  webhookUrl: 'https://email-service.com/send',
  headers: { 'Authorization': 'Bearer token' },
  bodyBuilder: (otp) => ({
    to: otp.target.value,
    subject: 'Your OTP Code',
    body: `Your OTP code is: ${otp.value}. This code will expire at ${new Date(otp.expiresAtMs).toLocaleString()}.`,
    reference: otp.reference,
    expiresAt: new Date(otp.expiresAtMs).toISOString()
  })
})
```

### SMS-Style Delivery Agent

```typescript
const smsAgent = new WebhookDeliveryAgent({
  webhookUrl: 'https://sms-service.com/send',
  bodyBuilder: (otp) => ({
    to: otp.target.value,
    message: `Your OTP code is: ${otp.value}. Expires in ${Math.ceil((otp.expiresAtMs - Date.now()) / 60000)} minutes.`,
    reference: otp.reference,
    expiresAt: new Date(otp.expiresAtMs).toISOString()
  })
})
```

### Custom Delivery Agent

```typescript
const customAgent = new WebhookDeliveryAgent({
  webhookUrl: 'https://custom-service.com/notify',
  method: 'PUT',
  bodyBuilder: (otp) => ({
    customField: otp.value,
    customTarget: otp.target.value
  })
})
```

## Error Handling

The delivery agent will throw an error if:
- The webhook responds with HTTP status code outside 200-299 range
- Network/connection errors occur
- Request timeout is exceeded

```typescript
try {
  const receiptId = await webhookAgent.sendMessageToAudience(otp)
  console.log('OTP sent successfully:', receiptId)
} catch (error) {
  console.error('Webhook delivery failed:', error.message)
}
```

## Testing

For testing purposes, you can use tools like [nock](https://github.com/nock/nock) to mock HTTP requests:

```typescript
import nock from 'nock'

// Mock webhook endpoint
nock('https://your-webhook-endpoint.com')
  .post('/otp')
  .reply(200, { receiptId: 'test-receipt-123' })

// Test your delivery agent
const result = await webhookAgent.sendMessageToAudience(testOTPValue)
expect(result).toBe('test-receipt-123')
```

## Requirements

- Node.js 16 or higher
- TypeScript 4.5 or higher

## License

ISC