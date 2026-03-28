import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import type { Server } from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createAdminServer } from '../../src/api/server.js'
import { JsonTenantStore } from '../../src/registry/tenantRegistry.js'
import type { Tenant } from '../../src/types.js'
import type { WhatsAppClient } from '../../src/whatsapp/client.js'

const ROUTER_SECRET = process.env.ROUTER_SECRET ?? 'router-secret'

const seedTenant: Tenant = {
  tenantId: 'outbound-tenant',
  senderNumbers: ['919812345678'],
  openclawExtensionUrl: 'http://ext:8090/router/inbound',
  enabled: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

function makeWaClient(status: 'open' | 'closed' = 'open'): WhatsAppClient {
  return {
    status,
    qrData: null,
    sendToNumber: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn(),
    stop: vi.fn(),
  } as unknown as WhatsAppClient
}

let server: Server
let filePath: string
let waClient: WhatsAppClient

beforeAll(() => {
  filePath = path.join(os.tmpdir(), `outbound-test-${Date.now()}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ tenants: [seedTenant] }))
  const store = new JsonTenantStore(filePath)
  waClient = makeWaClient('open')
  const app = createAdminServer(store, waClient)
  server = app.listen(0)
})

afterAll(() => {
  server.close()
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
})

const auth = () => ({ 'x-router-secret': ROUTER_SECRET })

describe('POST /outbound/send', () => {
  it('sends a message and returns ok', async () => {
    const res = await request(server)
      .post('/outbound/send')
      .set(auth())
      .send({ to: '919812345678', message: 'Your reminder is due', tenantId: 'outbound-tenant' })
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.to).toBe('919812345678')
    expect(waClient.sendToNumber).toHaveBeenCalledWith('919812345678', 'Your reminder is due')
  })

  it('rejects missing X-Router-Secret', async () => {
    const res = await request(server)
      .post('/outbound/send')
      .send({ to: '919812345678', message: 'Hello', tenantId: 'outbound-tenant' })
    expect(res.status).toBe(401)
  })

  it('rejects invalid phone number format', async () => {
    const res = await request(server)
      .post('/outbound/send')
      .set(auth())
      .send({ to: 'bad-number', message: 'Hello', tenantId: 'outbound-tenant' })
    expect(res.status).toBe(400)
  })

  it('rejects missing message', async () => {
    const res = await request(server)
      .post('/outbound/send')
      .set(auth())
      .send({ to: '919812345678', tenantId: 'outbound-tenant' })
    expect(res.status).toBe(400)
  })

  it('rejects number not registered to tenant', async () => {
    const res = await request(server)
      .post('/outbound/send')
      .set(auth())
      .send({ to: '910000000000', message: 'Hello', tenantId: 'outbound-tenant' })
    expect(res.status).toBe(403)
  })

  it('returns 503 when WhatsApp is not connected', async () => {
    filePath = path.join(os.tmpdir(), `outbound-test2-${Date.now()}.json`)
    fs.writeFileSync(filePath, JSON.stringify({ tenants: [seedTenant] }))
    const store2 = new JsonTenantStore(filePath)
    const offlineClient = makeWaClient('closed')
    const app2 = createAdminServer(store2, offlineClient)
    const server2 = app2.listen(0)

    const res = await request(server2)
      .post('/outbound/send')
      .set(auth())
      .send({ to: '919812345678', message: 'Hello', tenantId: 'outbound-tenant' })
    expect(res.status).toBe(503)
    expect(res.body.status).toBe('closed')

    server2.close()
    fs.unlinkSync(filePath)
  })
})
