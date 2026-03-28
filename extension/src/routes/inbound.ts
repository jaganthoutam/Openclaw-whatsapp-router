import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { InboundPayload } from '../types.js'
import { MockOpenClawClient } from '../openclaw/mockClient.js'
import { HttpOpenClawClient } from '../openclaw/httpClient.js'
import { config } from '../config.js'
import { logger } from '../logger.js'
import type { IOpenClawClient } from '../openclaw/IOpenClawClient.js'

const openClawClient: IOpenClawClient = config.openclawBaseUrl
  ? new HttpOpenClawClient()
  : new MockOpenClawClient()

export async function inboundRoutes(app: FastifyInstance): Promise<void> {
  // IMPORTANT: must `return` after reply.send() in async Fastify hooks —
  // without it the handler still executes after the 401 is sent.
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = request.headers['x-router-secret']
    if (!secret || secret !== config.routerSecret) {
      logger.warn({ ip: request.ip }, 'Rejected request – invalid X-Router-Secret')
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

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
      const payload = request.body
      const { messageId, tenantId, senderNumber } = payload

      logger.info({ messageId, tenantId, sender: senderNumber }, 'Inbound message received')

      let replyText: string
      let metadata: Record<string, unknown> | undefined

      try {
        const result = await openClawClient.processMessage({
          messageId:    payload.messageId,
          senderNumber: payload.senderNumber,
          tenantId:     payload.tenantId,
          body:         payload.body,
          timestamp:    payload.timestamp,
        })
        replyText = result.replyText
        metadata  = result.metadata
      } catch (err) {
        logger.error({ err, messageId, tenantId }, 'OpenClaw processMessage failed')
        return reply.status(500).send({ error: 'Processing failed' })
      }

      logger.info({ messageId }, 'OpenClaw processing complete')
      return reply.send({ tenantId, replyText, metadata })
    },
  )
}
