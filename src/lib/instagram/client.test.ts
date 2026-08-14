import { describe, it, expect, vi, afterEach } from 'vitest'
import { graphPost, graphGet, GraphApiError, graphUrl } from './client'

afterEach(() => { vi.unstubAllGlobals() })

describe('graphUrl', () => {
  it('builds a versioned URL', () => {
    expect(graphUrl('123/media')).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/123\/media$/)
  })
})

describe('graphPost', () => {
  it('posts params plus the token and returns parsed JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ id: 'container-1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await graphPost<{ id: string }>('123/media', { image_url: 'https://x/y.jpg' }, 'TOKEN')

    expect(out).toEqual({ id: 'container-1' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/123/media')
    expect(init.method).toBe('POST')
    const body = init.body as URLSearchParams
    expect(body.get('image_url')).toBe('https://x/y.jpg')
    expect(body.get('access_token')).toBe('TOKEN')
  })

  it('throws GraphApiError carrying the Meta error body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 190, message: 'bad token' } }),
    }))

    await expect(graphPost('123/media', {}, 'TOKEN')).rejects.toMatchObject({
      name: 'GraphApiError',
      meta: { code: 190, message: 'bad token' },
    })
  })

  it('throws GraphApiError when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => { throw new Error('not json') },
    }))

    await expect(graphPost('123/media', {}, 'T')).rejects.toBeInstanceOf(GraphApiError)
  })
})

describe('graphGet', () => {
  it('puts params in the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ permalink: 'https://instagram.com/p/abc' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const out = await graphGet<{ permalink: string }>('media-1', { fields: 'permalink' }, 'TOKEN')

    expect(out.permalink).toBe('https://instagram.com/p/abc')
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('fields=permalink')
    expect(url).toContain('access_token=TOKEN')
  })
})
