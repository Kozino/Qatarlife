import { describe, expect, it } from 'vitest'
import { avatarUpdateSchema, loginSchema, onboardingSchema, passwordResetConfirmSchema, profileUpdateSchema, signupSchema } from './validation'

describe('request validation', () => {
  it('normalizes a valid signup email', () => {
    const result = signupSchema.parse({ email: ' Player@Example.COM ', password: 'Story1234' })
    expect(result.email).toBe('player@example.com')
  })

  it('rejects a password without a number', () => {
    const result = signupSchema.safeParse({ email: 'player@example.com', password: 'OnlyLetters' })
    expect(result.success).toBe(false)
  })

  it('accepts known onboarding regions, styles and avatar defaults', () => {
    const result = onboardingSchema.parse({ displayName: 'Noor', startingRegion: 'doha', presentation: 'abaya-inspired' })
    expect(result).toMatchObject({ displayName: 'Noor', startingRegion: 'doha', presentation: 'abaya-inspired', skinTone: 'warm-sand', hairstyle: 'natural-short' })
    expect(onboardingSchema.safeParse({ displayName: 'Noor', startingRegion: 'unknown', presentation: 'robot' }).success).toBe(false)
  })

  it('keeps login validation separate from signup policy', () => {
    expect(loginSchema.safeParse({ email: 'player@example.com', password: 'short' }).success).toBe(true)
  })

  it('rejects profile mass assignment and bounds bio length', () => {
    expect(profileUpdateSchema.safeParse({ displayName: 'Noor', bio: 'A'.repeat(161) }).success).toBe(false)
    expect(profileUpdateSchema.safeParse({ displayName: 'Noor', bio: '', role: 'admin' }).success).toBe(false)
  })

  it('validates avatar fields against the server catalogue', () => {
    expect(avatarUpdateSchema.safeParse({ presentation: 'modern-casual', skinTone: 'pearl', hairstyle: 'soft-waves', hairColor: 'black', faceShape: 'oval' }).success).toBe(true)
    expect(avatarUpdateSchema.safeParse({ presentation: 'admin', skinTone: 'pearl', hairstyle: 'soft-waves', hairColor: 'black', faceShape: 'oval' }).success).toBe(false)
  })

  it('requires a strong password for reset confirmation', () => {
    expect(passwordResetConfirmSchema.safeParse({ token: 'a'.repeat(32), password: 'NewStory5678' }).success).toBe(true)
    expect(passwordResetConfirmSchema.safeParse({ token: 'too-short', password: 'NewStory5678' }).success).toBe(false)
  })
})
