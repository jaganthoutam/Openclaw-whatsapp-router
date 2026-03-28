import type { IDedupStore } from './IDedupStore.js'

interface Entry {
  expiresAt: number
}

export class InMemoryDedupStore implements IDedupStore {
  private readonly store = new Map<string, Entry>()

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

  /** Exposed for testing – returns current store size */
  get size(): number {
    return this.store.size
  }
}
