import * as client from './client'

const REFRESH_WINDOW_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000

export function needsRefresh(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() - now.getTime() <= REFRESH_WINDOW_DAYS * MS_PER_DAY
}

export function expiryFromNow(expiresInSeconds: number, now: Date = new Date()): string {
  return new Date(now.getTime() + expiresInSeconds * 1000).toISOString()
}

interface TokenResponse { access_token: string; expires_in: number }

/**
 * Both the initial exchange and the refresh use the same endpoint and
 * grant type — Meta treats refreshing as re-exchanging.
 */
async function exchange(token: string): Promise<{ token: string; expiresIn: number }> {
  const res = await client.graphGet<TokenResponse>('oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: process.env.META_APP_ID!,
    client_secret: process.env.META_APP_SECRET!,
    fb_exchange_token: token,
  }, '')
  return { token: res.access_token, expiresIn: res.expires_in }
}

export function exchangeForLongLived(shortLivedToken: string) {
  return exchange(shortLivedToken)
}

export function refreshLongLived(longLivedToken: string) {
  return exchange(longLivedToken)
}
