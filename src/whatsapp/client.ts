import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { mkdirSync } from 'fs'
import { logger } from '../logger.js'
import type { MessageRouter } from '../router/messageRouter.js'

const RECONNECT_DELAY_MS = 5_000

/**
 * Manages the single Baileys WhatsApp socket.
 * All outbound messages go through this class so the router number identity is preserved.
 */
export class WhatsAppClient {
  private sock: WASocket | null = null
  private stopped = false

  constructor(
    private readonly sessionDir: string,
    private readonly router: MessageRouter,
  ) {
    mkdirSync(sessionDir, { recursive: true })
  }

  async connect(): Promise<void> {
    if (this.stopped) return

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir)
    const { version, isLatest } = await fetchLatestBaileysVersion()
    logger.info({ version, isLatest }, 'Baileys version resolved')

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      // Suppress Baileys' internal verbose logger in production
      logger: logger.child({ module: 'baileys' }) as Parameters<typeof makeWASocket>[0]['logger'],
    })

    this.sock.ev.on('creds.update', saveCreds)

    this.sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        logger.info('WhatsApp connection established')
        return
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        logger.warn({ statusCode, loggedOut }, 'WhatsApp connection closed')

        if (!loggedOut && !this.stopped) {
          logger.info({ delayMs: RECONNECT_DELAY_MS }, 'Scheduling reconnect')
          setTimeout(() => this.connect(), RECONNECT_DELAY_MS)
        }
      }
    })

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return
      for (const msg of messages) {
        await this.handleMessage(msg).catch((err) =>
          logger.error({ err, messageId: msg.key.id }, 'Unhandled error processing message'),
        )
      }
    })
  }

  async stop(): Promise<void> {
    this.stopped = true
    await this.sock?.logout().catch(() => undefined)
    this.sock = null
    logger.info('WhatsApp client stopped')
  }

  private async handleMessage(msg: WAMessage): Promise<void> {
    // Ignore our own outbound messages
    if (msg.key.fromMe) return
    if (!msg.message) return

    const senderJid = msg.key.remoteJid
    if (!senderJid) return

    // Extract text body from various message types
    const body =
      msg.message.conversation ??
      msg.message.extendedTextMessage?.text ??
      msg.message.buttonsResponseMessage?.selectedDisplayText ??
      ''

    if (!body.trim()) return

    const messageId = msg.key.id ?? `${Date.now()}`
    // Normalise JID to bare number: "919812345678@s.whatsapp.net" → "919812345678"
    const senderNumber = senderJid.split('@')[0]
    const timestamp = typeof msg.messageTimestamp === 'number'
      ? msg.messageTimestamp * 1000
      : Date.now()

    const replyText = await this.router.route({
      messageId,
      senderJid,
      senderNumber,
      body,
      timestamp,
    })

    if (replyText && this.sock) {
      await this.sock.sendMessage(senderJid, { text: replyText })
      logger.info({ senderJid, messageId }, 'Reply sent')
    }
  }
}
