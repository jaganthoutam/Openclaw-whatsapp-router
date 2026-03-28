/**
 * Standalone dev/test server for the extension.
 *
 * In production the extension is embedded inside OpenClaw via plugin.ts.
 * This server is used for:
 *   - Local development without a full OpenClaw instance
 *   - Docker Compose integration testing
 *   - The mock client path (OPENCLAW_BASE_URL unset)
 */

import Fastify from 'fastify'
import { config } from './config.js'
import { logger } from './logger.js'
import { registerWhatsAppRouterPlugin } from './plugin.js'
import { MockOpenClawClient } from './openclaw/mockClient.js'
import { HttpOpenClawClient } from './openclaw/httpClient.js'

export async function createServer() {
  const app = Fastify({ logger: false, trustProxy: true })

  app.get('/health', async () => ({
    status: 'ok',
    service: 'openclaw-extension-standalone',
    timestamp: new Date().toISOString(),
  }))

  app.get('/health/ready', async () => ({
    status: 'ready',
    timestamp: new Date().toISOString(),
  }))

  // Use real HTTP client when OPENCLAW_BASE_URL is set, otherwise mock
  const openClawClient = config.openclawBaseUrl
    ? new HttpOpenClawClient()
    : new MockOpenClawClient()

  await app.register(registerWhatsAppRouterPlugin, {
    routerSecret: config.routerSecret,
    openClawClient,
  })

  app.setErrorHandler((error, _request, reply) => {
    logger.error({ err: error }, 'Unhandled error')
    reply.status(error.statusCode ?? 500).send({ error: error.message ?? 'Internal Server Error' })
  })

  return app
}
