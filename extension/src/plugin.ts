/**
 * WhatsApp Router — Embeddable Fastify Plugin
 * ─────────────────────────────────────────────
 * Drop this into any OpenClaw Fastify server by calling:
 *
 *   import { registerWhatsAppRouterPlugin } from './extension/plugin.js'
 *
 *   if (openclawConfig.whatsappRouter?.enabled) {
 *     await app.register(registerWhatsAppRouterPlugin, {
 *       routerSecret:   openclawConfig.whatsappRouter.routerSecret,
 *       openClawClient: new OpenClawInternalClient(),
 *     })
 *   }
 *
 * Routes registered:
 *   POST /router/inbound   — receives messages from the WhatsApp Router
 *   GET  /router/health    — liveness probe
 */

import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import type { WhatsAppRouterPluginOptions, InboundPayload } from './types.js'

export const registerWhatsAppRouterPlugin: FastifyPluginAsync<WhatsAppRouterPluginOptions> =
  async (app: FastifyInstance, opts: WhatsAppRouterPluginOptions): Promise<void> => {
    const { routerSecret, openClawClient } = opts

    // ── Auth guard ─────────────────────────────────────────────────────────
    // IMPORTANT: must `return` after reply.send() in async Fastify hooks,
    // otherwise the request handler still executes after the 401 is sent.
    app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
      const incoming = request.headers['x-router-secret']
      if (!incoming || incoming !== routerSecret) {
        app.log.warn({ ip: request.ip, url: request.url }, '[wa-router-ext] Rejected – bad X-Router-Secret')
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    })

    // ── Liveness probe ─────────────────────────────────────────────────────
    app.get('/router/health', async () => ({
      status: 'ok',
      extension: 'whatsapp-router',
      timestamp: new Date().toISOString(),
    }))

    // ── Inbound route ──────────────────────────────────────────────────────
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

        let replyText: string
        let metadata: Record<string, unknown> | undefined

        try {
          const result = await openClawClient.processMessage({
            messageId, senderNumber, tenantId, body, timestamp,
          })
          replyText = result.replyText
          metadata  = result.metadata
        } catch (err) {
          app.log.error({ err, messageId, tenantId }, '[wa-router-ext] processMessage failed')
          return reply.status(500).send({ error: 'Processing failed' })
        }

        app.log.info({ messageId }, '[wa-router-ext] Processing complete')
        return reply.send({ tenantId, replyText, metadata })
      },
    )
  }
