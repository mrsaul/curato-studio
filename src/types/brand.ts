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
