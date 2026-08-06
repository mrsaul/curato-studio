import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY

export async function POST(req: NextRequest) {
  const authed = await createServerSupabaseClient()
  const { data: { user } } = await authed.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CLAUDE_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const fd = await req.formData()
  const audio = fd.get('audio') as Blob | null
  if (!audio) return NextResponse.json({ error: 'No audio field' }, { status: 400 })

  const buffer = await audio.arrayBuffer()
  const base64 = Buffer.from(buffer).toString('base64')
  const mimeType = (audio.type || 'audio/webm') as string

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'audio', source: { type: 'base64', media_type: mimeType, data: base64 } },
          { type: 'text', text: 'Transcribe this voice note exactly as spoken. Return only the transcript, nothing else.' },
        ],
      }],
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    const err = await response.text()
    return NextResponse.json({ error: err }, { status: response.status })
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  const transcript = data.content.find(b => b.type === 'text')?.text ?? ''
  return NextResponse.json({ transcript })
}
