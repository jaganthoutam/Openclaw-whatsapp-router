import Fastify from 'fastify'
import { inboundRoutes } from './routes/inbound.js'
import { logger } from './logger.js'

export async function createServer() {
  const app = Fastify({ logger: false, trustProxy: true })

  // ── Health endpoints ─────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    service: 'openclaw-extension',
    timestamp: new Date().toISOString(),
  }))

  app.get('/health/ready', async () => ({
    status: 'ready',
    timestamp: new Date().toISOString(),
  }))

  // ── Route plugins ────────────────────────────────────────────────────────
  await app.register(inboundRoutes)

  app.setErrorHandler((error, _request, reply) => {
    logger.error({ err: error }, 'Unhandled Fastify error')
    reply.status(error.statusCode ?? 500).send({
      error: error.message ?? 'Internal Server Error',
    })
  })

  return app
}
