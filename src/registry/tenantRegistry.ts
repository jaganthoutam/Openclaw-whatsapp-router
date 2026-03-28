import fs from 'fs'
import { Registry, Tenant } from '../types.js'

export class TenantRegistry {
  private data: Registry

  constructor(private file: string) {
    this.data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  }

  findTenant(sender: string): Tenant | null {
    return (
      this.data.tenants.find(t =>
        t.enabled && t.senderNumbers.includes(sender)
      ) || null
    )
  }
}
