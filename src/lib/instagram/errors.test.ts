import { describe, it, expect } from 'vitest'
import { translateIgError } from './errors'

describe('translateIgError', () => {
  it('flags an expired token as needing reconnect', () => {
    const r = translateIgError({ code: 190, message: 'Error validating access token' })
    expect(r.needsReconnect).toBe(true)
    expect(r.retryable).toBe(false)
    expect(r.userMessage).toBe('Instagram needs reconnecting — ask your director.')
  })

  it.each([4, 32, 613])('treats rate limit code %i as retryable', (code) => {
    const r = translateIgError({ code, message: 'rate limited' })
    expect(r.retryable).toBe(true)
    expect(r.needsReconnect).toBe(false)
    expect(r.userMessage).toBe("Instagram's limit was reached. Try again shortly.")
  })

  it('passes Meta’s own wording through for media errors', () => {
    const r = translateIgError({ code: 2207020, message: 'Media not found' })
    expect(r.userMessage).toBe("Instagram couldn't use this image: Media not found")
    expect(r.retryable).toBe(false)
  })

  it('falls back for an unrecognised code', () => {
    const r = translateIgError({ code: 99999, message: 'Something odd' })
    expect(r.code).toBe('99999')
    expect(r.userMessage).toBe("Instagram didn't accept the post: Something odd")
  })

  it('handles a missing code and message', () => {
    const r = translateIgError({})
    expect(r.code).toBe('unknown')
    expect(r.userMessage).toBe("Instagram didn't accept the post.")
  })
})
