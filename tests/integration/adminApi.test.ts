import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Server } from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createAdminServer } from '../../src/api/server.js'
import { JsonTenantStore } from '../../src/registry/tenantRegistry.js'
import type { Tenant } from '../../src/types.js'

// Use the default admin secret that config.ts defaults to when ADMIN_SECRET env is not set
const ADMIN_SECRET = process.env.ADMIN_SECRET ?? 'changeme'

let server: Server
let filePath: string

const seedTenant: Tenant = {
  tenantId: 'seed-tenant',
  senderNumbers: ['911234567890'],
  openclawExtensionUrl: 'http://ext:8090/router/inbound',
  enabled: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

beforeAll(() => {
  filePath = path.join(os.tmpdir(), `admin-test-registry-${Date.now()}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ tenants: [seedTenant] }))
  const store = new JsonTenantStore(filePath)
  const app = createAdminServer(store)
  server = app.listen(0)
})

afterAll(() => {
  server.close()
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
})

const auth = () => ({ 'x-admin-secret': ADMIN_SECRET })

describe('Auth guard', () => {
  it('rejects requests without secret', async () => {
    const res = await request(server).get('/admin/tenants')
    expect(res.status).toBe(401)
  })

  it('rejects requests with wrong secret', async () => {
    const res = await request(server).get('/admin/tenants').set('x-admin-secret', 'wrong')
    expect(res.status).toBe(401)
  })
})

describe('GET /admin/tenants', () => {
  it('returns all tenants', async () => {
    const res = await request(server).get('/admin/tenants').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.tenants).toHaveLength(1)
    expect(res.body.tenants[0].tenantId).toBe('seed-tenant')
  })
})

describe('GET /admin/tenants/:id', () => {
  it('returns a specific tenant', async () => {
    const res = await request(server).get('/admin/tenants/seed-tenant').set(auth())
    expect(res.status).toBe(200)
    expect(res.body.tenant.tenantId).toBe('seed-tenant')
  })

  it('returns 404 for unknown tenant', async () => {
    const res = await request(server).get('/admin/tenants/no-such').set(auth())
    expect(res.status).toBe(404)
  })
})

describe('POST /admin/tenants', () => {
  it('creates a new tenant and returns 201', async () => {
    const res = await request(server)
      .post('/admin/tenants')
      .set(auth())
      .send({
        tenantId: 'new-tenant',
        senderNumbers: ['910000000001'],
        openclawExtensionUrl: 'http://ext:8090/router/inbound',
        enabled: true,
      })
    expect(res.status).toBe(201)
    expect(res.body.tenant.tenantId).toBe('new-tenant')
  })

  it('updates existing tenant and returns 200', async () => {
    const res = await request(server)
      .post('/admin/tenants')
      .set(auth())
      .send({
        tenantId: 'seed-tenant',
        senderNumbers: ['911234567890', '910000000099'],
        openclawExtensionUrl: 'http://ext-updated:8090/router/inbound',
      })
    expect(res.status).toBe(200)
    expect(res.body.tenant.senderNumbers).toContain('910000000099')
  })

  it('rejects missing tenantId', async () => {
    const res = await request(server)
      .post('/admin/tenants')
      .set(auth())
      .send({ senderNumbers: ['910000000002'], openclawExtensionUrl: 'http://x' })
    expect(res.status).toBe(400)
  })

  it('rejects empty senderNumbers', async () => {
    const res = await request(server)
      .post('/admin/tenants')
      .set(auth())
      .send({ tenantId: 'bad', senderNumbers: [], openclawExtensionUrl: 'http://x' })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /admin/tenants/:id', () => {
  it('partially updates a tenant', async () => {
    const res = await request(server)
      .patch('/admin/tenants/seed-tenant')
      .set(auth())
      .send({ enabled: false })
    expect(res.status).toBe(200)
    expect(res.body.tenant.enabled).toBe(false)
    expect(res.body.tenant.tenantId).toBe('seed-tenant') // immutable
  })

  it('returns 404 for unknown tenant', async () => {
    const res = await request(server)
      .patch('/admin/tenants/ghost')
      .set(auth())
      .send({ enabled: false })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /admin/tenants/:id', () => {
  it('deletes a tenant and returns 204', async () => {
    // First create one to delete
    await request(server)
      .post('/admin/tenants')
      .set(auth())
      .send({
        tenantId: 'to-delete',
        senderNumbers: ['910000000003'],
        openclawExtensionUrl: 'http://ext:8090/router/inbound',
      })

    const res = await request(server).delete('/admin/tenants/to-delete').set(auth())
    expect(res.status).toBe(204)
  })

  it('returns 404 when tenant does not exist', async () => {
    const res = await request(server).delete('/admin/tenants/no-such').set(auth())
    expect(res.status).toBe(404)
  })
})
