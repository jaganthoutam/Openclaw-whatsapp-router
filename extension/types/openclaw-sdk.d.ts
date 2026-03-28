/**
 * Minimal type shim for `openclaw/plugin-sdk/core`.
 *
 * This file allows standalone TypeScript compilation without the `openclaw`
 * package installed. When placed inside a real OpenClaw project, the actual
 * `openclaw` package overrides these declarations via node_modules resolution.
 *
 * Only the surfaces used by this plugin are declared here.
 * For the full SDK reference see: https://docs.openclaw.ai/plugins/sdk-channel-plugins
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

export interface ChannelPluginBase<TAccount> {
  id: string
  setup: {
    resolveAccount(cfg: OpenClawConfig, accountId?: string | null): TAccount
    inspectAccount?(cfg: OpenClawConfig, accountId?: string | null): AccountInspection
  }
}

export interface DmSecurityOptions<TAccount> {
  channelKey: string
  resolvePolicy(account: TAccount): string | undefined
  resolveAllowFrom(account: TAccount): string[]
  defaultPolicy: 'allowlist' | 'open'
}

export interface PairingTextOptions {
  idLabel: string
  message: string
  notify(params: { target: string; code: string }): Promise<void>
}

export interface SendTextParams {
  to: string
  text: string
  accountId?: string | null
  [key: string]: unknown
}

export interface SendMediaParams {
  to: string
  filePath: string
  accountId?: string | null
  [key: string]: unknown
}

export interface SendResult {
  messageId?: string
  [key: string]: unknown
}

export interface OutboundAdapters {
  attachedResults?: {
    sendText?(params: SendTextParams): Promise<SendResult>
  }
  base?: {
    sendMedia?(params: SendMediaParams): Promise<void>
  }
}

export interface ChatChannelPlugin<TAccount> {
  base: ChannelPluginBase<TAccount>
  security?: {
    dm?: DmSecurityOptions<TAccount>
  }
  pairing?: {
    text?: PairingTextOptions
  }
  threading?: {
    topLevelReplyToMode: 'reply' | 'thread' | 'none'
  }
  outbound?: OutboundAdapters
}

export interface HttpRouteRequest {
  method: string
  url: string
  headers: Record<string, string | string[] | undefined>
  body: Buffer | null
  json<T = unknown>(): T
}

export interface HttpRouteResponse {
  statusCode: number
  end(body?: string): void
  setHeader(name: string, value: string): void
}

export interface PluginApi {
  registerHttpRoute(opts: {
    path: string
    auth: 'plugin' | 'openclaw'
    handler(req: HttpRouteRequest, res: HttpRouteResponse): Promise<boolean>
  }): void
  registerCli?(opts: {
    program: { command(name: string): { description(d: string): unknown }
  }}): void
  channel: {
    /** Dispatch an inbound message from the platform into OpenClaw core */
    handleInbound(params: {
      channelId: string
      accountId: string | null
      from: string
      text: string
      messageId?: string
      timestamp?: number
      metadata?: Record<string, unknown>
    }): Promise<void>
  }
}

export interface ChannelPluginEntryOptions<TAccount> {
  id: string
  name: string
  description: string
  plugin: ChatChannelPlugin<TAccount>
  registerFull?(api: PluginApi): void
}

export interface SetupPluginEntry<TAccount> {
  plugin: ChatChannelPlugin<TAccount>
}

export function createChatChannelPlugin<TAccount>(
  opts: ChatChannelPlugin<TAccount>,
): ChatChannelPlugin<TAccount>

export function createChannelPluginBase<TAccount>(
  opts: ChannelPluginBase<TAccount>,
): ChannelPluginBase<TAccount>

export function defineChannelPluginEntry<TAccount>(
  opts: ChannelPluginEntryOptions<TAccount>,
): ChannelPluginEntryOptions<TAccount>

export function defineSetupPluginEntry<TAccount>(
  plugin: ChatChannelPlugin<TAccount>,
): SetupPluginEntry<TAccount>
