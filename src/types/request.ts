export type RequestStatus =
  | 'new'
  | 'interpreting'
  | 'needs_info'
  | 'draft_ready'
  | 'awaiting_review'
  | 'approved'
  | 'changes_requested'
  | 'declined'
  | 'delivered'

export type SourceType = 'text' | 'voice' | 'photo'

export interface CreativeRequest {
  id: string
  contributor_id: string
  reviewer_id: string
  context_id: string | null
  status: RequestStatus
  source_type: SourceType
  raw_text: string | null
  media_url: string | null
  transcript: string | null
  intent_summary: string | null
  clarification_question: string | null
  contributor_reply: string | null
  created_at: string
  updated_at: string
}

export interface CaptionOption {
  style: 'warm' | 'concise' | 'story'
  text: string
}

export interface DraftFlag {
  type: string
  note: string
}

export interface RequestDraft {
  id: string
  request_id: string
  caption_options: CaptionOption[]
  recommended_caption: string | null
  cta: string | null
  hashtags: string[]
  alt_text: string | null
  template_id: string | null
  visual_brief: string | null
  flags: DraftFlag[]
  created_at: string
}

export type ReviewDecisionType = 'approved' | 'changes_requested' | 'declined'

export interface ReviewDecision {
  id: string
  draft_id: string
  reviewer_id: string
  decision: ReviewDecisionType
  edited_caption: string | null
  notes: string | null
  created_at: string
}

export type TemplateType = 'photo_post' | 'quote_card' | 'announcement' | 'carousel'

export interface Template {
  id: string
  reviewer_id: string
  name: string
  type: TemplateType
  description: string
  visual_spec: Record<string, unknown>
  active: boolean
  created_at: string
}
