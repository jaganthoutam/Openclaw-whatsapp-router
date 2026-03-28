/**
 * RouterApiClient
 * ───────────────
 * Sends outbound messages from OpenClaw to WhatsApp users via the
 * WhatsApp Router service's POST /outbound/send endpoint.
 *
 * Called by the `outbound.attachedResults.sendText` adapter in channel.ts
 * whenever OpenClaw wants to send a reply or proactive message to a user.
 */

export interface OutboundSendBody {
  to: string       // E.164 without +
  message: string
  tenantId: string
}

export interface OutboundSendResult {
  queued: boolean
  messageId?: string
}

export class RouterApiClient {
  constructor(
    private readonly routerUrl: string,
    private readonly routerSecret: string,
    private readonly tenantId: string,
  ) {}

  async sendText(to: string, text: string): Promise<OutboundSendResult> {
    const body: OutboundSendBody = { to, message: text, tenantId: this.tenantId }

    const response = await fetch(`${this.routerUrl}/outbound/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Router-Secret': this.routerSecret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Router /outbound/send HTTP ${response.status}: ${detail}`)
    }

    return response.json() as Promise<OutboundSendResult>
  }
}
