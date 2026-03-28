/**
 * Runtime shim for `openclaw/plugin-sdk/core` — used in tests and standalone
 * compilation only. In a real OpenClaw project the actual package resolves this.
 */

export interface OpenClawConfig {
  channels?: Record<string, unknown>
  [key: string]: unknown
}

export interface AccountInspection {
  enabled: boolean
  configured: boolean
  [key: string]: unknown
}

export function createChannelPluginBase<TAccount>(opts: any) { return opts }
export function createChatChannelPlugin<TAccount>(opts: any) { return opts }
export function defineChannelPluginEntry(opts: any) { return opts }
export function defineSetupPluginEntry(plugin: any) { return { plugin } }
