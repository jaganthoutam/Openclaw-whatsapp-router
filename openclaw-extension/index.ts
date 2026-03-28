/**
 * WhatsApp Router — OpenClaw Extension
 * ======================================
 * Drop this folder into OpenClaw's extension directory, then call
 * registerWhatsAppExtension() from your server setup.
 *
 * Works with both Express and Fastify — pass the app instance and options.
 *
 * ── Express usage ────────────────────────────────────────────────────────────
 *
 *   import { registerWhatsAppExtension } from './extensions/whatsapp-router'
 *   import express from 'express'
 *
 *   const app = express()
 *   app.use(express.json())
 *
 *   registerWhatsAppExtension(app, {
 *     routerSecret: process.env.WHATSAPP_ROUTER_SECRET,
 *     processMessage: async (payload) => {
 *       const reply = await myOpenClawHandler(payload.senderNumber, payload.body)
 *       return reply
 *     },
 *   })
 *
 * ── Fastify usage ─────────────────────────────────────────────────────────────
 *
 *   import { registerWhatsAppExtensionFastify } from './extensions/whatsapp-router'
 *
 *   await app.register(registerWhatsAppExtensionFastify, {
 *     routerSecret: process.env.WHATSAPP_ROUTER_SECRET,
 *     processMessage: async (payload) => { ... },
 *   })
 *
 * ── Routes registered ─────────────────────────────────────────────────────────
 *   POST /router/inbound   — receives messages from the WhatsApp Router
 *   GET  /router/health    — liveness probe (router pings this to verify extension is up)
 */

import type { WhatsAppExtensionOptions, RouterInboundPayload, RouterOutboundResponse } from './types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Outbound sender — OpenClaw → Router → WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

import type { OutboundSendRequest, OutboundSendResult } from './types.js'

export interface OutboundSenderOptions {
  /** Base URL of the WhatsApp Router service, e.g. "http://openclaw-router:3000" */
  routerUrl:    string
  /** Must match ROUTER_SECRET in the router service */
  routerSecret: string
  /** Your OpenClaw tenant ID */
  tenantId:     string
}

/**
 * Creates a send function for pushing outbound WhatsApp messages from OpenClaw.
 * Use this in cron jobs, reminder schedulers, or any server-side notification.
 *
 * Example:
 *
 *   const sendWhatsApp = createOutboundSender({
 *     routerUrl:    process.env.WHATSAPP_ROUTER_URL,
 *     routerSecret: process.env.WHATSAPP_ROUTER_SECRET,
 *     tenantId:     'tenant-a',
 *   })
 *
 *   // In a cron job or reminder:
 *   await sendWhatsApp('919812345678', 'Your 3pm meeting starts in 10 minutes.')
 *   await sendWhatsApp('919812345678', 'Task "Fix login bug" is due today.')
 */
