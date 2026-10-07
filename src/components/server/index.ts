import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import { createServer } from 'node:http'
import express, { type NextFunction, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { config, appRoles } from './config'
import { bootstrapRuntimeCatalog } from './bootstrap'
import { EmailTakenError, store } from './db'
import { LifeRuleError, lifeStore } from './life-store'
import { createSocialStore } from './social-store'
import { sokoniHub } from './integrations'
import { logger, requestLogger } from './logger'
import { WorldRealtime } from './realtime'
import { WorldValidationError } from './world-rules'
import {
  clearSessionCookie,
  createOpaqueToken,
  getRawSessionToken,
  hashOpaqueToken,
  requireAuth,
  requireRole,
  setSessionCookie,
  sessionMaxAgeMs,
  type AuthenticatedRequest,
} from './security'
import {
  avatarUpdateSchema,
  formatZodFields,
  loginSchema,
  onboardingSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  profileUpdateSchema,
  signupSchema,
  worldEnterSchema,
  worldMoveSchema,
} from './validation'
import {
  adCreateSchema,
  analyticsEventSchema,
  businessCreateSchema,
  businessOrderSchema,
  businessProductSchema,
  chatMessageSchema,
  completeActivitySchema,
  completeWorkSchema,
  eventCreateSchema,
  eventRegistrationSchema,
  friendRequestSchema,
  friendResponseSchema,
  homeActionSchema,
  marketplaceListingSchema,
  marketplaceOrderSchema,
  purchaseProductSchema,
  reportSchema,
  startWorkSchema,
  adminBootstrapSchema,
  adminModerationSchema,
  sokoniSyncSchema,
} from './life-validation'

export const app = express()
const socialStore = createSocialStore(store, lifeStore)

app.disable('x-powered-by')
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    contentSecurityPolicy: false,
  }),
)
app.use(express.json({ limit: '20kb' }))
app.use(cookieParser())
app.use(corsHeaders)
app.use(requestLogger)

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Please slow down and try again shortly.' } },
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many account attempts. Please try again later.' } },
})

app.use('/api', apiLimiter)
app.use(originGuard)
app.options('/api/*', (_req, res) => res.status(204).end())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'qatar-life-api', mode: store.mode, timestamp: new Date().toISOString() })
})

app.post('/api/auth/signup', authLimiter, asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12)
    const user = await store.createAccount({ email: parsed.data.email, passwordHash })
    await issueSession(res, user.id)
    logger.info('account_created', { userId: user.id })
    return res.status(201).json({ user })
  } catch (error) {
    if (error instanceof EmailTakenError) {
      return res.status(409).json({ error: { code: 'EMAIL_UNAVAILABLE', message: 'That email cannot be used for a new account.' } })
    }
    throw error
  }
}))

app.post('/api/auth/login', authLimiter, asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  const credentials = await store.findCredentialsByEmail(parsed.data.email)
  const valid = credentials ? await bcrypt.compare(parsed.data.password, credentials.passwordHash) : false
  if (!credentials || !valid || credentials.status !== 'active') {
    logger.warn('login_rejected', { reason: 'invalid_credentials' })
    return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is not correct.' } })
  }
  const user = await store.getBundleByUserId(credentials.id)
  if (!user) return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is not correct.' } })
  await issueSession(res, user.id)
  logger.info('login_succeeded', { userId: user.id })
  return res.json({ user })
}))

app.post('/api/auth/logout', asyncHandler(async (req, res) => {
  const rawToken = getRawSessionToken(req)
  if (rawToken) await store.revokeSession(hashOpaqueToken(rawToken))
  clearSessionCookie(res)
  return res.json({ ok: true })
}))

