import type { IDedupStore } from './IDedupStore.js'

interface Entry {
  expiresAt: number
}

// How often to sweep expired entries (independent of TTL)
const SWEEP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export class InMemoryDedupStore implements IDedupStore {
  private readonly store = new Map<string, Entry>()
  private readonly sweepTimer: NodeJS.Timeout

  constructor() {
    // Prevent unbounded growth: periodically delete entries whose TTL has elapsed.
    // Without this, entries that are never re-read after expiry accumulate forever
    // under sustained message volume.
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
    // Allow the process to exit even if this timer is still running
    this.sweepTimer.unref()
  }

  async isDuplicate(messageId: string): Promise<boolean> {
    const entry = this.store.get(messageId)
    if (!entry) return false
    if (Date.now() > entry.expiresAt) {
      this.store.delete(messageId)
      return false
    }
    return true
  }

  async markSeen(messageId: string, ttlMs: number): Promise<void> {
    this.store.set(messageId, { expiresAt: Date.now() + ttlMs })
  }

  /** Remove all entries past their TTL */
  private sweep(): void {
    const now = Date.now()
    for (const [id, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(id)
    }
  }

  /** Stop the background sweep (call on graceful shutdown) */
  destroy(): void {
    clearInterval(this.sweepTimer)
  }

  /** Exposed for testing */
  get size(): number {
    return this.store.size
  }
}
