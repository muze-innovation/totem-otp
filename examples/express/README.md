# TotemOTP Express Example

This example demonstrates how to integrate TotemOTP with Express.js, featuring:

- **Redis storage** for OTP persistence
- **Webhook delivery** via Discord
- **JWT validation receipts** using JOSE
- Complete OTP lifecycle management

## Features

### Core OTP Functionality
- Request OTP for email or SMS (MSISDN) targets
- Validate OTP with configurable aging policies
- Multiple schema support (different rules for email vs SMS)
- Resend blocking and rate limiting

### JWT Validation Receipts
- Generate JWT receipts after successful OTP validation
- Purpose-based access control (login, transfer, admin, etc.)
- Stateless receipt validation
- Configurable expiration and security settings

### Delivery Integration
- Discord webhook integration for OTP delivery
- Customizable message formatting
- Support for different delivery agents per target type

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DISCORD_WEBHOOK_URL` | ✅ | - | Discord webhook URL for OTP delivery |
| `JWT_SECRET` | ❌ | `example-jwt-secret-key-32-characters-min` | JWT signing secret (32+ characters) |
| `REDIS_URL` | ❌ | `redis://localhost:6379` | Redis connection URL |
| `PORT` | ❌ | `3000` | Server port |

### Security Note
⚠️ **Always set a custom `JWT_SECRET` in production!** The default secret is for development only.

## Running the Example

### Prerequisites
- Node.js 18+
- Redis server running
- Discord webhook URL (for delivery)

### Quick Start

```bash
# Using npm workspace (from project root)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url \
JWT_SECRET=your-super-secret-jwt-key-32-characters-minimum \
npm run -w examples/express example

# Or directly in the example directory
cd examples/express
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url \
JWT_SECRET=your-super-secret-jwt-key-32-characters-minimum \
npm run example
```

### Using Docker

```bash
# Start Redis with Docker
npm run docker:redis

# Run the example
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-url \
npm run example
```

## API Endpoints

### 1. Request OTP
**POST** `/otp/request`

Request a new OTP for email or SMS delivery.

**Request Body:**
```json
{
  "target": {
    "type": "email",          // "email" or "msisdn"
    "value": "user@example.com",
    "uniqueIdentifier": "user-123"  // optional
  }
}
```

**Response:**
```json
{
  "success": true,
  "reference": "ABC12345",
  "target": {
    "type": "email",
    "value": "user@example.com"
  },
  "expiresAt": "2023-12-01T10:05:00.000Z",
  "resendAllowedAt": "2023-12-01T10:02:00.000Z"
}
```

### 2. Validate OTP (Basic)
**POST** `/otp/validate`

Validate an OTP without generating a receipt.

**Request Body:**
```json
{
  "reference": "ABC12345",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "validationCount": 1,
  "message": "OTP validated successfully"
}
```

### 3. Validate OTP with JWT Receipt
**POST** `/otp/validate-with-receipt`

Validate an OTP and receive a JWT receipt for subsequent operations.

**Request Body:**
```json
{
  "reference": "ABC12345",
  "otp": "123456",
  "purpose": ["login", "transfer"]
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "jwtReceipt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "purpose": ["login", "transfer"],
  "message": "OTP validated successfully with JWT receipt"
}
```

### 4. Validate JWT Receipt
**POST** `/receipt/validate`

Validate a JWT receipt for specific purposes.

**Request Body:**
```json
{
  "reference": "ABC12345",
  "receipt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "purpose": "login"
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "validationResult": {
    "target": {
      "type": "email",
      "value": "user@example.com"
    },
    "purpose": ["login", "transfer"],
    "expiresAtMs": 1701423900000
  },
  "message": "JWT receipt validated successfully"
}
```

## Usage Examples

### Complete OTP Flow with JWT Receipt

```bash
# 1. Request OTP
curl -X POST http://localhost:3000/otp/request \
  -H "Content-Type: application/json" \
  -d '{
    "target": {
      "type": "email",
      "value": "user@example.com"
    }
  }'

# 2. Validate OTP and get JWT receipt
curl -X POST http://localhost:3000/otp/validate-with-receipt \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "ABC12345",
    "otp": "123456",
    "purpose": ["login", "transfer"]
  }'

# 3. Later, validate the JWT receipt
curl -X POST http://localhost:3000/receipt/validate \
  -H "Content-Type: application/json" \
  -d '{
    "reference": "ABC12345",
    "receipt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "purpose": "login"
  }'
```

### JavaScript/Node.js Integration

```javascript
const axios = require('axios')

class OTPClient {
  constructor(baseURL = 'http://localhost:3000') {
    this.baseURL = baseURL
  }

  async requestOTP(target) {
    const response = await axios.post(`${this.baseURL}/otp/request`, { target })
    return response.data
  }

  async validateWithReceipt(reference, otp, purpose) {
    const response = await axios.post(`${this.baseURL}/otp/validate-with-receipt`, {
      reference, otp, purpose
    })
    return response.data
  }

  async validateReceipt(reference, receipt, purpose) {
    const response = await axios.post(`${this.baseURL}/receipt/validate`, {
      reference, receipt, purpose
    })
    return response.data
  }
}

// Usage
const client = new OTPClient()

async function loginFlow() {
  // Request OTP
  const otpRequest = await client.requestOTP({
    type: 'email',
    value: 'user@example.com'
  })
  
  // User enters OTP, validate and get JWT
  const validation = await client.validateWithReceipt(
    otpRequest.reference,
    '123456', // User-entered OTP
    ['login']
  )
  
  // Store JWT for later use
  const jwtReceipt = validation.jwtReceipt
  
  // Later, validate JWT for protected operations
  const receiptValidation = await client.validateReceipt(
    otpRequest.reference,
    jwtReceipt,
    'login'
  )
  
  if (receiptValidation.success) {
    console.log('User authenticated successfully!')
  }
}
```

## Schema Configuration

The example uses different schemas for email and SMS:

### Email Schema
- **OTP**: 6 digits
- **Reference**: 8 alphanumeric characters
- **Expiration**: 5 minutes
- **Resend cooldown**: 2 minutes
- **Max validations**: 1

### SMS Schema
- **OTP**: 4 digits
- **Reference**: 6 letters
- **Expiration**: 3 minutes
- **Resend cooldown**: 1 minute
- **Max validations**: 3

## Error Handling

The API returns structured error responses:

```json
{
  "success": false,
  "valid": false,
  "error": "Invalid OTP",
  "message": "The provided OTP does not match or does not exist"
}
```

Common error types:
- `Invalid request body` (400)
- `Invalid OTP` (400)
- `OTP already used` (400)
- `Too Many Requests` (429)
- `Invalid JWT receipt` (400)
- `Internal server error` (500)

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run example

# Clean build artifacts
npm run clean
```

## Architecture

The example demonstrates a production-ready architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Express API   │────│   TotemOTP Core │────│   Redis Storage │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       
         │              ┌─────────────────┐              
         │              │ JWT Generator   │              
         │              │   (JOSE)       │              
         │              └─────────────────┘              
         │                       │                       
┌─────────────────┐    ┌─────────────────┐              
│  Discord/Webhook│────│ Delivery Agent  │              
│    Integration  │    │   (Webhook)     │              
└─────────────────┘    └─────────────────┘              
```

This architecture provides:
- **Scalability**: Stateless JWT receipts
- **Security**: HMAC-signed JWTs with purpose validation
- **Flexibility**: Pluggable storage and delivery systems
- **Reliability**: Redis persistence with TTL management
