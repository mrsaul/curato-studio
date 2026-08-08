import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, updateRequest } from '@/lib/requests'
import { getBrandContext, formatBrandSystem } from '@/lib/brand'

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY

interface InterpretResult {
  source_summary: string
  intent: string
  subject: string
  confirmed_facts: string[]
  uncertain_facts: string[]
  suggested_audience: string
  likely_cta: string
  emotional_tone: string
  recommended_format: string
  clarification_question: string | null
  confirmation_sentence: string
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!CLAUDE_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 })

  const body = await req.json() as { request_id?: string }
  if (!body.request_id) return NextResponse.json({ error: 'request_id required' }, { status: 400 })

  const request = await getRequest(supabase, body.request_id)
  if (!request || request.contributor_id !== user.id) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  await updateRequest(supabase, request.id, { status: 'interpreting' })

  const input = request.transcript ?? request.raw_text ?? ''

  let brandSystem = ''
  if (request.context_id) {
    try {
      const brand = await getBrandContext(request.context_id, supabase)
      brandSystem = formatBrandSystem(brand)
    } catch {
      // proceed without brand context
    }
  }

  const prompt = `Read the contributor's input below. Extract only information that is explicitly stated or safely implied. Do not improve facts by guessing.

Contributor input: ${input}
${brandSystem ? `\nBrand context:\n${brandSystem}` : ''}

Return a JSON object with these exact fields (no markdown, raw JSON only):
{
  "source_summary": "string — what the contributor shared in their own terms",
  "intent": "string — one of: promote, inform, celebrate, invite, reflect, sell, other",
  "subject": "string — what or who the post is about",
  "confirmed_facts": ["string"],
  "uncertain_facts": ["string"],
  "suggested_audience": "string",
  "likely_cta": "string",
  "emotional_tone": "string",
  "recommended_format": "string — one of: photo_post, quote_card, announcement, carousel",
  "clarification_question": "string or null — one question only if a missing fact prevents a useful draft, else null",
  "confirmation_sentence": "string — begins with 'Here\\'s what I\\'ll make: '"
}`

  type ClaudeContent =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'url'; url: string } }

  let model: string
  let messageContent: string | ClaudeContent[]

  if (request.photo_url) {
    model = 'claude-haiku-4-5-20251001'
    const visionPromptText = `The creator wants to post this photo to Instagram.${input ? ` Their description: "${input}"` : ''}
${brandSystem ? `\nBrand context:\n${brandSystem}` : ''}

Analyze the photo carefully. Return a JSON object with these exact fields (no markdown, raw JSON only):
{
  "source_summary": "string — describe what's in the photo in plain terms",
  "intent": "string — one of: promote, inform, celebrate, invite, reflect, sell, other",
  "subject": "string — what or who the post is about",
  "confirmed_facts": ["string"],
  "uncertain_facts": ["string"],
  "suggested_audience": "string",
  "likely_cta": "string",
  "emotional_tone": "string",
  "recommended_format": "string — one of: photo_post, quote_card, announcement, carousel",
  "clarification_question": "string or null — one question only if a missing fact prevents a useful draft, else null",
  "confirmation_sentence": "string — begins with 'Here\\'s what I\\'ll make: '"
}`
    messageContent = [
      { type: 'image', source: { type: 'url', url: request.photo_url } },
      { type: 'text', text: visionPromptText },
    ]
  } else {
    model = 'claude-sonnet-4-6'
    messageContent = prompt
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: messageContent }],
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) {
    await updateRequest(supabase, request.id, { status: 'new' })
    const err = await response.text()
    return NextResponse.json({ error: err }, { status: response.status })
  }

  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  const raw = data.content.find(b => b.type === 'text')?.text ?? ''
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()

  let parsed: InterpretResult
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    await updateRequest(supabase, request.id, { status: 'new' })
    return NextResponse.json({ error: 'Failed to parse interpret response' }, { status: 500 })
  }

  const newStatus = parsed.clarification_question ? 'needs_info' : 'draft_ready'
  await updateRequest(supabase, request.id, {
    status: newStatus,
    intent_summary: parsed.confirmation_sentence,
    clarification_question: parsed.clarification_question,
  })

  return NextResponse.json({ interpret: parsed, status: newStatus })
}
