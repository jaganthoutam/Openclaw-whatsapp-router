/**
 * OpenClaw Adapter
 * ────────────────
 * This file is what you customise to wire the extension into your specific
 * OpenClaw deployment.  The extension service calls this adapter for every
 * inbound message.  Swap the body of processMessage() to match whatever
 * API/webhook/internal handler OpenClaw exposes in your environment.
 *
 * Three common patterns are shown below — uncomment the one that matches:
 *
 *   A) OpenClaw REST API  (most common)
 *   B) OpenClaw internal webhook
 *   C) Direct in-process function call (when extension runs inside OpenClaw)
 */

import type { IOpenClawClient } from './IOpenClawClient.js'
import type { OpenClawRequest, OpenClawResponse } from '../types.js'
import { config } from '../config.js'
import { logger } from '../logger.js'

// ─── A) OpenClaw REST API ────────────────────────────────────────────────────
//
// OpenClaw exposes something like:
//   POST /api/v1/chat/message
//   Authorization: Bearer <OPENCLAW_API_KEY>
//   Body: { sessionId, message, metadata }
//
// Response:
//   { reply: string, sessionId: string }
//
// Set in extension/.env:
//   OPENCLAW_BASE_URL=http://openclaw-service:8080   (internal k8s service name)
//   OPENCLAW_API_KEY=<your-key>

export interface OpenClawRestResponse {
  reply: string
  sessionId: string
}

export class OpenClawRestAdapter implements IOpenClawClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor() {
    this.baseUrl = config.openclawBaseUrl
    this.apiKey = process.env.OPENCLAW_API_KEY ?? ''
    if (!this.baseUrl) throw new Error('OPENCLAW_BASE_URL must be set for OpenClawRestAdapter')
  }

  async processMessage(req: OpenClawRequest): Promise<OpenClawResponse> {
    const url = `${this.baseUrl}/api/v1/chat/message`

    logger.debug({ url, tenantId: req.tenantId, messageId: req.messageId }, 'Calling OpenClaw REST API')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        sessionId: req.senderNumber,     // use sender as conversation session key
        message: req.body,
        metadata: {
          tenantId: req.tenantId,
          messageId: req.messageId,
          timestamp: req.timestamp,
        },
      }),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`OpenClaw REST API HTTP ${response.status}: ${body}`)
    }

    const data = (await response.json()) as OpenClawRestResponse
    return { replyText: data.reply }
  }
}

// ─── B) OpenClaw internal webhook ────────────────────────────────────────────
//
// OpenClaw accepts a webhook POST and returns the reply synchronously.
// Identical structure to the router→extension call, just further inward.
//
// Set: OPENCLAW_BASE_URL=http://localhost:3000  (if co-located in same pod)

export class OpenClawWebhookAdapter implements IOpenClawClient {
  private readonly webhookUrl: string

  constructor() {
    const base = config.openclawBaseUrl
    if (!base) throw new Error('OPENCLAW_BASE_URL must be set for OpenClawWebhookAdapter')
    this.webhookUrl = `${base}/webhook/whatsapp`
  }

  async processMessage(req: OpenClawRequest): Promise<OpenClawResponse> {
    logger.debug({ url: this.webhookUrl, messageId: req.messageId }, 'Calling OpenClaw webhook')

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(20_000),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`OpenClaw webhook HTTP ${response.status}: ${text}`)
    }

    const data = (await response.json()) as OpenClawResponse
    return data
  }
}

// ─── C) In-process call (extension embedded inside OpenClaw) ─────────────────
//
// If you embed the extension directly inside the OpenClaw Node.js process,
// import and call the OpenClaw handler directly instead of over HTTP.
//
// Example:
//
//   import { handleInboundMessage } from '@openclaw/core'
//
//   export class OpenClawInProcessAdapter implements IOpenClawClient {
//     async processMessage(req: OpenClawRequest): Promise<OpenClawResponse> {
//       const result = await handleInboundMessage({
//         sessionId: req.senderNumber,
//         text: req.body,
//         tenantId: req.tenantId,
//       })
//       return { replyText: result.reply }
//     }
//   }
