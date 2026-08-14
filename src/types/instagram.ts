export type PublishFormat = 'feed' | 'story'
export type PublishStatus = 'pending' | 'published' | 'failed'

export interface InstagramAccount {
  context_id: string
  ig_user_id: string
  username: string | null
  access_token: string
  token_expires_at: string
  needs_reconnect: boolean
  connected_by: string | null
  created_at: string
  updated_at: string
}

export interface PublishAttempt {
  id: string
  request_id: string
  context_id: string
  published_by: string | null
  format: PublishFormat
  status: PublishStatus
  ig_media_id: string | null
  permalink: string | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

/** Shape Meta returns inside an error response body. */
export interface MetaErrorBody {
  code?: number
  error_subcode?: number
  type?: string
  message?: string
}

/** What error translation produces for the UI and the attempt row. */
export interface TranslatedError {
  code: string
  userMessage: string
  needsReconnect: boolean
  retryable: boolean
}
