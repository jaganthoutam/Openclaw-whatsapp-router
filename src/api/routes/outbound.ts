import { Router, type Request, type Response } from 'express'
import type { WhatsAppClient } from '../../whatsapp/client.js'
import type { ITenantStore } from '../../registry/ITenantStore.js'
import { config } from '../../config.js'
import { logger } from '../../logger.js'

/**
 * Outbound send API — called by OpenClaw extensions to push messages
 * (reminders, cron notifications, alerts) through the router number.
 *
 * Auth: X-Router-Secret header (same secret the router uses when calling the
 * extension inbound endpoint — shared between router and each OpenClaw instance).
 *
 * POST /outbound/send
 * {
 *   "to":       "919812345678",   // E.164 without +
 *   "message":  "Your reminder",
 *   "tenantId": "tenant-a"        // used to verify the caller owns this number
 * }
 */
export function outboundRouter(waClient: WhatsAppClient, tenantStore: ITenantStore): Router {
  const router = Router()

  // Auth: extension sends X-Router-Secret (not X-Admin-Secret)
  router.use((req: Request, res: Response, next) => {
    const secret = req.headers['x-router-secret']
    if (!secret || secret !== config.routerSecret) {
      logger.warn({ ip: req.ip }, 'Outbound: rejected — bad X-Router-Secret')
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    next()
  })

  router.post('/send', async (req: Request, res: Response) => {
    const { to, message, tenantId } = req.body as {
      to?: string
      message?: string
      tenantId?: string
    }

    if (!to || typeof to !== 'string' || !/^\d{7,15}$/.test(to)) {
      res.status(400).json({ error: 'to must be a digits-only E.164 number without +, e.g. "919812345678"' })
      return
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      res.status(400).json({ error: 'message is required' })
      return
    }
    if (!tenantId || typeof tenantId !== 'string') {
      res.status(400).json({ error: 'tenantId is required' })
      return
    }

    // Verify the tenant exists and is enabled
    const tenant = await tenantStore.getById(tenantId)
    if (!tenant || !tenant.enabled) {
      res.status(403).json({ error: 'Tenant not found or disabled' })
      return
    }

    // Verify this number belongs to the claiming tenant (prevents cross-tenant sends)
    if (!tenant.senderNumbers.includes(to)) {
      res.status(403).json({
        error: 'Number is not registered to this tenant',
        hint: 'Register the number via POST /admin/tenants/:id/numbers first',
      })
      return
    }

    if (waClient.status !== 'open') {
      res.status(503).json({
        error: 'WhatsApp not connected',
        status: waClient.status,
        hint: waClient.status === 'qr_ready'
          ? 'Scan the QR at GET /admin/whatsapp/qr to connect'
          : 'Router is reconnecting — retry shortly',
      })
      return
    }

    try {
      await waClient.sendToNumber(to, message)
      logger.info({ to, tenantId }, 'Outbound message dispatched')
      res.json({ ok: true, to, tenantId, sentAt: new Date().toISOString() })
    } catch (err) {
      logger.error({ err, to, tenantId }, 'Outbound send failed')
      res.status(500).json({ error: 'Send failed', detail: (err as Error).message })
    }
  })

  return router
}
