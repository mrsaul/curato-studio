import { MetaErrorBody } from '@/types/instagram'

/**
 * Pinned in one place. Meta deprecates versions on roughly a two-year
 * cycle — set GRAPH_VERSION to the current stable version rather than
 * trusting this default.
 */
export const GRAPH_VERSION = process.env.GRAPH_VERSION ?? 'v23.0'

const GRAPH_HOST = 'https://graph.facebook.com'

export function graphUrl(path: string): string {
  return `${GRAPH_HOST}/${GRAPH_VERSION}/${path}`
}

export class GraphApiError extends Error {
  readonly name = 'GraphApiError'
  readonly meta: MetaErrorBody
  constructor(meta: MetaErrorBody) {
    super(meta.message ?? 'Graph API request failed')
    this.meta = meta
  }
}

async function readError(res: { json: () => Promise<unknown> }): Promise<MetaErrorBody> {
  try {
    const body = (await res.json()) as { error?: MetaErrorBody }
    return body.error ?? {}
  } catch {
    return {}
  }
}

export async function graphPost<T>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const body = new URLSearchParams({ ...params, access_token: token })
  const res = await fetch(graphUrl(path), { method: 'POST', body })
  if (!res.ok) throw new GraphApiError(await readError(res))
  return (await res.json()) as T
}

export async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const qs = new URLSearchParams({ ...params, access_token: token })
  const res = await fetch(`${graphUrl(path)}?${qs.toString()}`)
  if (!res.ok) throw new GraphApiError(await readError(res))
  return (await res.json()) as T
}
