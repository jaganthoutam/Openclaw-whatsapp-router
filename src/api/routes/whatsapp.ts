import { Router } from 'express'
import QRCode from 'qrcode'
import type { WhatsAppClient } from '../../whatsapp/client.js'
import { adminAuth } from '../middleware/adminAuth.js'

/**
 * Admin routes for WhatsApp session management.
 *
 * GET /admin/whatsapp/status  — current connection state + whether QR is ready
 * GET /admin/whatsapp/qr      — QR code as PNG image (scan with WhatsApp)
 * POST /admin/whatsapp/logout — log out and clear the saved session
 */
export function whatsappRouter(waClient: WhatsAppClient): Router {
  const router = Router()
  router.use(adminAuth)

  // ── GET /admin/whatsapp/status ─────────────────────────────────────────────
  router.get('/status', (_req, res) => {
    res.json({
      status: waClient.status,
      qrReady: waClient.qrData !== null,
      hint:
        waClient.status === 'qr_ready'
          ? 'Scan the QR at GET /admin/whatsapp/qr with WhatsApp on the router phone'
          : waClient.status === 'open'
            ? 'Router number is connected and routing messages'
            : waClient.status === 'logged_out'
              ? 'Session was logged out. Restart the service to generate a new QR.'
              : 'Waiting for connection…',
    })
  })

  // ── GET /admin/whatsapp/qr ─────────────────────────────────────────────────
  router.get('/qr', async (_req, res) => {
    if (!waClient.qrData) {
      res.status(404).json({
        error: 'No QR available',
        hint:
          waClient.status === 'open'
            ? 'Already connected — no QR needed'
            : 'QR not yet generated. Wait a few seconds and retry.',
        status: waClient.status,
      })
      return
    }

    // Return as PNG image — open in browser and scan with WhatsApp
    const png = await QRCode.toBuffer(waClient.qrData, { type: 'png', width: 512 })
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'no-store')
    res.send(png)
  })

  // ── POST /admin/whatsapp/logout ────────────────────────────────────────────
  router.post('/logout', async (_req, res) => {
    await waClient.stop()
    res.json({ message: 'Logged out. Restart the service to re-authenticate.' })
  })

  return router
}
