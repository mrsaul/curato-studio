import { describe, it, expect } from 'vitest'
import { RequestStatus } from '@/types/request'

describe('test harness', () => {
  it('resolves the @/ path alias', () => {
    const s: RequestStatus = 'approved'
    expect(s).toBe('approved')
  })
})
