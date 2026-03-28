import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT ?? '8090', 10),
  routerSecret: process.env.ROUTER_SECRET ?? 'router-secret',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Set to a real OpenClaw base URL when available; empty → mock */
  openclawBaseUrl: process.env.OPENCLAW_BASE_URL ?? '',
  /** API key / Bearer token for the OpenClaw REST API */
  openclawApiKey: process.env.OPENCLAW_API_KEY ?? '',
} as const
