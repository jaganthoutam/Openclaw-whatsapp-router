import express from 'express'
import type { ITenantStore } from '../registry/ITenantStore.js'
import type { WhatsAppClient } from '../whatsapp/client.js'
import { healthRouter } from './routes/health.js'
import { adminRouter } from './routes/admin.js'
import { whatsappRouter } from './routes/whatsapp.js'
import { logger } from '../logger.js'

export function createAdminServer(tenantStore: ITenantStore, waClient?: WhatsAppClient) {
  const app = express()

  app.use(express.json())

  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, 'HTTP request')
    next()
  })

  app.use('/health', healthRouter)
  app.use('/admin', adminRouter(tenantStore))

  // WhatsApp QR + status routes (only mounted when waClient is provided)
  if (waClient) {
    app.use('/admin/whatsapp', whatsappRouter(waClient))
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' })
  })

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled API error')
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