app.post('/api/auth/password-reset/request', authLimiter, asyncHandler(async (req, res) => {
  const parsed = passwordResetRequestSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  const credentials = await store.findCredentialsByEmail(parsed.data.email)
  let devResetToken: string | undefined
  if (credentials) {
    devResetToken = createOpaqueToken()
    const expiresAt = new Date(Date.now() + config.passwordResetTtlMinutes * 60 * 1000)
    await store.createPasswordReset({ userId: credentials.id, tokenHash: hashOpaqueToken(devResetToken), expiresAt })
    logger.info('password_reset_requested', { userId: credentials.id })
    // A mailer adapter will deliver this token in staging/production. It is deliberately returned only in local test/preview mode.
  }
  const response: { ok: true; message: string; devResetToken?: string } = {
    ok: true,
    message: 'If an account matches that email, reset instructions have been queued.',
  }
  if (config.returnDevResetToken && devResetToken) response.devResetToken = devResetToken
  return res.json(response)
}))

app.post('/api/auth/password-reset/confirm', authLimiter, asyncHandler(async (req, res) => {
  const parsed = passwordResetConfirmSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  const passwordHash = await bcrypt.hash(parsed.data.password, 12)
  const consumed = await store.consumePasswordReset({ tokenHash: hashOpaqueToken(parsed.data.token), passwordHash })
  if (!consumed) return res.status(400).json({ error: { code: 'RESET_TOKEN_INVALID', message: 'That reset link is invalid or has expired.' } })
  logger.info('password_reset_completed')
  return res.json({ ok: true, message: 'Password updated. Sign in with your new password.' })
}))

app.get('/api/auth/me', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const user = await store.getBundleByUserId(req.auth!.userId)
  if (!user) {
    clearSessionCookie(res)
    return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } })
  }
  return res.json({ user })
}))

app.get('/api/profile', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const user = await store.getBundleByUserId(req.auth!.userId)
  if (!user) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'We could not find that player profile.' } })
  return res.json({ profile: user.profile, avatar: user.avatar, character: user.character })
}))

app.put('/api/profile', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  const user = await store.updateProfile(req.auth!.userId, parsed.data)
  if (!user) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'We could not find that player profile.' } })
  return res.json({ user })
}))

app.get('/api/avatar', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const user = await store.getBundleByUserId(req.auth!.userId)
  if (!user) return res.status(404).json({ error: { code: 'AVATAR_NOT_FOUND', message: 'We could not find that avatar.' } })
  return res.json({ avatar: user.avatar })
}))

app.put('/api/avatar', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = avatarUpdateSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  const user = await store.updateAvatar(req.auth!.userId, parsed.data)
  if (!user) return res.status(404).json({ error: { code: 'AVATAR_NOT_FOUND', message: 'We could not find that avatar.' } })
  return res.json({ user })
}))

app.put('/api/onboarding', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = onboardingSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  const user = await store.completeOnboarding(req.auth!.userId, parsed.data)
  if (!user) return res.status(404).json({ error: { code: 'PROFILE_NOT_FOUND', message: 'We could not find that player profile.' } })
  return res.json({ user })
}))

app.get('/api/world/locations', requireAuth(store), asyncHandler(async (_req, res) => {
  return res.json({ locations: await store.listWorldLocations() })
}))

app.get('/api/world/state', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const state = await store.getWorldState(req.auth!.userId)
  if (!state) return res.status(404).json({ error: { code: 'WORLD_STATE_NOT_FOUND', message: 'We could not load your world state.' } })
  return res.json({ state })
}))

app.get('/api/world/nearby', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ players: await store.listNearbyPlayers(req.auth!.userId) })
}))

app.post('/api/world/move', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = worldMoveSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    const state = await store.movePlayer(req.auth!.userId, parsed.data)
    if (!state) return res.status(404).json({ error: { code: 'WORLD_STATE_NOT_FOUND', message: 'We could not load your world state.' } })
    return res.json({ state })
  } catch (error) {
    if (error instanceof WorldValidationError) return res.status(400).json({ error: { code: error.code, message: error.message } })
    throw error
  }
}))

app.post('/api/world/enter', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = worldEnterSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    const state = await store.enterLocation(req.auth!.userId, parsed.data.locationId)
    if (!state) return res.status(404).json({ error: { code: 'LOCATION_NOT_FOUND', message: 'That location could not be found.' } })
    return res.json({ state })
  } catch (error) {
    if (error instanceof WorldValidationError) return res.status(400).json({ error: { code: error.code, message: error.message } })
    throw error
  }
}))

