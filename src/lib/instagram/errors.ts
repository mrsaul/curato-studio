import { MetaErrorBody, TranslatedError } from '@/types/instagram'

const RATE_LIMIT_CODES = new Set([4, 32, 613])

/**
 * Meta adds 2207xxx codes without notice, so this recognises the families
 * we act on and surfaces Meta's own wording for everything else rather
 * than swallowing it behind a generic failure.
 */
export function translateIgError(err: MetaErrorBody): TranslatedError {
  const code = err.code
  const message = err.message?.trim()

  if (code === 190) {
    return {
      code: '190',
      userMessage: 'Instagram needs reconnecting — ask your director.',
      needsReconnect: true,
      retryable: false,
    }
  }

  if (code !== undefined && RATE_LIMIT_CODES.has(code)) {
    return {
      code: String(code),
      userMessage: "Instagram's limit was reached. Try again shortly.",
      needsReconnect: false,
      retryable: true,
    }
  }

  if (code !== undefined && code >= 2207000 && code < 2208000) {
    return {
      code: String(code),
      userMessage: message
        ? `Instagram couldn't use this image: ${message}`
        : "Instagram couldn't use this image.",
      needsReconnect: false,
      retryable: false,
    }
  }

  return {
    code: code === undefined ? 'unknown' : String(code),
    userMessage: message
      ? `Instagram didn't accept the post: ${message}`
      : "Instagram didn't accept the post.",
    needsReconnect: false,
    retryable: false,
  }
}
