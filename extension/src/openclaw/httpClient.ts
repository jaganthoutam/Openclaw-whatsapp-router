import type { IOpenClawClient } from './IOpenClawClient.js'
import type { OpenClawRequest, OpenClawResponse } from '../types.js'
import { config } from '../config.js'
import { logger } from '../logger.js'

/**
 * Real HTTP client for the OpenClaw API.
 * Used when OPENCLAW_BASE_URL is set.
 */
export class HttpOpenClawClient implements IOpenClawClient {
  constructor(private readonly baseUrl: string = config.openclawBaseUrl) {}

  async processMessage(req: OpenClawRequest): Promise<OpenClawResponse> {
    const url = `${this.baseUrl}/api/v1/process`

    logger.debug({ url, messageId: req.messageId }, 'Calling OpenClaw API')

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
