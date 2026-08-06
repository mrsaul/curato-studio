import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getRequest, getRequestDraft } from '@/lib/requests'

const CLAUDE_API_KEY = process.env.ANTHROPIC_API_KEY

function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: true })

  if (!CLAUDE_API_KEY) return NextResponse.json({ ok: true })

  const body = await req.json() as { request_id?: string; draft_id?: string }
  if (!body.request_id || !body.draft_id) return NextResponse.json({ ok: true })

  const request = await getRequest(supabase, body.request_id)
  if (!request || request.reviewer_id !== user.id) return NextResponse.json({ ok: true })

  const draft = await getRequestDraft(supabase, request.id)
  if (!draft) return NextResponse.json({ ok: true })

  const { data: decision } = await supabase
    .from('review_decisions')
    .select('*')
    .eq('draft_id', body.draft_id)
    .eq('reviewer_id', user.id)
    .maybeSingle()

  if (!decision || !decision.edited_caption) return NextResponse.json({ ok: true })

  const prompt = `Compare the reviewer decision and edits with Curato Studio's draft.

Creative Request intent: ${request.intent_summary ?? '(none)'}
Draft recommended caption: ${draft.recommended_caption ?? '(none)'}
Reviewer edited caption: ${decision.edited_caption}
Reviewer notes: ${decision.notes ?? '(none)'}

Extract only durable, generalizable brand feedback. Categorize as: voice, visual_system, content_rule, template_preference, or factual_correction.

Return JSON only — an array of proposed judgments (empty array if nothing durable):
[
  {
    "verb": "always" | "never" | "prefer" | "avoid",
    "domain": "typography" | "color" | "composition" | "texture" | "space" | "motion" | "material" | "mood",
    "statement": "string — the durable rule",
    "confidence": 0.0 to 1.0
  }
]

If no durable feedback, return []`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30_000),
  })

  if (!response.ok) return NextResponse.json({ ok: true })

  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  const raw = data.content.find(b => b.type === 'text')?.text ?? '[]'
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()

  let proposals: Array<{ verb: string; domain: string; statement: string; confidence: number }>
  try {
    proposals = JSON.parse(cleaned)
  } catch {
    return NextResponse.json({ ok: true })
  }

  if (!Array.isArray(proposals) || proposals.length === 0) return NextResponse.json({ ok: true })

  const serviceSupabase = createServiceClient()
  const { error: insertError } = await serviceSupabase
    .from('judgments')
    .insert(
      proposals.map(p => ({
        user_id: user.id,
        verb: p.verb,
        domain: p.domain,
        statement: p.statement,
        context_id: request.context_id,
        status: 'proposed',
        confidence: p.confidence,
        source_capture_ids: [],
        proposed_by: 'studio',
      }))
    )
  if (insertError) {
    console.error('memory: failed to insert judgments:', insertError.message)
  }

  return NextResponse.json({ ok: true, proposed: proposals.length })
}
