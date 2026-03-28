/** Payload received from the router service */
export interface InboundPayload {
  messageId: string
  senderNumber: string
  tenantId: string
  body: string
  timestamp: number
}

/** Response returned to the router service */
export interface OutboundPayload {
  tenantId: string
  replyText: string
  metadata?: Record<string, unknown>
}

/** OpenClaw request shape */
export interface OpenClawRequest {
  messageId: string
  senderNumber: string
  tenantId: string
  body: string
  timestamp: number
}

/** OpenClaw response shape */
export interface OpenClawResponse {
  replyText: string
  metadata?: Record<string, unknown>
}
