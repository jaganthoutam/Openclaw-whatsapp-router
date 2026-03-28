import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import type { Server } from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { createAdminServer } from '../../src/api/server.js'
import { JsonTenantStore } from '../../src/registry/tenantRegistry.js'

let server: Server

beforeAll(() => {
  const filePath = path.join(os.tmpdir(), `health-test-registry-${Date.now()}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ tenants: [] }))
  const store = new JsonTenantStore(filePath)
  const app = createAdminServer(store)
  server = app.listen(0) // random port
})

afterAll(() => {
  server.close()
})

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(server).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.service).toBe('openclaw-whatsapp-router')
    expect(typeof res.body.timestamp).toBe('string')
  })
})

describe('GET /health/ready', () => {
  it('returns 200 with ready status', async () => {
    const res = await request(server).get('/health/ready')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ready')
  })
})

describe('unknown routes', () => {
  it('returns 404', async () => {
    const res = await request(server).get('/nonexistent')
    expect(res.status).toBe(404)
  })
})