export function createOutboundSender(opts: OutboundSenderOptions) {
  const { routerUrl, routerSecret, tenantId } = opts
  const endpoint = `${routerUrl.replace(/\/$/, '')}/outbound/send`

  return async function sendWhatsApp(to: string, message: string): Promise<OutboundSendResult> {
    const body: OutboundSendRequest = { to, message, tenantId }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Router-Secret': routerSecret,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`WhatsApp Router outbound HTTP ${response.status}: ${text}`)
    }

    return response.json() as Promise<OutboundSendResult>
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Express
// ─────────────────────────────────────────────────────────────────────────────

type ExpressApp = {
  get:  (path: string, handler: (req: any, res: any) => void) => void
  post: (path: string, handler: (req: any, res: any) => void) => void
}

/**
 * Register the WhatsApp Router extension on an Express app.
 */
export function registerWhatsAppExtension(
  app: ExpressApp,
  options: WhatsAppExtensionOptions,
): void {
  const { routerSecret, processMessage } = options

  function checkSecret(req: any, res: any): boolean {
    const incoming = req.headers['x-router-secret']
    if (!incoming || incoming !== routerSecret) {
      console.warn(`[wa-ext] Rejected ${req.method} ${req.path} — bad X-Router-Secret`)
      res.status(401).json({ error: 'Unauthorized' })
      return false
    }
    return true
  }

  // ── Liveness probe ─────────────────────────────────────────────────────────
  app.get('/router/health', (req: any, res: any) => {
    if (!checkSecret(req, res)) return
    res.json({ status: 'ok', extension: 'whatsapp-router', timestamp: new Date().toISOString() })
  })

  // ── Inbound route ──────────────────────────────────────────────────────────
  app.post('/router/inbound', async (req: any, res: any) => {
    if (!checkSecret(req, res)) return

    const payload = req.body as RouterInboundPayload
    const { messageId, senderNumber, tenantId, body, timestamp } = payload

    if (!messageId || !senderNumber || !tenantId || !body || !timestamp) {
      res.status(400).json({ error: 'Missing required fields: messageId, senderNumber, tenantId, body, timestamp' })
      return
    }

    console.log(`[wa-ext] Inbound  tenant=${tenantId} sender=${senderNumber} msgId=${messageId}`)

    try {
      const replyText = await processMessage(payload)

      if (!replyText) {
        // Router expects a 200 with empty-ish reply — it will silently drop sending
        return res.json({ tenantId, replyText: '', metadata: { skipped: true } } satisfies RouterOutboundResponse)
      }

      console.log(`[wa-ext] Reply    tenant=${tenantId} msgId=${messageId}`)
      return res.json({ tenantId, replyText, metadata: {} } satisfies RouterOutboundResponse)
    } catch (err) {
      console.error(`[wa-ext] processMessage error tenant=${tenantId} msgId=${messageId}`, err)
      return res.status(500).json({ error: 'Internal processing error' })
    }
  })

  console.log('[wa-ext] WhatsApp Router extension registered (Express): POST /router/inbound, GET /router/health')
}

// ─────────────────────────────────────────────────────────────────────────────
// Fastify
// ─────────────────────────────────────────────────────────────────────────────

type FastifyApp = {
  addHook: (event: string, fn: (req: any, reply: any) => Promise<void>) => void
  get:  (path: string, opts: any, handler: (req: any, reply: any) => Promise<any>) => void
  post: (path: string, opts: any, handler: (req: any, reply: any) => Promise<any>) => void
  log?: { info: (msg: string) => void }
}

/**
 * Register the WhatsApp Router extension as a Fastify plugin.
 * Use with: await app.register(registerWhatsAppExtensionFastify, options)
 */
export async function registerWhatsAppExtensionFastify(
  app: FastifyApp,
  options: WhatsAppExtensionOptions,
): Promise<void> {
  const { routerSecret, processMessage } = options

  app.addHook('preHandler', async (req: any, reply: any) => {
    const incoming = req.headers['x-router-secret']
    if (!incoming || incoming !== routerSecret) {
      reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  app.get('/router/health', {}, async () => ({
    status: 'ok',
    extension: 'whatsapp-router',
    timestamp: new Date().toISOString(),
  }))

  app.post<{ Body: RouterInboundPayload }>('/router/inbound', {
    schema: {
      body: {
        type: 'object',
        required: ['messageId', 'senderNumber', 'tenantId', 'body', 'timestamp'],
        properties: {
          messageId:    { type: 'string' },
          senderNumber: { type: 'string' },
          tenantId:     { type: 'string' },
          body:         { type: 'string' },
          timestamp:    { type: 'number' },
        },
      },
    },
  }, async (request: any, reply: any) => {
    const payload: RouterInboundPayload = request.body
    const { messageId, tenantId, senderNumber } = payload

    app.log?.info(`[wa-ext] Inbound tenant=${tenantId} sender=${senderNumber} msgId=${messageId}`)

    const replyText = await processMessage(payload)

    if (!replyText) {
      return reply.send({ tenantId, replyText: '', metadata: { skipped: true } } satisfies RouterOutboundResponse)
    }

    app.log?.info(`[wa-ext] Reply tenant=${tenantId} msgId=${messageId}`)
    return reply.send({ tenantId, replyText, metadata: {} } satisfies RouterOutboundResponse)
  })

  app.log?.info('[wa-ext] WhatsApp Router extension registered (Fastify): POST /router/inbound, GET /router/health')
}
