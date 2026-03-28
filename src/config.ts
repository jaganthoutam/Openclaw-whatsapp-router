import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  adminSecret: process.env.ADMIN_SECRET ?? 'changeme',
  routerSecret: process.env.ROUTER_SECRET ?? 'router-secret',
  tenantRegistryPath: process.env.TENANT_REGISTRY_PATH ?? './tenant-registry.json',
  whatsappSessionDir: process.env.WHATSAPP_SESSION_DIR ?? './whatsapp-session',
  dedupTtlMs: parseInt(process.env.DEDUP_TTL_MS ?? '86400000', 10), // 24h
  logLevel: process.env.LOG_LEVEL ?? 'info',
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const
