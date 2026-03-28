import { Router } from 'express'

export const healthRouter = Router()

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'openclaw-whatsapp-router',
    timestamp: new Date().toISOString(),
  })
})

healthRouter.get('/ready', (_req, res) => {
  // Extend this to check WhatsApp connection state, disk space, etc.
  res.json({ status: 'ready', timestamp: new Date().toISOString() })
})
