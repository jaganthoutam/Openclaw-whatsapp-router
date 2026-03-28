export interface Tenant {
  tenantId: string
  senderNumbers: string[]
  openclawExtensionUrl: string
  enabled: boolean
}

export interface Registry {
  tenants: Tenant[]
}
