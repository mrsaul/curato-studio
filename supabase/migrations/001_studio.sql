-- Curato Studio tables
-- Apply in Supabase dashboard SQL editor for project duppejolqfwxodglbibc

-- creative_requests
create table public.creative_requests (
  id                     uuid primary key default uuid_generate_v4(),
  contributor_id         uuid references auth.users(id) on delete cascade not null,
  reviewer_id            uuid references auth.users(id) on delete cascade not null,
  context_id             uuid references public.contexts(id) on delete set null,
  status                 text not null default 'new'
                           check (status in (
                             'new', 'interpreting', 'needs_info',
                             'draft_ready', 'awaiting_review',
                             'approved', 'changes_requested', 'declined', 'delivered'
                           )),
  source_type            text not null check (source_type in ('text', 'voice', 'photo')),
  raw_text               text default null,
  media_url              text default null,
  transcript             text default null,
  intent_summary         text default null,
  clarification_question text default null,
  contributor_reply      text default null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- templates (must be before request_drafts due to FK)
create table public.templates (
  id           uuid primary key default uuid_generate_v4(),
  reviewer_id  uuid references auth.users(id) on delete cascade not null,
  name         text not null,
  type         text not null check (type in ('photo_post', 'quote_card', 'announcement', 'carousel')),
  description  text not null default '',
  visual_spec  jsonb not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- request_drafts
create table public.request_drafts (
  id                   uuid primary key default uuid_generate_v4(),
  request_id           uuid references public.creative_requests(id) on delete cascade not null,
  caption_options      jsonb not null default '[]',
  recommended_caption  text default null,
  cta                  text default null,
  hashtags             text[] not null default '{}',
  alt_text             text default null,
  template_id          uuid references public.templates(id) on delete set null default null,
  visual_brief         text default null,
  flags                jsonb not null default '[]',
  created_at           timestamptz not null default now()
);

-- review_decisions
create table public.review_decisions (
  id               uuid primary key default uuid_generate_v4(),
  draft_id         uuid references public.request_drafts(id) on delete cascade not null,
  reviewer_id      uuid references auth.users(id) on delete cascade not null,
  decision         text not null check (decision in ('approved', 'changes_requested', 'declined')),
  edited_caption   text default null,
  notes            text default null,
  created_at       timestamptz not null default now()
);

-- RLS: creative_requests
alter table public.creative_requests enable row level security;

create policy "contributor can view own requests"
  on public.creative_requests for select
  using (contributor_id = auth.uid());

create policy "contributor can update own requests"
  on public.creative_requests for update
  using (contributor_id = auth.uid());

create policy "contributor can insert own requests"
  on public.creative_requests for insert
  with check (contributor_id = auth.uid());

create policy "reviewer can view assigned requests"
  on public.creative_requests for select
  using (reviewer_id = auth.uid());

create policy "reviewer can update assigned requests"
  on public.creative_requests for update
  using (reviewer_id = auth.uid());

-- RLS: templates
alter table public.templates enable row level security;

create policy "contributor can view active templates"
  on public.templates for select
  using (active = true);

create policy "reviewer owns templates"
  on public.templates for all
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

-- RLS: request_drafts
alter table public.request_drafts enable row level security;

create policy "contributor can view drafts for own requests"
  on public.request_drafts for select
  using (
    exists (
      select 1 from public.creative_requests r
      where r.id = request_id and r.contributor_id = auth.uid()
    )
  );

create policy "reviewer can manage drafts for assigned requests"
  on public.request_drafts for all
  using (
    exists (
      select 1 from public.creative_requests r
      where r.id = request_id and r.reviewer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.creative_requests r
      where r.id = request_id and r.reviewer_id = auth.uid()
    )
  );

-- RLS: review_decisions
alter table public.review_decisions enable row level security;

create policy "contributor can view decisions on own requests"
  on public.review_decisions for select
  using (
    exists (
      select 1 from public.request_drafts d
      join public.creative_requests r on r.id = d.request_id
      where d.id = draft_id and r.contributor_id = auth.uid()
    )
  );

create policy "reviewer can manage own decisions"
  on public.review_decisions for all
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

-- updated_at trigger (uses set_updated_at() already defined in the Curato schema)
create trigger set_creative_requests_updated_at
  before update on public.creative_requests
  for each row execute function public.set_updated_at();
