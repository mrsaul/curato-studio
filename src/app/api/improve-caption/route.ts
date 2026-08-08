// src/app/api/improve-caption/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest } from '@/lib/requests'
import { getBrandContext, formatBrandSystem } from '@/lib/brand'

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY

async function callClaude(prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Claude error: ${response.status}`)
  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(b => b.type === 'text')?.text ?? ''
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CLAUDE_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const body = await req.json() as {
    request_id?: string
    current_caption?: string
    direction?: string
  }

  if (!body.request_id || !body.current_caption || !body.direction?.trim()) {
    return NextResponse.json(
      { error: 'request_id, current_caption, and direction are required' },
      { status: 400 }
    )
  }

  const request = await getRequest(supabase, body.request_id)
  if (!request || request.reviewer_id !== user.id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (request.status !== 'awaiting_review') {
    return NextResponse.json({ error: 'Request is not awaiting review' }, { status: 400 })
  }

  let brandSystem = ''
  if (request.context_id) {
    try {
      const brand = await getBrandContext(request.context_id, supabase)
      brandSystem = formatBrandSystem(brand)
    } catch { /* proceed without brand context */ }
  }

  const prompt = `You are helping an Art Director refine a social media caption.

Original brief: ${request.transcript ?? request.raw_text ?? '(no text — media upload)'}
Intent: ${request.intent_summary ?? ''}
${brandSystem ? `Brand voice:\n${brandSystem}` : ''}

Current caption:
"${body.current_caption}"

Art Director's direction: "${body.direction}"

Rewrite the caption following the direction exactly. Return ONLY the improved caption text — no quotes, no explanation, no JSON wrapper.`

  try {
    const improved = await callClaude(prompt)
    return NextResponse.json({ improved_caption: improved.trim() })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Claude call failed' },
      { status: 500 }
    )
  }
}
