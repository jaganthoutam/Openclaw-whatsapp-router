/**
 * handleWhatsAppInbound
 * ─────────────────────
 * Processes a verified inbound message from the WhatsApp Router and
 * dispatches it into OpenClaw core via api.channel.handleInbound().
 *
 * Called from the /whatsapp-router/inbound webhook handler in index.ts.
 */

import type { PluginApi, HttpRouteRequest, HttpRouteResponse } from 'openclaw/plugin-sdk/core'

export interface InboundPayload {
  messageId: string
  senderNumber: string  // E.164 without +
  tenantId: string
  body: string
  timestamp: number     // epoch ms
}

export function parseInboundPayload(req: HttpRouteRequest): InboundPayload {
  const data = req.json<Record<string, unknown>>()

  const { messageId, senderNumber, tenantId, body, timestamp } = data

  if (
    typeof messageId !== 'string' ||
    typeof senderNumber !== 'string' ||
    typeof tenantId !== 'string' ||
    typeof body !== 'string' ||
    typeof timestamp !== 'number'
  ) {
    throw new Error('Invalid inbound payload: missing or wrong-typed fields')
  }

  return { messageId, senderNumber, tenantId, body, timestamp }
}

export async function handleWhatsAppInbound(
  api: PluginApi,
  routerSecret: string,
  req: HttpRouteRequest,
  res: HttpRouteResponse,
): Promise<boolean> {
  // Verify X-Router-Secret before touching the payload
  const incoming = req.headers['x-router-secret']
  if (!incoming || incoming !== routerSecret) {
    res.statusCode = 401
    res.end(JSON.stringify({ error: 'Unauthorized' }))
    return true
  }

  let payload: InboundPayload
  try {
    payload = parseInboundPayload(req)
  } catch {
    res.statusCode = 400
    res.end(JSON.stringify({ error: 'Bad Request: invalid payload' }))
    return true
  }

  // Dispatch into OpenClaw core.
  // api.channel.handleInbound() hands the message to the shared message tool,
  // prompt wiring, and session bookkeeping owned by core.
  // The reply is delivered back to the user via outbound.attachedResults.sendText.
  try {
    await api.channel.handleInbound({
      channelId: 'whatsapp-router',
      accountId: null,
      from: payload.senderNumber,
      text: payload.body,
      messageId: payload.messageId,
      timestamp: payload.timestamp,
      metadata: { tenantId: payload.tenantId },
    })
  } catch (err) {
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'Internal error dispatching message' }))
    return true
  }

  res.statusCode = 200
  res.end('ok')
  return true
}
