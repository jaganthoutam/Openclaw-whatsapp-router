import { describe, it, expect } from 'vitest'
import { whatsAppRouterPlugin } from './channel.js'

const validCfg = {
  channels: {
    'whatsapp-router': {
      routerUrl:    'http://router:3000',
      routerSecret: 'test-secret',
      tenantId:     'acme',
      allowFrom:    ['919812345678'],
      dmPolicy:     'allowlist',
    },
  },
}

describe('whatsapp-router channel plugin', () => {
  it('resolves account from config', () => {
    const account = whatsAppRouterPlugin.base.setup.resolveAccount(validCfg as any)
    expect(account.routerUrl).toBe('http://router:3000')
    expect(account.routerSecret).toBe('test-secret')
    expect(account.tenantId).toBe('acme')
    expect(account.allowFrom).toEqual(['919812345678'])
    expect(account.dmPolicy).toBe('allowlist')
  })

  it('defaults allowFrom to [] when not set', () => {
    const cfg = {
      channels: {
        'whatsapp-router': {
          routerUrl:    'http://router:3000',
          routerSecret: 'secret',
          tenantId:     'acme',
        },
      },
    }
    const account = whatsAppRouterPlugin.base.setup.resolveAccount(cfg as any)
    expect(account.allowFrom).toEqual([])
  })

  it('throws when routerUrl is missing', () => {
    const cfg = {
      channels: { 'whatsapp-router': { routerSecret: 'x', tenantId: 'y' } },
    }
    expect(() => whatsAppRouterPlugin.base.setup.resolveAccount(cfg as any)).toThrow(
      'routerUrl is required',
    )
  })

  it('throws when routerSecret is missing', () => {
    const cfg = {
      channels: { 'whatsapp-router': { routerUrl: 'http://x', tenantId: 'y' } },
    }
    expect(() => whatsAppRouterPlugin.base.setup.resolveAccount(cfg as any)).toThrow(
      'routerSecret is required',
    )
  })

  it('throws when tenantId is missing', () => {
    const cfg = {
      channels: { 'whatsapp-router': { routerUrl: 'http://x', routerSecret: 'y' } },
    }
    expect(() => whatsAppRouterPlugin.base.setup.resolveAccount(cfg as any)).toThrow(
      'tenantId is required',
    )
  })

  it('inspects configured account', () => {
    const result = whatsAppRouterPlugin.base.setup.inspectAccount!(validCfg as any, null)
    expect(result.configured).toBe(true)
    expect(result.enabled).toBe(true)
  })

  it('inspects missing config', () => {
    const result = whatsAppRouterPlugin.base.setup.inspectAccount!({ channels: {} } as any, null)
    expect(result.configured).toBe(false)
    expect(result.enabled).toBe(false)
  })
})
