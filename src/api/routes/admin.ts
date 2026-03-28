import { Router, type Request, type Response } from 'express'
import type { ITenantStore } from '../../registry/ITenantStore.js'
import type { Tenant } from '../../types.js'
import { adminAuth } from '../middleware/adminAuth.js'

export function adminRouter(tenantStore: ITenantStore): Router {
  const router = Router()
  router.use(adminAuth)

  // ── GET /admin/tenants ─────────────────────────────────────────────────────
  router.get('/tenants', async (_req, res: Response) => {
    const tenants = await tenantStore.getAll()
    res.json({ tenants })
  })

  // ── GET /admin/tenants/:id ─────────────────────────────────────────────────
  router.get('/tenants/:id', async (req: Request, res: Response) => {
    const tenant = await tenantStore.getById(req.params['id'] as string)
    if (!tenant) { res.status(404).json({ error: 'Not found' }); return }
    res.json({ tenant })
  })

  // ── POST /admin/tenants ────────────────────────────────────────────────────
  // Creates or fully replaces a tenant mapping.
  // Called by bot-manager when a new OpenClaw instance is linked.
  router.post('/tenants', async (req: Request, res: Response) => {
    const body = req.body as Partial<Tenant>

    if (!body.tenantId || typeof body.tenantId !== 'string') {
      res.status(400).json({ error: 'tenantId is required' }); return
    }
    if (!Array.isArray(body.senderNumbers) || body.senderNumbers.length === 0) {
      res.status(400).json({ error: 'senderNumbers must be a non-empty array' }); return
    }
    if (!body.openclawExtensionUrl || typeof body.openclawExtensionUrl !== 'string') {
      res.status(400).json({ error: 'openclawExtensionUrl is required' }); return
    }

    const now = new Date().toISOString()
    const existing = await tenantStore.getById(body.tenantId)

    const tenant: Tenant = {
      tenantId: body.tenantId,
      senderNumbers: body.senderNumbers,
      openclawExtensionUrl: body.openclawExtensionUrl,
      enabled: body.enabled ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await tenantStore.upsert(tenant)
    res.status(existing ? 200 : 201).json({ tenant })
  })

  // ── PATCH /admin/tenants/:id ───────────────────────────────────────────────
  // Partial update — enable/disable, change extension URL, etc.
  router.patch('/tenants/:id', async (req: Request, res: Response) => {
    const existing = await tenantStore.getById(req.params['id'] as string)
    if (!existing) { res.status(404).json({ error: 'Not found' }); return }

    const patch = req.body as Partial<Tenant>
    const updated: Tenant = {
      ...existing,
      ...patch,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }

    await tenantStore.upsert(updated)
    res.json({ tenant: updated })
  })

  // ── DELETE /admin/tenants/:id ──────────────────────────────────────────────
  router.delete('/tenants/:id', async (req: Request, res: Response) => {
    const deleted = await tenantStore.delete(req.params['id'] as string)
    if (!deleted) { res.status(404).json({ error: 'Not found' }); return }
    res.status(204).send()
  })

  // ── POST /admin/tenants/:id/numbers ───────────────────────────────────────
  // Add a single WhatsApp number to an existing tenant.
  // Called by bot-manager when a user links a new number in Openclaw-UI.
  router.post('/tenants/:id/numbers', async (req: Request, res: Response) => {
    const existing = await tenantStore.getById(req.params['id'] as string)
    if (!existing) { res.status(404).json({ error: 'Tenant not found' }); return }

    const { number } = req.body as { number?: string }
    if (!number || typeof number !== 'string' || !/^\d{7,15}$/.test(number)) {
      res.status(400).json({ error: 'number must be a digits-only E.164 string without +, e.g. "919812345678"' })
      return
    }

    if (existing.senderNumbers.includes(number)) {
      res.status(409).json({ error: 'Number already registered for this tenant', number })
      return
    }

    // Check no other tenant owns this number
    const conflict = await tenantStore.findByNumber(number)
    if (conflict && conflict.tenantId !== existing.tenantId) {
      res.status(409).json({
        error: 'Number already registered to a different tenant',
        conflictingTenantId: conflict.tenantId,
      })
      return
    }

    const updated: Tenant = {
      ...existing,
      senderNumbers: [...existing.senderNumbers, number],
      updatedAt: new Date().toISOString(),
    }

    await tenantStore.upsert(updated)
    res.status(201).json({ tenant: updated, addedNumber: number })
  })

  // ── DELETE /admin/tenants/:id/numbers/:number ──────────────────────────────
  // Remove a single WhatsApp number from a tenant.
  // Called by bot-manager when a user unlinks a number in Openclaw-UI.
  router.delete('/tenants/:id/numbers/:number', async (req: Request, res: Response) => {
    const existing = await tenantStore.getById(req.params['id'] as string)
    if (!existing) { res.status(404).json({ error: 'Tenant not found' }); return }

    const number = req.params['number'] as string
    if (!existing.senderNumbers.includes(number)) {
      res.status(404).json({ error: 'Number not found on this tenant' }); return
    }

    const updated: Tenant = {
      ...existing,
      senderNumbers: existing.senderNumbers.filter((n) => n !== number),
      updatedAt: new Date().toISOString(),
    }

    await tenantStore.upsert(updated)
    res.json({ tenant: updated, removedNumber: number })
  })

  return router
}
