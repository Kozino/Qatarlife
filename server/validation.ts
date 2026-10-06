import { z } from 'zod'

export const regionSlugs = ['doha', 'the-pearl', 'lusail', 'outside-doha'] as const
export const presentationStyles = ['modern-casual', 'thobe-inspired', 'abaya-inspired', 'activewear'] as const
export const avatarSkinTones = ['warm-sand', 'desert-rose', 'deep-umber', 'pearl'] as const
export const avatarHairstyles = ['natural-short', 'soft-waves', 'textured-crop', 'covered'] as const
export const avatarHairColors = ['dark-brown', 'black', 'chestnut', 'silver'] as const
export const avatarFaceShapes = ['soft-square', 'oval', 'round', 'long'] as const

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254, 'Email address is too long.')

const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use 72 characters or fewer.')
  .regex(/[A-Za-z]/, 'Include at least one letter.')
  .regex(/[0-9]/, 'Include at least one number.')

const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Choose a name with at least 2 characters.')
  .max(24, 'Keep your name under 24 characters.')
  .regex(/^[\p{L}\p{N} _-]+$/u, 'Use letters, numbers, spaces, hyphens or underscores.')

export const signupSchema = z.object({ email: emailSchema, password: passwordSchema }).strict()
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password.').max(72, 'Password is too long.') }).strict()
export const passwordResetRequestSchema = z.object({ email: emailSchema }).strict()
export const passwordResetConfirmSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).strict()

export const onboardingSchema = z.object({
  displayName: displayNameSchema,
  startingRegion: z.enum(regionSlugs),
  presentation: z.enum(presentationStyles),
  skinTone: z.enum(avatarSkinTones).default('warm-sand'),
  hairstyle: z.enum(avatarHairstyles).default('natural-short'),
}).strict()

export const profileUpdateSchema = z.object({
  displayName: displayNameSchema,
  bio: z.string().trim().max(160, 'Keep your bio under 160 characters.').default(''),
}).strict()

export const avatarUpdateSchema = z.object({
  presentation: z.enum(presentationStyles),
  skinTone: z.enum(avatarSkinTones),
  hairstyle: z.enum(avatarHairstyles),
  hairColor: z.enum(avatarHairColors),
  faceShape: z.enum(avatarFaceShapes),
}).strict()

export const worldMoveSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  sequence: z.number().int().nonnegative(),
}).strict()

export const worldEnterSchema = z.object({ locationId: z.string().trim().min(1).max(100) }).strict()

export type SignupInput = z.infer<typeof signupSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type OnboardingInput = z.infer<typeof onboardingSchema>
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>
export type AvatarUpdateInput = z.infer<typeof avatarUpdateSchema>

export function formatZodFields(error: z.ZodError) {
  const fields: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path[0]
    if (typeof key === 'string' && !fields[key]) fields[key] = issue.message
  }
  return fields
}
