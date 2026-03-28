/**
 * Duplicate-message protection interface.
 * MVP ships InMemoryDedupStore; swap in Redis later.
 */
export interface IDedupStore {
  /** Returns true if this messageId was already processed */
  isDuplicate(messageId: string): Promise<boolean>
  /** Record messageId as seen; entry expires after ttlMs */
  markSeen(messageId: string, ttlMs: number): Promise<void>
}
