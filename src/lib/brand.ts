import { SupabaseClient } from '@supabase/supabase-js'
import { BrandContext } from '@/types/brand'

export async function getBrandContext(
  contextId: string,
  supabase: SupabaseClient
): Promise<BrandContext> {
  const { data: context, error: ctxError } = await supabase
    .from('contexts')
    .select('name, description')
    .eq('id', contextId)
    .single()

  if (ctxError || !context) {
    throw new Error(`Context ${contextId} not found`)
  }

  const { data: capsule } = await supabase
    .from('capsules')
    .select('rules')
    .eq('context_id', contextId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const rules = (capsule?.rules ?? []) as Array<{ verb: string; domain: string; text: string }>

  let judgments: Array<{ verb: string; statement: string }> = []
  try {
    const { data: jData } = await supabase
      .from('judgments')
      .select('verb, statement')
      .eq('context_id', contextId)
      .eq('status', 'confirmed')
    judgments = (jData ?? []) as Array<{ verb: string; statement: string }>
  } catch {
    // judgments table not yet applied — return empty, brand context still works
  }

  return {
    contextName: context.name as string,
    contextDescription: (context.description ?? '') as string,
    rules,
    judgments,
  }
}

export function formatBrandSystem(brand: BrandContext): string {
  const lines: string[] = [
    `Brand: ${brand.contextName}`,
    brand.contextDescription ? `Description: ${brand.contextDescription}` : '',
  ]

  if (brand.rules.length > 0) {
    lines.push('\nDesign Rules:')
    brand.rules.forEach(r => lines.push(`  ${r.verb} (${r.domain}): ${r.text}`))
  }

  if (brand.judgments.length > 0) {
    lines.push('\nConfirmed Brand Judgments:')
    brand.judgments.forEach(j => lines.push(`  ${j.verb}: ${j.statement}`))
  }

  return lines.filter(Boolean).join('\n')
}
