import { z } from 'zod'

export const idempotencySchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const startWorkSchema = z.object({
  jobId: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const completeWorkSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const purchaseProductSchema = z.object({
  quantity: z.number().int().min(1).max(20).default(1),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const homeActionSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const completeActivitySchema = z.object({
  activityId: z.string().trim().min(1).max(120),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const eventRegistrationSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const friendRequestSchema = z.object({
  userId: z.string().uuid(),
})

export const friendResponseSchema = z.object({
  action: z.enum(['accept', 'decline', 'cancel']),
})

export const chatMessageSchema = z.object({
  body: z.string().trim().min(1).max(500),
})

export const businessCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  category: z.string().trim().min(2).max(40),
  description: z.string().trim().max(500).default(''),
  locationId: z.string().trim().min(1).max(120).nullable().optional(),
})

export const businessProductSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).default(''),
  kind: z.enum(['product', 'service']),
  priceMinor: z.number().int().min(1).max(100_000_000),
})

export const businessOrderSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(20).default(1),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const marketplaceListingSchema = z.object({
  itemId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  priceMinor: z.number().int().min(1).max(100_000_000),
  quantity: z.number().int().min(1).max(1_000),
})

export const marketplaceOrderSchema = z.object({
  quantity: z.number().int().min(1).max(100).default(1),
  idempotencyKey: z.string().trim().min(8).max(120),
})

export const reportSchema = z.object({
  reportedUserId: z.string().uuid().nullable().optional(),
  targetType: z.string().trim().min(2).max(50),
  targetId: z.string().uuid().nullable().optional(),
  reasonCode: z.enum(['spam', 'harassment', 'inappropriate', 'fraud', 'other']),
  details: z.string().trim().max(1_000).default(''),
})

export const adminModerationSchema = z.object({
  actionType: z.enum(['warning', 'mute', 'ban', 'remove_content', 'resolve']),
  reason: z.string().trim().min(2).max(500),
  durationSeconds: z.number().int().min(0).max(31_536_000).nullable().optional(),
})

export const eventCreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1_000).default(''),
  eventType: z.string().trim().min(2).max(50),
  locationId: z.string().trim().min(1).max(120).nullable().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  capacity: z.number().int().min(1).max(100_000).nullable().optional(),
  rewards: z.array(z.unknown()).max(20).default([]),
}).refine((value) => new Date(value.endAt) > new Date(value.startAt), { path: ['endAt'], message: 'Event end must be after its start.' })

export const adCreateSchema = z.object({
  adType: z.enum(['billboard', 'shop_banner', 'metro', 'event_sponsorship', 'location_sponsorship', 'business_promotion']),
  title: z.string().trim().min(2).max(120),
  businessId: z.string().uuid().nullable().optional(),
  destination: z.record(z.unknown()).default({}),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  budgetMinor: z.number().int().min(0).max(100_000_000).default(0),
}).refine((value) => new Date(value.endAt) > new Date(value.startAt), { path: ['endAt'], message: 'Advertisement end must be after its start.' })

export const analyticsEventSchema = z.object({
  eventName: z.string().trim().min(2).max(80),
  properties: z.record(z.unknown()).default({}),
})

export const sokoniSyncSchema = z.object({
  businessId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  externalReference: z.string().trim().max(120).optional(),
})

export const adminBootstrapSchema = z.object({
  token: z.string().min(32).max(200),
})
