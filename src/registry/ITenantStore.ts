import type { Tenant } from '../types.js'

/**
 * Persistence interface for tenant mappings.
 * The MVP ships JsonTenantStore; swap in a Postgres implementation later.
 */
export interface ITenantStore {
  findByNumber(number: string): Promise<Tenant | null>
  getAll(): Promise<Tenant[]>
  getById(tenantId: string): Promise<Tenant | null>
  upsert(tenant: Tenant): Promise<void>
  delete(tenantId: string): Promise<boolean>
}
