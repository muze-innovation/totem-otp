# @totem-otp/storage-redis

Redis storage implementation for TotemOTP framework.

## Installation

```bash
npm install @totem-otp/storage-redis redis
```

## Usage

```typescript
import { createClient } from 'redis'
import { RedisOTPStorage } from '@totem-otp/storage-redis'
import { TotemOTP } from 'totem-otp'

// Create Redis client (standalone)
const redisClient = createClient({
  socket: {
    host: 'localhost',
    port: 6379
  }
})

await redisClient.connect()

// Create Redis storage instance
const storage = new RedisOTPStorage(redisClient, {
  keyPrefix: 'my-app-otp' // Optional, defaults to 'totem-otp'
})

// Use with TotemOTP
const totem = new TotemOTP({
  storage: () => storage,
  schemas: [/* your schemas */],
  deliveryAgents: [/* your delivery agents */]
})
```

## Redis Cluster Support

The Redis storage is agnostic to Redis deployment mode and works with both standalone and cluster configurations:

```typescript
import { createCluster } from 'redis'

// Create Redis cluster client
const redisCluster = createCluster({
  rootNodes: [
    { host: 'localhost', port: 7000 },
    { host: 'localhost', port: 7001 },
    { host: 'localhost', port: 7002 }
  ]
})

await redisCluster.connect()

// Use with Redis storage (same API)
const storage = new RedisOTPStorage(redisCluster)
```

## Features

### Core Storage Operations

- **`store(otp, parentReference, deletableAt)`** - Stores OTP with automatic expiration
- **`fetch(otpReference)`** - Retrieves OTP with usage metadata
- **`markAsSent(otpReference, receiptId)`** - Marks OTP as sent with receipt ID
- **`markAsUsed(otpReference)`** - Increments usage count using Redis HINCRBY

### Automatic Expiration

The storage utilizes Redis's `EXPIRE` functionality to automatically handle the `deletableAt` parameter:

```typescript
const deletableAt = Date.now() + (30 * 60 * 1000) // 30 minutes from now
await storage.store(otp, null, deletableAt)
// OTP will be automatically deleted by Redis after 30 minutes
```

### Usage Count Management

Uses Redis `HINCRBY` for atomic increment operations:

```typescript
const usageCount = await storage.markAsUsed('REF123')
console.log(`OTP used ${usageCount} times`)
```

### Key Management

All Redis keys are prefixed to avoid conflicts:

```typescript
// Default prefix: 'totem-otp:REF123'
const storage = new RedisOTPStorage(redisClient)

// Custom prefix: 'my-app:REF123'
const storage = new RedisOTPStorage(redisClient, { keyPrefix: 'my-app' })
```

## Storage Schema

Each OTP is stored as a Redis hash with the following fields:

```
totem-otp:REF123 {
  "target_type": "email",
  "target_value": "user@example.com",
  "target_unique_id": "user-123",
  "otp_value": "123456",
  "expires_at_ms": "1640995200000",
  "resend_allowed_at_ms": "1640995080000",
  "parent_reference": "PARENT123",
  "used": "2",
  "receipt_id": "receipt-abc123",
  "created_at": "1640995000000"
}
```

## Additional Utilities

### Check OTP Existence

```typescript
const exists = await storage.exists('REF123')
```

### Get TTL

```typescript
const ttlSeconds = await storage.getTTL('REF123')
```

### Delete OTP

```typescript
await storage.delete('REF123')
```

### List All Keys

```typescript
const allReferences = await storage.getAllKeys()
```

## Error Handling

The storage handles Redis connection errors gracefully:

```typescript
try {
  await storage.store(otp, null, deletableAt)
} catch (error) {
  console.error('Redis storage error:', error)
  // Handle connection issues, timeouts, etc.
}
```

## Testing

The package includes comprehensive tests using `redis-memory-server`:

```bash
npm test
```

## Configuration Options

```typescript
interface RedisOTPStorageOptions {
  /**
   * Optional key prefix for Redis keys
   * @default 'totem-otp'
   */
  keyPrefix?: string
}
```

## Requirements

- Redis 4.0 or higher
- Node.js 16 or higher
- TypeScript 4.5 or higher

## License

ISC