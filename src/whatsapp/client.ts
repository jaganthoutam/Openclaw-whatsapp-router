import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { mkdirSync } from 'fs'
import { randomBytes } from 'crypto'
import { config } from '../config.js'
import { logger } from '../logger.js'
import type { MessageRouter } from '../router/messageRouter.js'

const RECONNECT_DELAY_MS = 5_000

export type WaStatus = 'connecting' | 'qr_ready' | 'open' | 'closed' | 'logged_out'

/**
 * Manages the single Baileys WhatsApp socket.
 * All outbound messages go through this class so the router number identity is preserved.
 *
 * QR flow:
 *   1. Call connect() — Baileys emits a QR string once auth state has no saved session.
 *   2. Poll GET /admin/whatsapp/status to check status === 'qr_ready'.
 *   3. GET /admin/whatsapp/qr returns a PNG image to scan with WhatsApp on the router phone.
 *   4. After scanning, status transitions to 'open' and qrData clears.
 */
export class WhatsAppClient {
  private sock: WASocket | null = null
  private stopped = false

  /** Latest raw QR string from Baileys — null when not needed */
  public qrData: string | null = null
  /** Current connection state */
  public status: WaStatus = 'connecting'

  constructor(
    private readonly sessionDir: string,
    private readonly router: MessageRouter,
  ) {
    mkdirSync(sessionDir, { recursive: true })
  }

  async connect(): Promise<void> {
    if (this.stopped) return

    this.status = 'connecting'
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir)
    const { version, isLatest } = await fetchLatestBaileysVersion()
    logger.info({ version, isLatest }, 'Baileys version resolved')

    // Baileys' ILogger interface is satisfied by pino (it's what Baileys uses
    // internally). We pass a child logger scoped to 'baileys' and suppress its
    // verbose DEBUG/TRACE output in production by capping at 'warn'.
    const baileysLogger = logger.child({ module: 'baileys' })
    baileysLogger.level = config.nodeEnv === 'development' ? 'info' : 'warn'

    this.sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      logger: baileysLogger as any,
    })

    this.sock.ev.on('creds.update', saveCreds)

    this.sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      // Baileys emits qr inside connection.update when a new QR is available
      if (qr) {
        this.qrData = qr
        this.status = 'qr_ready'
        logger.info('QR code ready — scan via GET /admin/whatsapp/qr or check terminal')
      }

      if (connection === 'open') {
        this.qrData = null          // QR no longer needed after auth
        this.status = 'open'
        logger.info('WhatsApp connection established')
        return
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
        const loggedOut = statusCode === DisconnectReason.loggedOut

        this.status = loggedOut ? 'logged_out' : 'closed'
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

  /**
   * Send a text message to any WhatsApp number.
   * Called by the outbound API so OpenClaw can push reminders / cron messages.
   *
   * number: E.164 digits without '+', e.g. "919812345678"
   */
  async sendToNumber(number: string, text: string): Promise<void> {
    if (this.status !== 'open' || !this.sock) {
      throw new Error(`Cannot send — WhatsApp status is '${this.status}'`)
    }
    const jid = `${number}@s.whatsapp.net`
    await this.sock.sendMessage(jid, { text })
    logger.info({ to: number }, 'Outbound message sent')
  }

  async stop(): Promise<void> {
    this.stopped = true
    this.status = 'closed'
    await this.sock?.logout().catch(() => undefined)
    this.sock = null
    logger.info('WhatsApp client stopped')
  }

  private async handleMessage(msg: WAMessage): Promise<void> {
    if (msg.key.fromMe) return
    if (!msg.message) return

    const senderJid = msg.key.remoteJid
    if (!senderJid) return

    const body =
      msg.message.conversation ??
      msg.message.extendedTextMessage?.text ??
      msg.message.buttonsResponseMessage?.selectedDisplayText ??
      ''

    if (!body.trim()) return

    // Use Baileys message ID; fall back to a crypto random (Date.now() alone
    // collides when multiple messages arrive in the same millisecond)
    const messageId = msg.key.id ?? randomBytes(8).toString('hex')

    const senderNumber = senderJid.split('@')[0]

    // msg.messageTimestamp is typed as number | Long | null | undefined.
    // The `Long` type (from the `long` npm package used by protobufjs) has a
    // .toNumber() method. A plain typeof check for 'number' misses Long values,
    // causing all Long-typed timestamps to silently fall back to Date.now().
    const ts = msg.messageTimestamp
    const timestamp = ts == null
      ? Date.now()
      : typeof ts === 'number'
        ? ts * 1000
        : (ts as { toNumber(): number }).toNumber() * 1000

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
