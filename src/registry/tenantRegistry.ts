import fs from 'fs'
import type { Registry, Tenant } from '../types.js'
import type { ITenantStore } from './ITenantStore.js'
import { logger } from '../logger.js'

/**
 * JSON-file-backed tenant store.
 * Reads on construction; persists every mutation synchronously.
 * Replace with a Postgres-backed implementation by implementing ITenantStore.
 */
export class JsonTenantStore implements ITenantStore {
  private registry: Registry

  constructor(private readonly filePath: string) {
    this.registry = this.load()
    logger.debug({ filePath, count: this.registry.tenants.length }, 'Tenant registry loaded')
  }

  private load(): Registry {
    try {
      return JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Registry
    } catch {
      logger.warn({ filePath: this.filePath }, 'Registry file not found – starting empty')
      return { tenants: [] }
    }
  }

  private persist(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.registry, null, 2), 'utf-8')
  }

  async findByNumber(number: string): Promise<Tenant | null> {
    return (
      this.registry.tenants.find(
        (t) => t.enabled && t.senderNumbers.includes(number),
      ) ?? null
    )
  }

  async getAll(): Promise<Tenant[]> {
    return [...this.registry.tenants]
  }

  async getById(tenantId: string): Promise<Tenant | null> {
    return this.registry.tenants.find((t) => t.tenantId === tenantId) ?? null
  }

  async upsert(tenant: Tenant): Promise<void> {
    const idx = this.registry.tenants.findIndex((t) => t.tenantId === tenant.tenantId)
    if (idx >= 0) {
      this.registry.tenants[idx] = tenant
    } else {
      this.registry.tenants.push(tenant)
    }
    this.persist()
    logger.info({ tenantId: tenant.tenantId }, 'Tenant upserted')
  }

  async delete(tenantId: string): Promise<boolean> {
    const before = this.registry.tenants.length
    this.registry.tenants = this.registry.tenants.filter((t) => t.tenantId !== tenantId)
    const deleted = this.registry.tenants.length < before
    if (deleted) {
      this.persist()
      logger.info({ tenantId }, 'Tenant deleted')
    }
    return deleted
  }
}
