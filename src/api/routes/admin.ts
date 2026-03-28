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
    if (!tenant) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json({ tenant })
  })

  // ── POST /admin/tenants ───────────────────────────────────────────────────
  // Creates or fully replaces a tenant mapping
  router.post('/tenants', async (req: Request, res: Response) => {
    const body = req.body as Partial<Tenant>

    if (!body.tenantId || typeof body.tenantId !== 'string') {
      res.status(400).json({ error: 'tenantId is required' })
      return
    }
    if (!Array.isArray(body.senderNumbers) || body.senderNumbers.length === 0) {
      res.status(400).json({ error: 'senderNumbers must be a non-empty array' })
      return
    }
    if (!body.openclawExtensionUrl || typeof body.openclawExtensionUrl !== 'string') {
      res.status(400).json({ error: 'openclawExtensionUrl is required' })
      return
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
  // Partial update
  router.patch('/tenants/:id', async (req: Request, res: Response) => {
    const existing = await tenantStore.getById(req.params['id'] as string)
    if (!existing) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const patch = req.body as Partial<Tenant>
    const updated: Tenant = {
      ...existing,
      ...patch,
      tenantId: existing.tenantId, // immutable
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }

    await tenantStore.upsert(updated)
    res.json({ tenant: updated })
  })

  // ── DELETE /admin/tenants/:id ──────────────────────────────────────────────
  router.delete('/tenants/:id', async (req: Request, res: Response) => {
    const deleted = await tenantStore.delete(req.params['id'] as string)
    if (!deleted) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.status(204).send()
  })

  return router
}