app.post('/api/world/exit', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const state = await store.exitLocation(req.auth!.userId)
  if (!state) return res.status(404).json({ error: { code: 'WORLD_STATE_NOT_FOUND', message: 'We could not load your world state.' } })
  return res.json({ state })
}))

app.get('/api/life/overview', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ overview: await lifeStore.getOverview(req.auth!.userId) })
}))

app.get('/api/jobs', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ jobs: await lifeStore.listJobs(req.auth!.userId) })
}))

app.post('/api/jobs/:jobId/hire', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  try {
    return res.json({ job: await lifeStore.hireJob(req.auth!.userId, String(req.params.jobId)) })
  } catch (error) {
    return handleLifeError(res, error)
  }
}))

app.post('/api/work/start', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = startWorkSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    return res.status(201).json({ session: await lifeStore.startWork(req.auth!.userId, parsed.data.jobId, parsed.data.idempotencyKey) })
  } catch (error) {
    return handleLifeError(res, error)
  }
}))

app.post('/api/work/:sessionId/complete', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = completeWorkSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    return res.json({ session: await lifeStore.completeWork(req.auth!.userId, String(req.params.sessionId), parsed.data.idempotencyKey) })
  } catch (error) {
    return handleLifeError(res, error)
  }
}))

app.get('/api/wallet/transactions', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ transactions: await lifeStore.listLedger(req.auth!.userId) })
}))

app.get('/api/inventory', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ inventory: await lifeStore.listInventory(req.auth!.userId) })
}))

app.get('/api/shops', requireAuth(store), asyncHandler(async (_req, res) => {
  return res.json({ products: await lifeStore.listShops() })
}))

app.post('/api/shops/:productId/purchase', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = purchaseProductSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    return res.status(201).json({ purchase: await lifeStore.purchaseProduct(req.auth!.userId, String(req.params.productId), parsed.data.quantity, parsed.data.idempotencyKey) })
  } catch (error) {
    return handleLifeError(res, error)
  }
}))

app.get('/api/homes', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ homes: await lifeStore.listHomes(req.auth!.userId) })
}))

app.post('/api/homes/:homeId/rent', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = homeActionSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    return res.status(201).json({ home: await lifeStore.rentHome(req.auth!.userId, String(req.params.homeId), parsed.data.idempotencyKey) })
  } catch (error) {
    return handleLifeError(res, error)
  }
}))

app.post('/api/homes/:homeId/buy', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = homeActionSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    return res.status(201).json({ home: await lifeStore.buyHome(req.auth!.userId, String(req.params.homeId), parsed.data.idempotencyKey) })
  } catch (error) {
    return handleLifeError(res, error)
  }
}))

app.get('/api/activities', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ activities: await lifeStore.listActivities(req.auth!.userId) })
}))

app.post('/api/activities/complete', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = completeActivitySchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    return res.status(201).json({ result: await lifeStore.completeActivity(req.auth!.userId, parsed.data.activityId, parsed.data.idempotencyKey) })
  } catch (error) {
    return handleLifeError(res, error)
  }
}))

app.get('/api/passport', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ achievements: await lifeStore.listPassport(req.auth!.userId) })
}))

app.get('/api/events', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ events: await socialStore.listEvents(req.auth!.userId) })
}))

app.post('/api/events/:eventId/register', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = eventRegistrationSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try {
    return res.status(201).json({ event: await socialStore.registerEvent(req.auth!.userId, String(req.params.eventId), parsed.data.idempotencyKey) })
  } catch (error) { return handleLifeError(res, error) }
}))

app.get('/api/friends', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ friends: await socialStore.listFriends(req.auth!.userId) })
}))

app.post('/api/friends/request', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = friendRequestSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ request: await socialStore.sendFriendRequest(req.auth!.userId, parsed.data.userId) }) } catch (error) { return handleLifeError(res, error) }
}))

app.post('/api/friends/requests/:requestId/respond', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = friendResponseSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.json(await socialStore.respondFriendRequest(req.auth!.userId, String(req.params.requestId), parsed.data.action)) } catch (error) { return handleLifeError(res, error) }
}))

