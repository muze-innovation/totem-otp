import type { IOTPValue, IDeliveryAgent } from '@totem-otp/core'
// Use Node.js built-in fetch (available in Node 18+) or fallback to https module
import { request as httpsRequest } from 'https'
import { request as httpRequest } from 'http'
import { URL } from 'url'

export interface WebhookDeliveryAgentOptions {
  /**
   * Webhook destination URL
   */
  webhookUrl: string

  /**
   * Optional callback function to compute the request body
   * If not provided, a default body structure will be used
   */
  bodyBuilder?: (otp: IOTPValue) => Record<string, any> | string

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

export class WebhookDeliveryAgent implements IDeliveryAgent {
  private readonly webhookUrl: string
  private readonly bodyBuilder: (otp: IOTPValue) => Record<string, any> | string
  private readonly headers: Record<string, string>
  private readonly method: 'POST' | 'PUT' | 'PATCH'
  private readonly timeout: number

  constructor(options: WebhookDeliveryAgentOptions) {
    this.webhookUrl = options.webhookUrl
    this.bodyBuilder = options.bodyBuilder || this.defaultBodyBuilder
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers
    }
    this.method = options.method || 'POST'
    this.timeout = options.timeout || 30000
  }

  async sendMessageToAudience(otp: IOTPValue): Promise<string> {
    const body = this.bodyBuilder(otp)
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body)

    try {
      const response = await this.makeHttpRequest(bodyString)

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`)
      }

      // Try to get receipt ID from response
      const receiptId = await this.extractReceiptId(response)
      return receiptId || this.generateReceiptId(otp)
    } catch (error) {
      throw new Error(`Webhook delivery failed: ${(error as Error).message}`)
    }
  }

  /**
   * Default body builder that creates a standard webhook payload
   */
  private defaultBodyBuilder(otp: IOTPValue): Record<string, any> {
    return {
      event: 'otp_requested',
      timestamp: new Date().toISOString(),
      data: {
        target: {
          type: otp.target.type,
          value: otp.target.value,
          uniqueIdentifier: otp.target.uniqueIdentifier
        },
        otp: {
          value: otp.value,
          reference: otp.reference,
          expiresAt: new Date(otp.expiresAtMs).toISOString(),
          resendAllowedAt: new Date(otp.resendAllowedAtMs).toISOString()
        }
      }
    }
  }

  /**
   * Make HTTP request using Node.js built-in modules
   */
  private makeHttpRequest(body: string): Promise<{
    statusCode: number
    statusMessage: string
    headers: Record<string, string>
    data: string
  }> {
    return new Promise((resolve, reject) => {
      const url = new URL(this.webhookUrl)
      const isHttps = url.protocol === 'https:'
      const request = isHttps ? httpsRequest : httpRequest

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: this.method,
        headers: {
          ...this.headers,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: this.timeout
      }

      const req = request(options, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            statusMessage: res.statusMessage || '',
            headers: res.headers as Record<string, string>,
            data
          })
        })
      })

      req.on('error', (error) => {
        reject(error)
      })

      req.on('timeout', () => {
        req.destroy()
        reject(new Error(`Request timeout after ${this.timeout}ms`))
      })

      req.write(body)
      req.end()
    })
  }

  /**
   * Extract receipt ID from webhook response
   */
  private async extractReceiptId(response: {
    headers: Record<string, string>
    data: string
  }): Promise<string | null> {
    try {
      const contentType = response.headers['content-type'] || ''

      if (contentType.includes('application/json')) {
        const data = JSON.parse(response.data)

        // Try common receipt ID field names
        return (
          data.receiptId || data.receipt_id || data.id || data.messageId || data.message_id || null
        )
      }

      // If response is text, try to use it as receipt ID
      if (contentType.includes('text/') || !contentType) {
        const text = response.data.trim()
        return text || null
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Generate a fallback receipt ID if none is provided by the webhook
   */
  private generateReceiptId(otp: IOTPValue): string {
    const timestamp = Date.now()
    const targetHash = this.simpleHash(otp.target.value)
    return `webhook_${timestamp}_${targetHash}_${otp.reference}`
  }

  /**
   * Simple hash function for generating receipt IDs
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16)
  }
}
