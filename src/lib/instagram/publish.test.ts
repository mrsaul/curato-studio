import { describe, it, expect, vi, afterEach } from 'vitest'
import { containerParams, publishImage } from './publish'
import * as client from './client'

afterEach(() => { vi.restoreAllMocks() })

describe('containerParams', () => {
  it('includes the caption for a feed post', () => {
    expect(containerParams('feed', 'https://x/y.jpg', 'Hello')).toEqual({
      image_url: 'https://x/y.jpg',
      caption: 'Hello',
    })
  })

  it('omits the caption for a story and sets media_type', () => {
    expect(containerParams('story', 'https://x/y.jpg', 'Hello')).toEqual({
      image_url: 'https://x/y.jpg',
      media_type: 'STORIES',
    })
  })

  it('omits an empty caption on a feed post', () => {
    expect(containerParams('feed', 'https://x/y.jpg', '')).toEqual({
      image_url: 'https://x/y.jpg',
    })
  })
})

describe('publishImage', () => {
  it('creates a container, publishes it, then reads the permalink', async () => {
    const post = vi.spyOn(client, 'graphPost')
      .mockResolvedValueOnce({ id: 'container-1' } as never)
      .mockResolvedValueOnce({ id: 'media-9' } as never)
    const get = vi.spyOn(client, 'graphGet')
      .mockResolvedValue({ permalink: 'https://instagram.com/p/abc' } as never)

    const out = await publishImage({
      igUserId: '123', token: 'T', format: 'feed',
      imageUrl: 'https://x/y.jpg', caption: 'Hi',
    })

    expect(out).toEqual({ mediaId: 'media-9', permalink: 'https://instagram.com/p/abc' })
    expect(post).toHaveBeenNthCalledWith(1, '123/media',
      { image_url: 'https://x/y.jpg', caption: 'Hi' }, 'T')
    expect(post).toHaveBeenNthCalledWith(2, '123/media_publish',
      { creation_id: 'container-1' }, 'T')
    expect(get).toHaveBeenCalledWith('media-9', { fields: 'permalink' }, 'T')
  })

  it('still returns the media id when the permalink lookup fails', async () => {
    vi.spyOn(client, 'graphPost')
      .mockResolvedValueOnce({ id: 'container-1' } as never)
      .mockResolvedValueOnce({ id: 'media-9' } as never)
    vi.spyOn(client, 'graphGet').mockRejectedValue(new Error('nope'))

    const out = await publishImage({
      igUserId: '123', token: 'T', format: 'story', imageUrl: 'https://x/y.jpg',
    })

    expect(out).toEqual({ mediaId: 'media-9', permalink: null })
  })

  it('does not call media_publish when the container fails', async () => {
    const post = vi.spyOn(client, 'graphPost').mockRejectedValue(new Error('boom'))

    await expect(publishImage({
      igUserId: '123', token: 'T', format: 'feed', imageUrl: 'https://x/y.jpg',
    })).rejects.toThrow('boom')

    expect(post).toHaveBeenCalledTimes(1)
  })
})
