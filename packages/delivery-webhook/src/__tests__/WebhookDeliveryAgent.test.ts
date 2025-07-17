import type { IOTPValue } from 'totem-otp'

import nock from 'nock'
import { WebhookDeliveryAgent } from '../WebhookDeliveryAgent'

describe('WebhookDeliveryAgent', () => {
  const mockOTPValue: IOTPValue = {
    target: {
      type: 'email',
      value: 'test@example.com',
      uniqueIdentifier: 'user-123'
    },
    value: '123456',
    reference: 'REF123',
    expiresAtMs: Date.now() + 300000, // 5 minutes
    resendAllowedAtMs: Date.now() + 120000 // 2 minutes
  }

  const testWebhookUrl = 'https://webhook.example.com/otp'
  const testWebhookHost = 'https://webhook.example.com'

  beforeAll(() => {
    nock.disableNetConnect()
  })

  afterAll(() => {
    nock.enableNetConnect()
  })

  beforeEach(() => {
    nock.cleanAll()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  describe('constructor', () => {
    it('should create instance with default options', () => {
      const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })
      expect(agent).toBeInstanceOf(WebhookDeliveryAgent)
    })

    it('should create instance with custom options', () => {
      const customBodyBuilder = (otp: IOTPValue) => ({ custom: otp.value })
      const agent = new WebhookDeliveryAgent({
        webhookUrl: testWebhookUrl,
        bodyBuilder: customBodyBuilder,
        headers: { 'X-Custom': 'header' },
        method: 'PUT',
        timeout: 5000
      })
      expect(agent).toBeInstanceOf(WebhookDeliveryAgent)
    })
  })

  describe('sendMessageToAudience', () => {
    describe('successful requests', () => {
      it('should send webhook with default body and return receipt ID from JSON response', async () => {
        const expectedReceiptId = 'receipt-123'

        const scope = nock(testWebhookHost)
          .post('/otp')
          .reply(200, { receiptId: expectedReceiptId })

        const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })
        const result = await agent.sendMessageToAudience(mockOTPValue)

        expect(result).toBe(expectedReceiptId)
        expect(scope.isDone()).toBe(true)
      })

      it('should send webhook with custom body builder', async () => {
        const customBodyBuilder = (otp: IOTPValue) => ({
          customField: otp.value,
          target: otp.target.value
        })

        const scope = nock(testWebhookHost)
          .post('/otp', {
            customField: '123456',
            target: 'test@example.com'
          })
          .reply(200, { id: 'custom-receipt' })

        const agent = new WebhookDeliveryAgent({
          webhookUrl: testWebhookUrl,
          bodyBuilder: customBodyBuilder
        })

        const result = await agent.sendMessageToAudience(mockOTPValue)
        expect(result).toBe('custom-receipt')
        expect(scope.isDone()).toBe(true)
      })

      it('should use custom headers', async () => {
        const scope = nock(testWebhookHost)
          .post('/otp')
          .matchHeader('x-custom-header', 'test-value')
          .reply(200, { receiptId: 'test-receipt' })

        const agent = new WebhookDeliveryAgent({
          webhookUrl: testWebhookUrl,
          headers: { 'X-Custom-Header': 'test-value' }
        })

        const result = await agent.sendMessageToAudience(mockOTPValue)
        expect(result).toBe('test-receipt')
        expect(scope.isDone()).toBe(true)
      })

      it('should use custom HTTP method', async () => {
        const scope = nock(testWebhookHost).put('/otp').reply(200, { receipt_id: 'put-receipt' })

        const agent = new WebhookDeliveryAgent({
          webhookUrl: testWebhookUrl,
          method: 'PUT'
        })

        const result = await agent.sendMessageToAudience(mockOTPValue)
        expect(result).toBe('put-receipt')
        expect(scope.isDone()).toBe(true)
      })

      it('should extract receipt ID from text response', async () => {
        const scope = nock(testWebhookHost)
          .post('/otp')
          .reply(200, 'text-receipt-id', { 'content-type': 'text/plain' })

        const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })
        const result = await agent.sendMessageToAudience(mockOTPValue)

        expect(result).toBe('text-receipt-id')
        expect(scope.isDone()).toBe(true)
      })

      it('should generate fallback receipt ID when none provided', async () => {
        const scope = nock(testWebhookHost).post('/otp').reply(200, {})

        const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })
        const result = await agent.sendMessageToAudience(mockOTPValue)

        expect(result).toMatch(/^webhook_\d+_[a-f0-9]+_REF123$/)
        expect(scope.isDone()).toBe(true)
      })

      it('should handle empty text response', async () => {
        const scope = nock(testWebhookHost)
          .post('/otp')
          .reply(200, '', { 'content-type': 'text/plain' })

        const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })
        const result = await agent.sendMessageToAudience(mockOTPValue)

        expect(result).toMatch(/^webhook_\d+_[a-f0-9]+_REF123$/)
        expect(scope.isDone()).toBe(true)
      })
    })

    describe('error handling', () => {
      it('should throw error for HTTP 4xx response', async () => {
        const scope = nock(testWebhookHost).post('/otp').reply(400, { error: 'Bad Request' })

        const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })

        await expect(agent.sendMessageToAudience(mockOTPValue)).rejects.toThrow(
          'Webhook delivery failed: HTTP 400:'
        )

        expect(scope.isDone()).toBe(true)
      })

      it('should throw error for HTTP 5xx response', async () => {
        const scope = nock(testWebhookHost)
          .post('/otp')
          .reply(500, { error: 'Internal Server Error' })

        const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })

        await expect(agent.sendMessageToAudience(mockOTPValue)).rejects.toThrow(
          'Webhook delivery failed: HTTP 500:'
        )

        expect(scope.isDone()).toBe(true)
      })

      it('should throw error for network failure', async () => {
        const scope = nock(testWebhookHost).post('/otp').replyWithError('Network error')

        const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })

        await expect(agent.sendMessageToAudience(mockOTPValue)).rejects.toThrow(
          'Webhook delivery failed: Network error'
        )

        expect(scope.isDone()).toBe(true)
      })

      it('should handle malformed JSON response gracefully', async () => {
        const scope = nock(testWebhookHost)
          .post('/otp')
          .reply(200, 'invalid json{', { 'content-type': 'application/json' })

        const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })
        const result = await agent.sendMessageToAudience(mockOTPValue)

        // Should fall back to generated receipt ID
        expect(result).toMatch(/^webhook_\d+_[a-f0-9]+_REF123$/)
        expect(scope.isDone()).toBe(true)
      })
    })

    describe('URL handling', () => {
      it('should handle HTTP URLs', async () => {
        const httpUrl = 'http://webhook.example.com/otp'
        const scope = nock('http://webhook.example.com')
          .post('/otp')
          .reply(200, { receiptId: 'http-receipt' })

        const agent = new WebhookDeliveryAgent({ webhookUrl: httpUrl })
        const result = await agent.sendMessageToAudience(mockOTPValue)

        expect(result).toBe('http-receipt')
        expect(scope.isDone()).toBe(true)
      })

      it('should handle URLs with query parameters', async () => {
        const urlWithQuery = 'https://webhook.example.com/otp?param=value'
        const scope = nock('https://webhook.example.com')
          .post('/otp?param=value')
          .reply(200, { receiptId: 'query-receipt' })

        const agent = new WebhookDeliveryAgent({ webhookUrl: urlWithQuery })
        const result = await agent.sendMessageToAudience(mockOTPValue)

        expect(result).toBe('query-receipt')
        expect(scope.isDone()).toBe(true)
      })

      it('should handle URLs with custom ports', async () => {
        const urlWithPort = 'https://webhook.example.com:8080/otp'
        const scope = nock('https://webhook.example.com:8080')
          .post('/otp')
          .reply(200, { receiptId: 'port-receipt' })

        const agent = new WebhookDeliveryAgent({ webhookUrl: urlWithPort })
        const result = await agent.sendMessageToAudience(mockOTPValue)

        expect(result).toBe('port-receipt')
        expect(scope.isDone()).toBe(true)
      })
    })
  })

  describe('default body builder', () => {
    it('should create standard webhook payload', async () => {
      const scope = nock(testWebhookHost)
        .post('/otp', (body) => {
          expect(body).toHaveProperty('event', 'otp_requested')
          expect(body).toHaveProperty('timestamp')
          expect(body).toHaveProperty('data.target.type', 'email')
          expect(body).toHaveProperty('data.target.value', 'test@example.com')
          expect(body).toHaveProperty('data.target.uniqueIdentifier', 'user-123')
          expect(body).toHaveProperty('data.otp.value', '123456')
          expect(body).toHaveProperty('data.otp.reference', 'REF123')
          expect(body).toHaveProperty('data.otp.expiresAt')
          expect(body).toHaveProperty('data.otp.resendAllowedAt')
          return true
        })
        .reply(200, { receiptId: 'default-receipt' })

      const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })
      const result = await agent.sendMessageToAudience(mockOTPValue)

      expect(result).toBe('default-receipt')
      expect(scope.isDone()).toBe(true)
    })

    it('should handle target without uniqueIdentifier', async () => {
      const otpWithoutUniqueId: IOTPValue = {
        ...mockOTPValue,
        target: {
          type: 'email',
          value: 'test@example.com'
        }
      }

      const scope = nock(testWebhookHost)
        .post('/otp', (body) => {
          expect(body.data.target.uniqueIdentifier).toBeUndefined()
          return true
        })
        .reply(200, { receiptId: 'no-unique-id' })

      const agent = new WebhookDeliveryAgent({ webhookUrl: testWebhookUrl })
      const result = await agent.sendMessageToAudience(otpWithoutUniqueId)

      expect(result).toBe('no-unique-id')
      expect(scope.isDone()).toBe(true)
    })
  })
})
