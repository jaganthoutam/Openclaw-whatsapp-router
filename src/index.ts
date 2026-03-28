import 'dotenv/config'
import { config } from './config.js'
import { logger } from './logger.js'
import { JsonTenantStore } from './registry/tenantRegistry.js'
import { InMemoryDedupStore } from './dedup/inMemoryDedupStore.js'
import { ExtensionClient } from './extension/extensionClient.js'
import { MessageRouter } from './router/messageRouter.js'
import { WhatsAppClient } from './whatsapp/client.js'
import { createAdminServer } from './api/server.js'

async function main(): Promise<void> {
  logger.info({ env: config.nodeEnv }, 'Starting Openclaw WhatsApp Router')

  // ── Infrastructure ─────────────────────────────────────────────────────────
  const tenantStore = new JsonTenantStore(config.tenantRegistryPath)
  const dedupStore = new InMemoryDedupStore()
  const extensionClient = new ExtensionClient(config.routerSecret)

  // ── Core router ────────────────────────────────────────────────────────────
  const messageRouter = new MessageRouter(
    tenantStore,
    dedupStore,
    extensionClient,
    config.dedupTtlMs,
  )

  // ── Admin HTTP server ──────────────────────────────────────────────────────
  const app = createAdminServer(tenantStore)
  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Admin API listening')
  })

  // ── WhatsApp connection ────────────────────────────────────────────────────
  const whatsappClient = new WhatsAppClient(config.whatsappSessionDir, messageRouter)
  await whatsappClient.connect()

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received')
    await whatsappClient.stop()
    server.close(() => {
      logger.info('HTTP server closed')
      process.exit(0)
    })
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error')
  process.exit(1)
})
