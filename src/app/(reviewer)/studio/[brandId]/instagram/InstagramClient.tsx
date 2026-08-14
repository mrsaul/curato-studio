'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, InlineError } from '@/components/ui'

interface AccountView {
  username: string | null
  expiresAt: string
  needsReconnect: boolean
}

const MESSAGES: Record<string, string> = {
  connected: '',
  no_business_account: 'That account has no Instagram Business account attached to a Facebook Page.',
  exchange_failed: 'Instagram sign-in did not complete. Try again.',
  save_failed: 'Could not save the connection. Try again.',
  bad_state: 'That sign-in link expired. Try again.',
  forbidden: 'You do not manage this brand.',
}

export default function InstagramClient({
  brandId, account,
}: { brandId: string; account: AccountView | null }) {
  const router = useRouter()
  const params = useSearchParams()
  const [busy, setBusy] = useState(false)
  const flag = params.get('ig')
  const error = flag && flag !== 'connected' ? (MESSAGES[flag] ?? 'Something went wrong.') : null

  async function disconnect() {
    setBusy(true)
    await fetch(`/api/instagram/account?brandId=${brandId}`, { method: 'DELETE' })
    router.refresh()
    setBusy(false)
  }

  if (!account) {
    return (
      <div>
        {error && <div style={{ marginBottom: 'var(--space-4)' }}><InlineError>{error}</InlineError></div>}
        <p style={{
          fontSize: 'var(--text-md)', color: 'var(--ink-soft)',
          lineHeight: 'var(--leading-relaxed)', marginBottom: 'var(--space-5)',
        }}>
          Connect this brand&apos;s Instagram so approved posts can be published from Curato.
          The account must be an Instagram Business or Creator account linked to a Facebook Page.
        </p>
        <Button variant="cta" fullWidth onClick={() => { window.location.href = `/api/instagram/connect?brandId=${brandId}` }}>
          Connect Instagram
        </Button>
      </div>
    )
  }

  return (
    <div>
      {account.needsReconnect && (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--alert)',
          borderRadius: 'var(--r-lg)', padding: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--ink)', lineHeight: 'var(--leading-normal)' }}>
            This connection stopped working. Reconnect to keep publishing.
          </p>
        </div>
      )}

      <p style={{ fontSize: 'var(--text-md)', color: 'var(--ink)', marginBottom: 'var(--space-2)' }}>
        {account.username ? `@${account.username}` : 'Connected'}
      </p>
      <p style={{
        fontSize: 'var(--text-base)', color: 'var(--ink-faint)',
        fontFamily: 'var(--mono)', marginBottom: 'var(--space-6)',
      }}>
        Renews {new Date(account.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </p>

      <div style={{ marginBottom: 'var(--space-3)' }}>
        <Button variant="cta" fullWidth onClick={() => { window.location.href = `/api/instagram/connect?brandId=${brandId}` }}>
          Reconnect
        </Button>
      </div>
      <Button variant="ghost" fullWidth onClick={disconnect} disabled={busy}>
        {busy ? 'Disconnecting…' : 'Disconnect'}
      </Button>
    </div>
  )
}
