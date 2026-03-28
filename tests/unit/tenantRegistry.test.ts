import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { JsonTenantStore } from '../../src/registry/tenantRegistry.js'
import type { Registry, Tenant } from '../../src/types.js'

function makeTempRegistry(initial: Registry): string {
  const file = path.join(os.tmpdir(), `test-registry-${Date.now()}.json`)
  fs.writeFileSync(file, JSON.stringify(initial, null, 2))
  return file
}

const baseTenant: Tenant = {
  tenantId: 'tenant-a',
  senderNumbers: ['919812345678'],
  openclawExtensionUrl: 'http://localhost:8090/router/inbound',
  enabled: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

describe('JsonTenantStore', () => {
  let filePath: string
  let store: JsonTenantStore

  beforeEach(() => {
    filePath = makeTempRegistry({ tenants: [baseTenant] })
    store = new JsonTenantStore(filePath)
  })

  afterEach(() => {
    fs.unlinkSync(filePath)
  })

  describe('findByNumber', () => {
    it('returns tenant for a registered enabled number', async () => {
      const tenant = await store.findByNumber('919812345678')
      expect(tenant).not.toBeNull()
      expect(tenant?.tenantId).toBe('tenant-a')
    })

    it('returns null for an unknown number', async () => {
      const tenant = await store.findByNumber('999999999999')
      expect(tenant).toBeNull()
    })

    it('returns null when tenant is disabled', async () => {
      const disabled = { ...baseTenant, enabled: false }
      await store.upsert(disabled)
      const tenant = await store.findByNumber('919812345678')
      expect(tenant).toBeNull()
    })
  })

  describe('getAll', () => {
    it('returns all tenants', async () => {
      const tenants = await store.getAll()
      expect(tenants).toHaveLength(1)
      expect(tenants[0].tenantId).toBe('tenant-a')
    })
  })

  describe('getById', () => {
    it('finds existing tenant', async () => {
      const t = await store.getById('tenant-a')
      expect(t?.tenantId).toBe('tenant-a')
    })

    it('returns null for missing id', async () => {
      expect(await store.getById('ghost')).toBeNull()
    })
  })

  describe('upsert', () => {
    it('creates a new tenant', async () => {
      const newTenant: Tenant = {
        ...baseTenant,
        tenantId: 'tenant-b',
        senderNumbers: ['910000000001'],
      }
      await store.upsert(newTenant)
      expect((await store.getAll()).length).toBe(2)
    })

    it('updates an existing tenant', async () => {
      const updated = { ...baseTenant, openclawExtensionUrl: 'http://new-url/router/inbound' }
      await store.upsert(updated)
      const t = await store.getById('tenant-a')
      expect(t?.openclawExtensionUrl).toBe('http://new-url/router/inbound')
      expect((await store.getAll()).length).toBe(1)
    })

    it('persists to disk', async () => {
      const newTenant: Tenant = { ...baseTenant, tenantId: 'tenant-c', senderNumbers: ['910000000002'] }
      await store.upsert(newTenant)
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Registry
      expect(raw.tenants.some((t) => t.tenantId === 'tenant-c')).toBe(true)
    })
  })

  describe('delete', () => {
    it('removes a tenant', async () => {
      const deleted = await store.delete('tenant-a')
      expect(deleted).toBe(true)
      expect((await store.getAll()).length).toBe(0)
    })

    it('returns false for unknown tenant', async () => {
      expect(await store.delete('no-such-tenant')).toBe(false)
    })
  })
})
