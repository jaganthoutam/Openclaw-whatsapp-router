import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryDedupStore } from '../../src/dedup/inMemoryDedupStore.js'

describe('InMemoryDedupStore', () => {
  let store: InMemoryDedupStore

  beforeEach(() => {
    store = new InMemoryDedupStore()
  })

  it('returns false for a new message id', async () => {
    expect(await store.isDuplicate('msg-001')).toBe(false)
  })

  it('returns true after markSeen', async () => {
    await store.markSeen('msg-001', 60_000)
    expect(await store.isDuplicate('msg-001')).toBe(true)
  })

  it('returns false after TTL expires', async () => {
    await store.markSeen('msg-expired', 1) // 1 ms TTL
    await new Promise((r) => setTimeout(r, 10))
    expect(await store.isDuplicate('msg-expired')).toBe(false)
  })

  it('increments size correctly', async () => {
    await store.markSeen('a', 60_000)
    await store.markSeen('b', 60_000)
    expect(store.size).toBe(2)
  })

  it('allows the same message to be re-marked after expiry', async () => {
    await store.markSeen('msg-reuse', 1)
    await new Promise((r) => setTimeout(r, 10))
    await store.markSeen('msg-reuse', 60_000)
    expect(await store.isDuplicate('msg-reuse')).toBe(true)
  })
})
