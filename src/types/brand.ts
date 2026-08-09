// src/types/brand.ts

export interface BrandRule {
  verb: string
  domain: string
  text: string
}

export interface BrandJudgment {
  verb: string
  statement: string
}

export interface BrandContext {
  contextName: string
  contextDescription: string
  rules: BrandRule[]
  judgments: BrandJudgment[]
}

// Atelier types

export interface AtelierBrand {
  id: string
  name: string
  description: string
  ruleCount: number
  pendingMindCount: number
  templateCount: number
  assetCount: number
}

export interface Rule {
  verb: 'always' | 'never' | 'prefer' | 'avoid'
  domain: 'voice' | 'visual' | 'content' | 'format' | 'timing'
  text: string
}

export interface Judgment {
  id: string
  verb: string
  statement: string
  status: 'proposed' | 'confirmed' | 'rejected'
  created_at: string
}

export interface AtelierTemplate {
  id: string
  context_id: string
  name: string
  type: 'photo_post' | 'quote_card' | 'announcement' | 'carousel'
  description: string
  active: boolean
  created_at: string
}

export interface BrandAsset {
  id: string
  context_id: string
  name: string
  url: string
  created_at: string
}
