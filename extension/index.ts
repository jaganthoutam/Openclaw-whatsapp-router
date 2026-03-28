/**
 * WhatsApp Router — Channel Plugin Entry Point
 *
 * Drop this folder into your OpenClaw project's extensions/ directory.
 * OpenClaw loads this file for the full runtime registration.
 *
 * Setup steps:
 *   1. Copy extensions/whatsapp-router/ into your OpenClaw project
 *   2. Add to openclaw.json:
 *        {
 *          "channels": {
 *            "whatsapp-router": {
 *              "routerUrl":    "http://whatsapp-router:3000",
 *              "routerSecret": "<secret>",
 *              "tenantId":     "<your-tenant-id>",
 *              "allowFrom":    ["919812345678"],
 *              "dmPolicy":     "allowlist"
 *            }
 *          }
 *        }
 *   3. Register the plugin in your OpenClaw extensions list.
 *   4. The plugin exposes POST /whatsapp-router/inbound — set this URL
 *      as openclawExtensionUrl in the WhatsApp Router's tenant registry.
 */

import { defineChannelPluginEntry } from 'openclaw/plugin-sdk/core'
import { whatsAppRouterPlugin } from './src/channel.js'
import { handleWhatsAppInbound } from './src/inbound.js'

export default defineChannelPluginEntry({
  id: 'whatsapp-router',
  name: 'WhatsApp Router',
  description: 'Receive and send WhatsApp messages via the WhatsApp Router service.',
  plugin: whatsAppRouterPlugin,

  registerFull(api) {
    // Resolve config once during registration so the secret is available
    // in the request handler closure without re-reading config per request.
    let routerSecret: string
    try {
      // resolveAccount throws if config is missing — catch to allow graceful
      // degradation: the route still registers, but returns 503.
      const account = whatsAppRouterPlugin.base.setup.resolveAccount(
        // api.config is the live OpenClawConfig — available in registerFull
        (api as any).config ?? {},
      )
      routerSecret = account.routerSecret
    } catch {
      routerSecret = process.env.WHATSAPP_ROUTER_SECRET ?? ''
    }

    // Inbound webhook — the WhatsApp Router POSTs here for every message
    // addressed to this OpenClaw tenant.
    api.registerHttpRoute({
      path: '/whatsapp-router/inbound',
      auth: 'plugin',  // we verify X-Router-Secret ourselves
      handler: (req, res) => handleWhatsAppInbound(api, routerSecret, req, res),
    })
  },
})
