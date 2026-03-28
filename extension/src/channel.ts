/**
 * WhatsApp Router — OpenClaw Channel Plugin
 * ─────────────────────────────────────────
 * Implements the ChannelPlugin interface for the WhatsApp Router service.
 *
 * Config lives in openclaw.json under cfg.channels["whatsapp-router"]:
 *   {
 *     "routerUrl":    "http://whatsapp-router:3000",
 *     "routerSecret": "<shared secret>",
 *     "tenantId":     "<this openclaw tenant id>",
 *     "allowFrom":    ["919812345678"],   // optional allowlist
 *     "dmPolicy":     "allowlist"         // "allowlist" | "open"
 *   }
 */

import {
  createChatChannelPlugin,
  createChannelPluginBase,
} from 'openclaw/plugin-sdk/core'
import type { OpenClawConfig } from 'openclaw/plugin-sdk/core'
import { RouterApiClient } from './client.js'

// ─── Account shape ────────────────────────────────────────────────────────────

export type WhatsAppRouterAccount = {
  accountId: string | null
  routerUrl: string
  routerSecret: string
  tenantId: string
  allowFrom: string[]
  dmPolicy: string | undefined
}

// ─── Config resolution ────────────────────────────────────────────────────────

function resolveAccount(
  cfg: OpenClawConfig,
  accountId?: string | null,
): WhatsAppRouterAccount {
  const section = (cfg.channels as Record<string, any>)?.['whatsapp-router']

  if (!section?.routerUrl)    throw new Error('whatsapp-router: routerUrl is required')
  if (!section?.routerSecret) throw new Error('whatsapp-router: routerSecret is required')
  if (!section?.tenantId)     throw new Error('whatsapp-router: tenantId is required')

  return {
    accountId:    accountId ?? null,
    routerUrl:    section.routerUrl,
    routerSecret: section.routerSecret,
    tenantId:     section.tenantId,
    allowFrom:    section.allowFrom ?? [],
    dmPolicy:     section.dmPolicy,
  }
}

// ─── Plugin definition ────────────────────────────────────────────────────────

export const whatsAppRouterPlugin = createChatChannelPlugin<WhatsAppRouterAccount>({
  base: createChannelPluginBase({
    id: 'whatsapp-router',
    setup: {
      resolveAccount,

      inspectAccount(cfg, accountId) {
        const section = (cfg.channels as Record<string, any>)?.['whatsapp-router']
        const configured = Boolean(section?.routerUrl && section?.routerSecret && section?.tenantId)
        return {
          enabled: configured && section?.enabled !== false,
          configured,
          routerUrl: section?.routerUrl ?? '(not set)',
          tenantId:  section?.tenantId  ?? '(not set)',
        }
      },
    },
  }),

  // ── DM security ─────────────────────────────────────────────────────────────
  // Controls which WhatsApp numbers can reach this OpenClaw instance.
  // "allowlist" → only numbers in allowFrom; "open" → anyone can message.
  security: {
    dm: {
      channelKey:      'whatsapp-router',
      resolvePolicy:   (account) => account.dmPolicy,
      resolveAllowFrom:(account) => account.allowFrom,
      defaultPolicy:   'allowlist',
    },
  },

  // ── Pairing ──────────────────────────────────────────────────────────────────
  // When a new number messages the bot, OpenClaw sends a pairing code back
  // to verify the user's identity before adding them to the allowlist.
  pairing: {
    text: {
      idLabel: 'WhatsApp phone number (E.164 without +)',
      message: 'Send this code to your WhatsApp number to verify:',
      notify: async ({ target, code }) => {
        // `target` is the phone number from resolveAccount's allowFrom pairing flow.
        // We need the resolved account to get routerUrl/secret/tenantId.
        // OpenClaw will have called resolveAccount before invoking notify,
        // so the values are available via closure from the enclosing plugin config.
        // For the pairing flow we send the code via a direct outbound call.
        //
        // Note: At notify() time we don't yet have the account object injected
        // by the SDK. The RouterApiClient is constructed from env vars as a
        // fallback when pairing is initiated before the account is fully wired.
        // In most deployments the account IS resolved at this point — if your
        // OpenClaw version passes account to notify(), use it instead.
        const routerUrl    = process.env.WHATSAPP_ROUTER_URL    ?? ''
        const routerSecret = process.env.WHATSAPP_ROUTER_SECRET ?? ''
        const tenantId     = process.env.WHATSAPP_ROUTER_TENANT ?? ''

        if (!routerUrl) {
          throw new Error('WHATSAPP_ROUTER_URL env var required for pairing notify')
        }

        const client = new RouterApiClient(routerUrl, routerSecret, tenantId)
        await client.sendText(target, `OpenClaw pairing code: ${code}`)
      },
    },
  },

  // ── Threading ────────────────────────────────────────────────────────────────
  threading: { topLevelReplyToMode: 'reply' },

  // ── Outbound ─────────────────────────────────────────────────────────────────
  // Called by OpenClaw core whenever it needs to send a message to a user —
  // replies, proactive cron messages, reminders, etc.
  outbound: {
    attachedResults: {
      sendText: async (params) => {
        const account = params.account as WhatsAppRouterAccount | undefined

        const routerUrl    = account?.routerUrl    ?? process.env.WHATSAPP_ROUTER_URL    ?? ''
        const routerSecret = account?.routerSecret ?? process.env.WHATSAPP_ROUTER_SECRET ?? ''
        const tenantId     = account?.tenantId     ?? process.env.WHATSAPP_ROUTER_TENANT ?? ''

        if (!routerUrl) throw new Error('whatsapp-router: routerUrl not resolved for outbound send')

        const client = new RouterApiClient(routerUrl, routerSecret, tenantId)
        const result = await client.sendText(params.to, params.text)
        return { messageId: result.messageId }
      },
    },
  },
})
