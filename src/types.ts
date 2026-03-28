// ─── Tenant Registry ─────────────────────────────────────────────────────────

export interface Tenant {
  tenantId: string
  senderNumbers: string[]       // E.164 numbers without leading +, e.g. "919812345678"
  openclawExtensionUrl: string  // Full URL of the extension /router/inbound endpoint
  enabled: boolean
  createdAt: string             // ISO-8601
  updatedAt: string             // ISO-8601
}

export interface Registry {
  tenants: Tenant[]
}

// ─── Messaging ───────────────────────────────────────────────────────────────

export interface InboundMessage {
  messageId: string
  senderJid: string
  senderNumber: string   // E.164 without +
  body: string
  timestamp: number      // epoch ms
}

// ─── Extension Contract ───────────────────────────────────────────────────────

/** Payload sent by the router to the extension service */
export interface ExtensionRequest {
  messageId: string
  senderNumber: string
  tenantId: string
  body: string
  timestamp: number
}

/** Response expected from the extension service */
export interface ExtensionResponse {
  tenantId: string
  replyText: string
  metadata?: Record<string, unknown>
}
