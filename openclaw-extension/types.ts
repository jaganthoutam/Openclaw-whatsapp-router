/**
 * All types for the WhatsApp Router ↔ OpenClaw extension.
 * No external dependencies — copy this file as-is.
 */

/** Payload the WhatsApp Router POSTs to OpenClaw */
export interface RouterInboundPayload {
  messageId:    string   // Baileys message ID (used for dedup)
  senderNumber: string   // E.164 without '+', e.g. "919812345678"
  tenantId:     string   // tenant identifier from the router registry
  body:         string   // text content of the WhatsApp message
  timestamp:    number   // epoch ms
}

/** What OpenClaw returns to the router */
export interface RouterOutboundResponse {
  tenantId:  string
  replyText: string
  metadata?: Record<string, unknown>
}

/**
 * The single function you provide from inside OpenClaw.
 * Receives the inbound message, returns the text reply to send back.
 * Return null/undefined to send no reply.
 */
export type ProcessMessageFn = (
  payload: RouterInboundPayload,
) => Promise<string | null | undefined>

/** Options passed to registerWhatsAppExtension() */
export interface WhatsAppExtensionOptions {
  /**
   * Must match ROUTER_SECRET configured in the WhatsApp Router service.
   * The router sends this in the X-Router-Secret header on every request.
   */
  routerSecret: string

  /**
   * Your OpenClaw message processing function.
   * This is the bridge between the router and OpenClaw's internal logic.
   *
   * Example:
   *   processMessage: async (payload) => {
   *     const session = await openClaw.getSession(payload.senderNumber)
   *     const result  = await openClaw.chat(session, payload.body)
   *     return result.reply
   *   }
   */
  processMessage: ProcessMessageFn
}
