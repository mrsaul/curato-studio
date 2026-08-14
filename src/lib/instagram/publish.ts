import { PublishFormat } from '@/types/instagram'
import * as client from './client'

/** Stories ignore captions, so we do not send one. */
export function containerParams(
  format: PublishFormat,
  imageUrl: string,
  caption?: string,
): Record<string, string> {
  if (format === 'story') {
    return { image_url: imageUrl, media_type: 'STORIES' }
  }
  return caption ? { image_url: imageUrl, caption } : { image_url: imageUrl }
}

export interface PublishInput {
  igUserId: string
  token: string
  format: PublishFormat
  imageUrl: string
  caption?: string
}

export interface PublishResult {
  mediaId: string
  permalink: string | null
}

export async function publishImage(input: PublishInput): Promise<PublishResult> {
  const { igUserId, token, format, imageUrl, caption } = input

  const container = await client.graphPost<{ id: string }>(
    `${igUserId}/media`, containerParams(format, imageUrl, caption), token,
  )

  const published = await client.graphPost<{ id: string }>(
    `${igUserId}/media_publish`, { creation_id: container.id }, token,
  )

  // The post is already live at this point. A permalink lookup failure must
  // not turn a successful publish into a reported failure.
  let permalink: string | null = null
  try {
    const meta = await client.graphGet<{ permalink?: string }>(
      published.id, { fields: 'permalink' }, token,
    )
    permalink = meta.permalink ?? null
  } catch {
    permalink = null
  }

  return { mediaId: published.id, permalink }
}
