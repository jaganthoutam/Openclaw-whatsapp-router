import 'dotenv/config'
import { config } from './config.js'
import { logger } from './logger.js'
import { createServer } from './server.js'

async function main(): Promise<void> {
  logger.info({ env: config.nodeEnv }, 'Starting Openclaw Extension Service')

  const app = await createServer()

  await app.listen({ port: config.port, host: '0.0.0.0' })
  logger.info({ port: config.port }, 'Extension service listening')

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received')
    await app.close()
    logger.info('Extension service stopped')
    process.exit(0)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal startup error')
  process.exit(1)
})
