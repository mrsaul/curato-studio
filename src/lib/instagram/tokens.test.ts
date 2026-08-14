import { describe, it, expect, vi, afterEach } from 'vitest'
import { needsRefresh, expiryFromNow, exchangeForLongLived, refreshLongLived } from './tokens'
import * as client from './client'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('needsRefresh', () => {
  const now = new Date('2026-08-14T00:00:00Z')

  it('is true inside the 14 day window', () => {
    expect(needsRefresh(new Date('2026-08-20T00:00:00Z'), now)).toBe(true)
  })

  it('is false outside the window', () => {
    expect(needsRefresh(new Date('2026-09-30T00:00:00Z'), now)).toBe(false)
  })

  it('is true for an already expired token', () => {
    expect(needsRefresh(new Date('2026-08-01T00:00:00Z'), now)).toBe(true)
  })
})

describe('expiryFromNow', () => {
  it('converts seconds into an ISO timestamp', () => {
    const now = new Date('2026-08-14T00:00:00Z')
    expect(expiryFromNow(3600, now)).toBe('2026-08-14T01:00:00.000Z')
  })
})

describe('exchangeForLongLived', () => {
  it('calls the exchange endpoint with app credentials', async () => {
    vi.stubEnv('META_APP_ID', 'APPID')
    vi.stubEnv('META_APP_SECRET', 'SECRET')
    const get = vi.spyOn(client, 'graphGet')
      .mockResolvedValue({ access_token: 'LONG', expires_in: 5184000 } as never)

    const out = await exchangeForLongLived('SHORT')

    expect(out).toEqual({ token: 'LONG', expiresIn: 5184000 })
    expect(get).toHaveBeenCalledWith('oauth/access_token', {
      grant_type: 'fb_exchange_token',
      client_id: 'APPID',
      client_secret: 'SECRET',
      fb_exchange_token: 'SHORT',
    }, '')
  })
})

describe('refreshLongLived', () => {
  it('re-exchanges an existing long-lived token', async () => {
    vi.stubEnv('META_APP_ID', 'APPID')
    vi.stubEnv('META_APP_SECRET', 'SECRET')
    vi.spyOn(client, 'graphGet')
      .mockResolvedValue({ access_token: 'FRESH', expires_in: 5184000 } as never)

    const out = await refreshLongLived('OLD')
    expect(out.token).toBe('FRESH')
  })
})
