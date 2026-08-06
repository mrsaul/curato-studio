import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { getRequest, updateRequest, getReviewerTemplates } from '@/lib/requests'
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
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Claude error: ${response.status}`)
  const data = await response.json() as { content: Array<{ type: string; text: string }> }
  return data.content.find(b => b.type === 'text')?.text ?? ''
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim()
  return JSON.parse(cleaned) as T
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
  if (request.status !== 'draft_ready') {
    return NextResponse.json({ error: 'Request must be in draft_ready status' }, { status: 400 })
  }

  let brandSystem = ''
  if (request.context_id) {
    try {
      const brand = await getBrandContext(request.context_id, supabase)
      brandSystem = formatBrandSystem(brand)
    } catch { /* proceed without */ }
  }

  const templates = await getReviewerTemplates(supabase, request.reviewer_id)
  const templateList = templates.map(t => `${t.name} (${t.type}): ${t.description}`).join('\n') || 'No templates configured'

  const requestContext = `Intent: ${request.intent_summary ?? 'Not interpreted yet'}
Source type: ${request.source_type}
Input: ${request.transcript ?? request.raw_text ?? ''}
${request.contributor_reply ? `Contributor reply: ${request.contributor_reply}` : ''}`

  const captionPrompt = `Write Instagram copy for this Creative Request.

Request: ${requestContext}
${brandSystem ? `Brand voice:\n${brandSystem}` : ''}

Return JSON only:
{
  "caption_options": [
    { "style": "warm", "text": "string" },
    { "style": "concise", "text": "string" },
    { "style": "story", "text": "string" }
  ],
  "recommended_caption": "string — copy one of the above verbatim",
  "cta": "string — one clear call to action",
  "hashtags": ["string"],
  "alt_text": "string — descriptive alt text for accessibility",
  "flags": [{ "type": "string", "note": "string" }]
}`

  const templatePrompt = `Choose the best template for this Creative Request.

Request: ${requestContext}
Available templates:\n${templateList}

Return JSON only:
{
  "template_name": "string or null if no template fits",
  "visual_brief": "string — art direction for the visual"
}`

  interface CaptionResult {
    caption_options: Array<{ style: string; text: string }>
    recommended_caption: string
    cta: string
    hashtags: string[]
    alt_text: string
    flags: Array<{ type: string; note: string }>
  }
  interface TemplateResult {
    template_name: string | null
    visual_brief: string
  }

  const [captionRaw, templateRaw] = await Promise.all([
    callClaude(captionPrompt),
    callClaude(templatePrompt),
  ])

  const captionData = parseJson<CaptionResult>(captionRaw)
  const templateData = parseJson<TemplateResult>(templateRaw)

  const matchedTemplate = templates.find(t => t.name === templateData.template_name)

  const { data: draft, error: draftError } = await supabase
    .from('request_drafts')
    .insert({
      request_id: request.id,
      caption_options: captionData.caption_options,
      recommended_caption: captionData.recommended_caption,
      cta: captionData.cta,
      hashtags: captionData.hashtags,
      alt_text: captionData.alt_text,
      template_id: matchedTemplate?.id ?? null,
      visual_brief: templateData.visual_brief,
      flags: captionData.flags,
    })
    .select()
    .single()

  if (draftError || !draft) {
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }

  await updateRequest(supabase, request.id, { status: 'awaiting_review' })

  return NextResponse.json({ draft })
}
