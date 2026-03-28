import type { ExtensionRequest, ExtensionResponse } from '../types.js'
import { logger } from '../logger.js'

/**
 * HTTP client that POSTs inbound messages to a tenant-specific extension endpoint.
 * Authentication is via the shared X-Router-Secret header.
 */
export class ExtensionClient {
  constructor(private readonly routerSecret: string) {}

  async forward(req: ExtensionRequest, extensionUrl: string): Promise<ExtensionResponse> {
    logger.debug({ url: extensionUrl, messageId: req.messageId }, 'Forwarding to extension')

    let response: Response
    try {
      response = await fetch(extensionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Router-Secret': this.routerSecret,
        },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(15_000),
      })
    } catch (err) {
      logger.error({ err, url: extensionUrl }, 'Extension request failed')
      throw err
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      logger.error({ status: response.status, url: extensionUrl, body: text }, 'Extension returned error')
      throw new Error(`Extension HTTP ${response.status}: ${text}`)
    }

    const body = (await response.json()) as ExtensionResponse
    logger.debug({ messageId: req.messageId, tenantId: body.tenantId }, 'Extension response received')
    return body
  }
}
