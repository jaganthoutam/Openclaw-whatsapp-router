/**
 * WhatsApp Router — Embeddable Fastify Plugin
 * ─────────────────────────────────────────────
 * Drop this into any OpenClaw Fastify server by calling:
 *
 *   import { registerWhatsAppRouterPlugin } from './extension/plugin.js'
 *
 *   // Inside your Fastify app setup, after loading openclaw.json:
 *   if (openclawConfig.whatsappRouter?.enabled) {
 *     await app.register(registerWhatsAppRouterPlugin, {
 *       routerSecret:   openclawConfig.whatsappRouter.routerSecret,
 *       openClawClient: new OpenClawInternalClient(),   // your real client
 *       prefix:         '',                             // optional route prefix
 *     })
 *   }
 *
 * The plugin registers:
 *   POST <prefix>/router/inbound   — receives messages from the router service
 *   GET  <prefix>/router/health    — extension liveness (for router to probe)
 *
 * Authentication is checked on every request via X-Router-Secret header.
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import type { WhatsAppRouterPluginOptions, InboundPayload } from './types.js'

export const registerWhatsAppRouterPlugin: FastifyPluginAsync<WhatsAppRouterPluginOptions> =
  async (app: FastifyInstance, opts: WhatsAppRouterPluginOptions): Promise<void> => {
    const { routerSecret, openClawClient } = opts

    // ── Auth: every request to this plugin must carry the shared secret ────
    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      const incoming = request.headers['x-router-secret']
      if (!incoming || incoming !== routerSecret) {
        app.log.warn({ ip: request.ip, url: request.url }, '[wa-router-ext] Rejected – bad X-Router-Secret')
        reply.status(401).send({ error: 'Unauthorized' })
      }
    })

    // ── Liveness probe — router can use this to confirm extension is up ────
    app.get('/router/health', async () => ({
      status: 'ok',
      extension: 'whatsapp-router',
      timestamp: new Date().toISOString(),
    }))

    // ── Main inbound route ─────────────────────────────────────────────────
    app.post<{ Body: InboundPayload }>(
      '/router/inbound',
      {
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
      },
      async (request, reply) => {
        const { messageId, senderNumber, tenantId, body, timestamp } = request.body

        app.log.info({ messageId, tenantId, sender: senderNumber }, '[wa-router-ext] Inbound message')

        const result = await openClawClient.processMessage({
          messageId,
          senderNumber,
          tenantId,
          body,
          timestamp,
        })

        app.log.info({ messageId }, '[wa-router-ext] Processing complete')

        return reply.send({
          tenantId,
          replyText: result.replyText,
          metadata:  result.metadata,
        })
      },
    )
  }
