import type { IOpenClawClient } from './IOpenClawClient.js'
import type { OpenClawRequest, OpenClawResponse } from '../types.js'
import { config } from '../config.js'
import { logger } from '../logger.js'

/**
 * Real HTTP client for the OpenClaw API.
 * Activated when OPENCLAW_BASE_URL is set in the environment.
 * Set OPENCLAW_API_KEY to the Bearer token OpenClaw requires.
 */
export class HttpOpenClawClient implements IOpenClawClient {
  constructor(
    private readonly baseUrl: string = config.openclawBaseUrl,
    private readonly apiKey: string  = config.openclawApiKey,
  ) {}

  async processMessage(req: OpenClawRequest): Promise<OpenClawResponse> {
    const url = `${this.baseUrl}/api/v1/process`

    logger.debug({ url, messageId: req.messageId }, 'Calling OpenClaw API')

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    // Include Bearer token when configured — real OpenClaw API requires this
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenClaw API HTTP ${response.status}: ${body}`)
    }

    return response.json() as Promise<OpenClawResponse>
  }
}
