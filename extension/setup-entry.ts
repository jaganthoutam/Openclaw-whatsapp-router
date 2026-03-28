/**
 * Lightweight setup entry point.
 *
 * OpenClaw loads this instead of index.ts when the plugin is disabled or
 * unconfigured — it avoids pulling in heavy runtime code (HTTP clients,
 * webhook registration) during onboarding and setup flows.
 */

import { defineSetupPluginEntry } from 'openclaw/plugin-sdk/core'
import { whatsAppRouterPlugin } from './src/channel.js'

export default defineSetupPluginEntry(whatsAppRouterPlugin)