app.get('/api/chat/location', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ messages: await socialStore.listChatMessages(req.auth!.userId) })
}))

app.post('/api/chat/location', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = chatMessageSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ message: await socialStore.sendChatMessage(req.auth!.userId, parsed.data.body) }) } catch (error) { return handleLifeError(res, error) }
}))

app.get('/api/businesses', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ businesses: await socialStore.listBusinesses(req.auth!.userId) })
}))

app.post('/api/businesses', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = businessCreateSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ business: await socialStore.createBusiness(req.auth!.userId, parsed.data) }) } catch (error) { return handleLifeError(res, error) }
}))

app.post('/api/businesses/:businessId/products', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = businessProductSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ business: await socialStore.createBusinessProduct(req.auth!.userId, String(req.params.businessId), parsed.data) }) } catch (error) { return handleLifeError(res, error) }
}))

app.post('/api/business-products/:productId/order', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = businessOrderSchema.safeParse({ ...req.body, productId: String(req.params.productId) })
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ order: await socialStore.orderBusinessProduct(req.auth!.userId, parsed.data.productId, parsed.data.quantity, parsed.data.idempotencyKey) }) } catch (error) { return handleLifeError(res, error) }
}))

app.get('/api/marketplace', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ listings: await socialStore.listMarketplace(req.auth!.userId) })
}))

app.post('/api/marketplace/listings', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = marketplaceListingSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ listing: await socialStore.createListing(req.auth!.userId, parsed.data) }) } catch (error) { return handleLifeError(res, error) }
}))

app.post('/api/marketplace/listings/:listingId/buy', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = marketplaceOrderSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ order: await socialStore.buyListing(req.auth!.userId, String(req.params.listingId), parsed.data.quantity, parsed.data.idempotencyKey) }) } catch (error) { return handleLifeError(res, error) }
}))

app.get('/api/ads', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ advertisements: await socialStore.listAds(req.auth!.userId) })
}))

app.post('/api/ads/:adId/impression', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  await socialStore.recordAdImpression(req.auth!.userId, String(req.params.adId))
  return res.json({ ok: true })
}))

app.post('/api/ads/:adId/click', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  await socialStore.recordAdClick(req.auth!.userId, String(req.params.adId))
  return res.json({ ok: true })
}))

app.post('/api/reports', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = reportSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  return res.status(201).json({ report: await socialStore.submitReport(req.auth!.userId, parsed.data) })
}))

app.post('/api/analytics/events', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = analyticsEventSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  await socialStore.recordAnalytics(req.auth!.userId, parsed.data.eventName, parsed.data.properties)
  return res.status(204).end()
}))

app.get('/api/notifications', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ notifications: await socialStore.listNotifications(req.auth!.userId) })
}))

app.post('/api/notifications/:notificationId/read', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  await socialStore.markNotificationRead(req.auth!.userId, String(req.params.notificationId))
  return res.json({ ok: true })
}))

app.post('/api/admin/events', requireAuth(store), requireRole(store, appRoles), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = eventCreateSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ event: await socialStore.createEvent(req.auth!.userId, parsed.data) }) } catch (error) { return handleLifeError(res, error) }
}))

app.post('/api/admin/ads', requireAuth(store), requireRole(store, ['super_admin', 'admin', 'advertiser_manager']), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = adCreateSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(201).json({ advertisement: await socialStore.createAd(req.auth!.userId, parsed.data) }) } catch (error) { return handleLifeError(res, error) }
}))

app.post('/api/admin/integrations/sokoni-hub/sync', requireAuth(store), requireRole(store, ['super_admin', 'admin', 'business_manager']), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = sokoniSyncSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.status(202).json({ integration: await sokoniHub.syncBusinessListing(parsed.data) }) } catch (error) { return handleLifeError(res, error) }
}))

app.get('/api/admin/reports', requireAuth(store), requireRole(store, ['super_admin', 'admin', 'moderator', 'support']), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ reports: await socialStore.listReports(req.auth!.userId) })
}))

