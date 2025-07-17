#!/bin/node

import 'dotenv/config'
import type { IOTPTarget, IOTPValue } from 'totem-otp'
import express from 'express'
import { createClient } from 'redis'
import { TotemOTP } from 'totem-otp'
import { RedisOTPStorage } from 'totem-otp-storage-redis'
import { WebhookDeliveryAgent } from 'totem-otp-delivery-webhook'

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json())

// Global variables for TotemOTP instance
let totemOTP: TotemOTP
let redisClient: any

const discordOTPMessageBuilder = (otp: IOTPValue) => {
  return `{\"content\": \"**Hot OTP Delivered**\",\"embeds\":[{\"author\":{\"name\":\"TO: ${otp.target.type} ${otp.target.value}\"},\"description\": \"Your OTP is ${otp.value}. Your reference is ${otp.reference}\", \"color\": 1127128},{\"description\": \"Your OTP is only available for few minutes. :smirk:\" }]}`
}

// Initialize TotemOTP with Redis storage and webhook delivery
async function initializeTotemOTP() {
  // Initialize Redis client
  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  })

  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || ''
  if (!discordWebhookUrl) {
    console.error('Please configure `DISCORD_WEBHOOK_URL` to run this example')
    process.exit(1)
  } else {
    console.info(`Using ${discordWebhookUrl}`)
  }

  await redisClient.connect()
  console.log('Connected to Redis')

  // Initialize storage
  const storage = new RedisOTPStorage(redisClient, {
    keyPrefix: 'example-otp'
  })

  // Initialize delivery agents
  const emailWebhookAgent = new WebhookDeliveryAgent({
    method: 'POST',
    webhookUrl: discordWebhookUrl,
    bodyBuilder: discordOTPMessageBuilder,
    timeout: 5000
  })

  const smsWebhookAgent = new WebhookDeliveryAgent({
    method: 'POST',
    webhookUrl: discordWebhookUrl,
    bodyBuilder: discordOTPMessageBuilder,
    timeout: 5000
  })

  // Configure TotemOTP
  totemOTP = new TotemOTP({
    storage: () => storage,
    schemas: [
      {
        // Email schema - 6 digit OTP, 8 char reference, 1 validation allowed
        match: (target: IOTPTarget) => target.type === 'email',
        otp: { charset: ['0123456789'], length: 6 },
        reference: { charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'], length: 8 },
        aging: {
          successValidateCount: 1,
          purgeFromDbIn: 1800000, // 30 minutes
          canResendIn: 120000, // 2 minutes
          expiresIn: 300000 // 5 minutes
        }
      },
      {
        // SMS/MSISDN schema - 4 digit OTP, 6 char reference, 3 validations allowed
        match: (target: IOTPTarget) => target.type === 'msisdn',
        otp: { charset: ['0123456789'], length: 4 },
        reference: { charset: ['ABCDEFGHIJKLMNOPQRSTUVWXYZ'], length: 6 },
        aging: {
          successValidateCount: 3,
          purgeFromDbIn: 900000, // 15 minutes
          canResendIn: 60000, // 1 minute
          expiresIn: 180000 // 3 minutes
        }
      }
    ],
    deliveryAgents: [
      {
        // Email delivery agent
        match: (target: IOTPTarget) => target.type === 'email',
        agent: () => emailWebhookAgent
      },
      {
        // SMS delivery agent
        match: (target: IOTPTarget) => target.type === 'msisdn',
        agent: () => smsWebhookAgent
      }
    ]
  })

  console.log('TotemOTP initialized successfully')
}

// Request OTP endpoint
app.post('/otp/request', async (req, res) => {
  try {
    const { target } = req.body

    // Validate request body
    if (!target || !target.type || !target.value) {
      return res.status(400).json({
        error: 'Invalid request body',
        message: 'target.type and target.value are required'
      })
    }

    // Validate target type
    if (!['email', 'msisdn'].includes(target.type)) {
      return res.status(400).json({
        error: 'Invalid target type',
        message: 'target.type must be either "email" or "msisdn"'
      })
    }

    // Request OTP
    const otpResult = await totemOTP.request(target)

    // Return response (excluding the actual OTP value for security)
    res.json({
      success: true,
      reference: otpResult.reference,
      target: otpResult.target,
      expiresAt: new Date(otpResult.expiresAtMs).toISOString(),
      resendAllowedAt: new Date(otpResult.resendAllowedAtMs).toISOString()
    })
  } catch (error: any) {
    console.error('Error requesting OTP:', error)

    // Handle specific errors
    if (error.name === 'ResendBlockedError') {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Please wait before requesting another OTP',
        retryAfter: Math.ceil((error.msUntilNextSend || 0) / 1000)
      })
    }

    if (error.name === 'NoSchemaMatchedTargetConfigError') {
      return res.status(400).json({
        error: 'Invalid target',
        message: 'No schema found for the provided target'
      })
    }

    if (error.name === 'NoDeliveryAgentMatchedConfigError') {
      return res.status(500).json({
        error: 'Delivery configuration error',
        message: 'No delivery agent found for the provided target'
      })
    }

    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
})

// Validate OTP endpoint
app.post('/otp/validate', async (req, res) => {
  try {
    const { reference, otp } = req.body

    // Validate request body
    if (!reference || !otp) {
      return res.status(400).json({
        error: 'Invalid request body',
        message: 'reference and otp are required'
      })
    }

    // Validate OTP
    const validationCount = await totemOTP.validate(reference, otp)

    res.json({
      success: true,
      valid: true,
      validationCount,
      message: 'OTP validated successfully'
    })
  } catch (error: any) {
    console.error('Error validating OTP:', error)

    // Handle specific errors
    if (error.name === 'OTPMismatchedError') {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'Invalid OTP',
        message: 'The provided OTP does not match or does not exist'
      })
    }

    if (error.name === 'OTPUsedError') {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'OTP already used',
        message: 'This OTP has been used too many times',
        usedCount: error.usedCount || parseInt(error.message.split(' ').pop()) || 0
      })
    }

    res.status(500).json({
      success: false,
      valid: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})

// Error handling middleware
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error)
  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  })
})

// Start server
async function startServer() {
  try {
    await initializeTotemOTP()

    const server = app.listen(PORT, () => {
      console.log(`TotemOTP Example Server running on port ${PORT}`)
      console.log(`Request OTP: POST http://localhost:${PORT}/otp/request`)
      console.log(`Validate OTP: POST http://localhost:${PORT}/otp/validate`)
    })

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down gracefully...')
      server.close(async () => {
        if (redisClient) {
          await redisClient.disconnect()
        }
        process.exit(0)
      })
    })

    return server
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Export for testing
export { app, startServer, initializeTotemOTP }

// Start server if this file is run directly
if (require.main === module) {
  startServer()
}
