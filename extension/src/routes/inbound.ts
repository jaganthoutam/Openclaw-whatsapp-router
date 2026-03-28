import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { InboundPayload } from '../types.js'
import { MockOpenClawClient } from '../openclaw/mockClient.js'
import { HttpOpenClawClient } from '../openclaw/httpClient.js'
import { config } from '../config.js'
import { logger } from '../logger.js'
import type { IOpenClawClient } from '../openclaw/IOpenClawClient.js'

// Select client based on environment
const openClawClient: IOpenClawClient = config.openclawBaseUrl
  ? new HttpOpenClawClient()
  : new MockOpenClawClient()

export async function inboundRoutes(app: FastifyInstance): Promise<void> {
  // Auth hook – validates shared secret on every request to this plugin
  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const secret = request.headers['x-router-secret']
    if (!secret || secret !== config.routerSecret) {
      logger.warn({ ip: request.ip }, 'Rejected request – invalid X-Router-Secret')
      reply.status(401).send({ error: 'Unauthorized' })
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
            messageId: { type: 'string' },
            senderNumber: { type: 'string' },
            tenantId: { type: 'string' },
            body: { type: 'string' },
            timestamp: { type: 'number' },
          },
        },
      },
    },
    async (request, reply) => {
      const payload = request.body

      logger.info(
        { messageId: payload.messageId, tenantId: payload.tenantId, sender: payload.senderNumber },
        'Inbound message received',
      )

      const result = await openClawClient.processMessage({
        messageId: payload.messageId,
        senderNumber: payload.senderNumber,
        tenantId: payload.tenantId,
        body: payload.body,
        timestamp: payload.timestamp,
      })

      logger.info({ messageId: payload.messageId }, 'OpenClaw processing complete')

      return reply.send({
        tenantId: payload.tenantId,
        replyText: result.replyText,
        metadata: result.metadata,
      })
    },
  )
}