app.get('/api/admin/analytics/summary', requireAuth(store), requireRole(store, ['super_admin', 'admin', 'support']), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ analytics: await socialStore.getAnalyticsSummary(req.auth!.userId) })
}))

app.post('/api/admin/reports/:reportId/moderate', requireAuth(store), requireRole(store, ['super_admin', 'admin', 'moderator']), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = adminModerationSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  try { return res.json(await socialStore.moderateReport(req.auth!.userId, String(req.params.reportId), parsed.data.actionType, parsed.data.reason, parsed.data.durationSeconds)) } catch (error) { return handleLifeError(res, error) }
}))

app.post('/api/admin/bootstrap', requireAuth(store), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const parsed = adminBootstrapSchema.safeParse(req.body)
  if (!parsed.success) return validationError(res, parsed.error)
  if (!config.adminBootstrapToken || parsed.data.token !== config.adminBootstrapToken) return res.status(403).json({ error: { code: 'BOOTSTRAP_REJECTED', message: 'The admin bootstrap token is not accepted.' } })
  const claimed = await store.claimFirstAdmin(req.auth!.userId, 'super_admin')
  if (!claimed) return res.status(409).json({ error: { code: 'ADMIN_ALREADY_CONFIGURED', message: 'An administrator is already configured.' } })
  return res.status(201).json({ ok: true, role: 'super_admin' })
}))

app.get('/api/admin/me', requireAuth(store), requireRole(store, appRoles), asyncHandler(async (req: AuthenticatedRequest, res) => {
  return res.json({ admin: true, role: req.auth!.role })
}))

const distDirectory = join(process.cwd(), 'dist')
if (existsSync(distDirectory)) {
  app.use(express.static(distDirectory, { index: false, maxAge: config.isProduction ? '1h' : 0 }))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    return res.sendFile(join(distDirectory, 'index.html'))
  })
}

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'That route does not exist.' } })
})

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error('unhandled_request_error', {
    requestId: res.getHeader('x-request-id'),
    path: req.path,
    error: error instanceof Error ? error.message : String(error),
  })
  if (res.headersSent) return
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side.' } })
})

export const httpServer = createServer(app)
export const worldRealtime = new WorldRealtime(httpServer, store)

if (config.env !== 'test') {
  void (async () => {
    if (store.mode === 'postgres' && config.worldBootstrap) await bootstrapRuntimeCatalog()
    httpServer.listen(config.port, '0.0.0.0', () => logger.info('api_listening', { port: config.port, mode: store.mode }))
  })().catch((error) => {
    logger.error('api_start_failed', { error: error instanceof Error ? error.message : String(error) })
    process.exitCode = 1
  })
}

async function issueSession(res: Response, userId: string) {
  const rawToken = createOpaqueToken()
  await store.createSession({ userId, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(Date.now() + sessionMaxAgeMs) })
  setSessionCookie(res, rawToken)
}

function corsHeaders(req: Request, res: Response, next: NextFunction) {
  const requestOrigin = req.headers.origin
  if (requestOrigin && config.corsOrigins.some((origin) => normalizeOrigin(origin) === normalizeOrigin(requestOrigin))) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  }
  if (req.method === 'OPTIONS') return res.status(204).end()
  return next()
}

function originGuard(req: Request, res: Response, next: NextFunction) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
  const requestOrigin = req.headers.origin
  if (mutating && requestOrigin && !config.corsOrigins.some((origin) => normalizeOrigin(origin) === normalizeOrigin(requestOrigin))) {
    return res.status(403).json({ error: { code: 'ORIGIN_REJECTED', message: 'Request origin is not allowed.' } })
  }
  return next()
}

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return value.replace(/\/$/, '')
  }
}

function handleLifeError(res: Response, error: unknown) {
  if (error instanceof LifeRuleError) return res.status(error.status).json({ error: { code: error.code, message: error.message } })
  throw error
}

function validationError(res: Response, error: Parameters<typeof formatZodFields>[0]) {
  return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Please check the highlighted fields.', fields: formatZodFields(error) } })
}

function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req, res, next)).catch(next)
}
