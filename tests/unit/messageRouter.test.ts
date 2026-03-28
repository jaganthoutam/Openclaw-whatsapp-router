import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MessageRouter } from '../../src/router/messageRouter.js'
import type { ITenantStore } from '../../src/registry/ITenantStore.js'
import type { IDedupStore } from '../../src/dedup/IDedupStore.js'
import type { ExtensionClient } from '../../src/extension/extensionClient.js'
import type { Tenant, InboundMessage, ExtensionResponse } from '../../src/types.js'

const mockTenant: Tenant = {
  tenantId: 'tenant-a',
  senderNumbers: ['919812345678'],
  openclawExtensionUrl: 'http://localhost:8090/router/inbound',
  enabled: true,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
}

const baseMessage: InboundMessage = {
  messageId: 'msg-001',
  senderJid: '919812345678@s.whatsapp.net',
  senderNumber: '919812345678',
  body: 'Hello',
  timestamp: Date.now(),
}

function makeMocks() {
  const tenantStore: ITenantStore = {
    findByNumber: vi.fn().mockResolvedValue(mockTenant),
    getAll: vi.fn().mockResolvedValue([mockTenant]),
    getById: vi.fn().mockResolvedValue(mockTenant),
    upsert: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(true),
  }

  const dedupStore: IDedupStore = {
    isDuplicate: vi.fn().mockResolvedValue(false),
    markSeen: vi.fn().mockResolvedValue(undefined),
  }

  const extensionResponse: ExtensionResponse = {
    tenantId: 'tenant-a',
    replyText: 'Hello back!',
    metadata: {},
  }

  const extensionClient = {
    forward: vi.fn().mockResolvedValue(extensionResponse),
  } as unknown as ExtensionClient

  return { tenantStore, dedupStore, extensionClient }
}

describe('MessageRouter', () => {
  let router: MessageRouter
  let mocks: ReturnType<typeof makeMocks>

  beforeEach(() => {
    mocks = makeMocks()
    router = new MessageRouter(mocks.tenantStore, mocks.dedupStore, mocks.extensionClient, 86_400_000)
  })

  it('routes a message and returns reply text', async () => {
    const reply = await router.route(baseMessage)
    expect(reply).toBe('Hello back!')
    expect(mocks.extensionClient.forward).toHaveBeenCalledOnce()
  })

  it('calls markSeen after processing', async () => {
    await router.route(baseMessage)
    expect(mocks.dedupStore.markSeen).toHaveBeenCalledWith('msg-001', 86_400_000)
  })

  it('drops duplicate messages', async () => {
    vi.mocked(mocks.dedupStore.isDuplicate).mockResolvedValue(true)
    const reply = await router.route(baseMessage)
    expect(reply).toBeNull()
    expect(mocks.extensionClient.forward).not.toHaveBeenCalled()
  })

  it('drops message when no tenant found', async () => {
    vi.mocked(mocks.tenantStore.findByNumber).mockResolvedValue(null)
    const reply = await router.route(baseMessage)
    expect(reply).toBeNull()
    expect(mocks.extensionClient.forward).not.toHaveBeenCalled()
  })

  it('returns null when extension call fails', async () => {
    vi.mocked(mocks.extensionClient.forward).mockRejectedValue(new Error('timeout'))
    const reply = await router.route(baseMessage)
    expect(reply).toBeNull()
  })

  it('forwards correct payload to extension', async () => {
    await router.route(baseMessage)
    expect(mocks.extensionClient.forward).toHaveBeenCalledWith(
      {
        messageId: 'msg-001',
        senderNumber: '919812345678',
        tenantId: 'tenant-a',
        body: 'Hello',
        timestamp: baseMessage.timestamp,
      },
      mockTenant.openclawExtensionUrl,
    )
  })
})
