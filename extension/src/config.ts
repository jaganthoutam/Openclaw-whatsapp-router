import 'dotenv/config'

export const config = {
  port: parseInt(process.env.PORT ?? '8090', 10),
  routerSecret: process.env.ROUTER_SECRET ?? 'router-secret',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Set to a real OpenClaw base URL when available */
  openclawBaseUrl: process.env.OPENCLAW_BASE_URL ?? '',
} as const
