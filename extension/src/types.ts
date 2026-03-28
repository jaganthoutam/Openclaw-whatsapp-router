/**
 * OpenClaw-side types for the WhatsApp Router extension.
 */

// ─── Extension plugin options ─────────────────────────────────────────────────

/** Passed to registerWhatsAppRouterPlugin() from OpenClaw's main server setup */
export interface WhatsAppRouterPluginOptions {
  /** Must match ROUTER_SECRET in the router service (from openclaw.json or env) */
  routerSecret: string
  /** The OpenClaw client implementation to use for processing messages */
  openClawClient: import('./openclaw/IOpenClawClient.js').IOpenClawClient
  /** Optional URL prefix — defaults to '' (routes registered at /router/inbound) */
  prefix?: string
}

// ─── openclaw.json shape for the router section ───────────────────────────────

/** The whatsappRouter block inside openclaw.json, managed by the k8s operator */
export interface OpenClawRouterConfig {
  /** Whether the router extension routes are active */
  enabled: boolean
  /** Shared secret — must match the router service's ROUTER_SECRET */
  routerSecret: string
  /** Sender phone numbers (E.164 without +) routed to this OpenClaw instance */
  senderNumbers: string[]
  /** Display-only: the router service URL (set by operator for reference) */
  routerServiceUrl?: string
  /** ISO-8601 timestamp when this config was last applied by the operator */
  configuredAt?: string
}

/** Top-level openclaw.json shape (extend with your own fields) */
export interface OpenClawConfig {
  tenantId: string
  whatsappRouter?: OpenClawRouterConfig
  [key: string]: unknown
}

// ─── Inbound / outbound contract (unchanged from standalone version) ──────────

export interface InboundPayload {
  messageId: string
  senderNumber: string
  tenantId: string
  body: string
  timestamp: number
}

export interface OutboundPayload {
  tenantId: string
  replyText: string
  metadata?: Record<string, unknown>
}

export interface OpenClawRequest {
  messageId: string
  senderNumber: string
  tenantId: string
  body: string
  timestamp: number
}

export interface OpenClawResponse {
  replyText: string
  metadata?: Record<string, unknown>
}
