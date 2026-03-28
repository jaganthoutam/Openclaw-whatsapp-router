import type { InboundMessage } from '../types.js'
import type { ITenantStore } from '../registry/ITenantStore.js'
import type { IDedupStore } from '../dedup/IDedupStore.js'
import type { ExtensionClient } from '../extension/extensionClient.js'
import { logger } from '../logger.js'

/**
 * Core routing logic:
 *   InboundMessage → dedup check → tenant lookup → extension forward → reply text
 */
export class MessageRouter {
  constructor(
    private readonly tenantStore: ITenantStore,
    private readonly dedupStore: IDedupStore,
    private readonly extensionClient: ExtensionClient,
    private readonly dedupTtlMs: number,
  ) {}

  async route(msg: InboundMessage): Promise<string | null> {
    const log = logger.child({ messageId: msg.messageId, sender: msg.senderNumber })

    // ── 1. Duplicate protection ────────────────────────────────────────────
    if (await this.dedupStore.isDuplicate(msg.messageId)) {
      log.warn('Duplicate message – skipping')
      return null
    }
    await this.dedupStore.markSeen(msg.messageId, this.dedupTtlMs)

    // ── 2. Tenant resolution ───────────────────────────────────────────────
    const tenant = await this.tenantStore.findByNumber(msg.senderNumber)
    if (!tenant) {
      log.warn('No enabled tenant found for sender – message dropped')
      return null
    }

    log.info({ tenantId: tenant.tenantId }, 'Tenant resolved – forwarding to extension')

    // ── 3. Extension call ──────────────────────────────────────────────────
    try {
      const response = await this.extensionClient.forward(
        {
          messageId: msg.messageId,
          senderNumber: msg.senderNumber,
          tenantId: tenant.tenantId,
          body: msg.body,
          timestamp: msg.timestamp,
        },
        tenant.openclawExtensionUrl,
      )

      log.info({ tenantId: tenant.tenantId }, 'Extension response received – sending reply')
      return response.replyText
    } catch (err) {
      log.error({ err }, 'Extension call failed – no reply sent')
      return null
    }
  }
}
