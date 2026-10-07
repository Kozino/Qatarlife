import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import type { AccountStore } from './db'
import { config } from './config'
import { EVENT_CATALOG } from './life-catalog'
import { WORLD_LOCATIONS } from './world-catalog'
import { creditLedger, debitLedger, lockWallets, LifeRuleError, type LifeStore } from './life-store'
import type { AdvertisementOption, BusinessOption, ChatMessage, EventOption, FriendOption, MarketplaceListing } from './life-types'

export type CreateEventInput = { title: string; description: string; eventType: string; locationId?: string | null; startAt: string; endAt: string; capacity?: number | null; rewards: unknown[] }
export type CreateBusinessInput = { name: string; slug: string; category: string; description: string; locationId?: string | null }
export type CreateBusinessProductInput = { name: string; description: string; kind: 'product' | 'service'; priceMinor: number }
export type CreateListingInput = { itemId?: string | null; title: string; description: string; priceMinor: number; quantity: number }
export type CreateAdInput = { adType: string; title: string; businessId?: string | null; destination: Record<string, unknown>; startAt: string; endAt: string; budgetMinor: number }
export type ReportInput = { reportedUserId?: string | null; targetType: string; targetId?: string | null; reasonCode: string; details: string }

export interface SocialStore {
  readonly mode: 'preview-memory' | 'postgres'
  listEvents(userId: string): Promise<EventOption[]>
  createEvent(userId: string, input: CreateEventInput): Promise<EventOption>
  registerEvent(userId: string, eventId: string, idempotencyKey: string): Promise<EventOption>
  listFriends(userId: string): Promise<FriendOption[]>
  sendFriendRequest(userId: string, recipientId: string): Promise<{ id: string; status: string }>
  respondFriendRequest(userId: string, requestId: string, action: 'accept' | 'decline' | 'cancel'): Promise<{ ok: true }>
  listChatMessages(userId: string, limit?: number): Promise<ChatMessage[]>
  sendChatMessage(userId: string, body: string): Promise<ChatMessage>
  listBusinesses(userId: string): Promise<BusinessOption[]>
  createBusiness(userId: string, input: CreateBusinessInput): Promise<BusinessOption>
  createBusinessProduct(userId: string, businessId: string, input: CreateBusinessProductInput): Promise<BusinessOption>
  orderBusinessProduct(userId: string, productId: string, quantity: number, idempotencyKey: string): Promise<{ orderId: string; totalMinor: number; balanceMinor: number }>
  listMarketplace(userId: string): Promise<MarketplaceListing[]>
  createListing(userId: string, input: CreateListingInput): Promise<MarketplaceListing>
  buyListing(userId: string, listingId: string, quantity: number, idempotencyKey: string): Promise<{ orderId: string; totalMinor: number; balanceMinor: number }>
  listAds(userId: string): Promise<AdvertisementOption[]>
  createAd(userId: string, input: CreateAdInput): Promise<AdvertisementOption>
  recordAdImpression(userId: string, adId: string): Promise<void>
  recordAdClick(userId: string, adId: string): Promise<void>
  submitReport(userId: string, input: ReportInput): Promise<{ id: string; status: string }>
  listReports(userId: string): Promise<Array<{ id: string; reasonCode: string; status: string; createdAt: string; details: string }>>
  moderateReport(userId: string, reportId: string, actionType: string, reason: string, durationSeconds?: number | null): Promise<{ ok: true }>
  recordAnalytics(userId: string | null, eventName: string, properties: Record<string, unknown>): Promise<void>
  listNotifications(userId: string): Promise<Array<{ id: string; kind: string; title: string; body: string; readAt: string | null; createdAt: string }>>
  markNotificationRead(userId: string, notificationId: string): Promise<void>
  getAnalyticsSummary(userId: string): Promise<{ eventsLast24h: number; activeUsersLast24h: number; topEvents: Array<{ eventName: string; count: number }> }>
}

type MemoryEvent = EventOption & { attendees: Map<string, 'registered' | 'attended' | 'cancelled' | 'waitlisted'> }
type MemoryBusiness = BusinessOption & { ownerUserId: string }
type MemoryListing = MarketplaceListing & { sellerId: string }
type MemoryReport = { id: string; reporterId: string; reportedUserId: string | null; reasonCode: string; status: string; createdAt: string; details: string }
type MemoryAd = AdvertisementOption & { impressions: number; clicks: number }

export class MemorySocialStore implements SocialStore {
  readonly mode = 'preview-memory' as const
  private readonly events = new Map<string, MemoryEvent>()
  private readonly requests = new Map<string, { id: string; requesterId: string; recipientId: string; status: string }>()
  private readonly friendships = new Map<string, Set<string>>()
  private readonly chats = new Map<string, ChatMessage[]>()
  private readonly chatRate = new Map<string, number[]>()
  private readonly businesses = new Map<string, MemoryBusiness>()
  private readonly businessProducts = new Map<string, { businessId: string; id: string; name: string; description: string; kind: 'product' | 'service'; priceMinor: number }>()
  private readonly businessOrders = new Map<string, { orderId: string; totalMinor: number; balanceMinor: number }>()
  private readonly listings = new Map<string, MemoryListing>()
  private readonly marketplaceOrders = new Map<string, { orderId: string; totalMinor: number; balanceMinor: number }>()
  private readonly ads = new Map<string, MemoryAd>()
  private readonly reports = new Map<string, MemoryReport>()
  private readonly auditLogs: Array<{ actorUserId: string; action: string; entityType: string; entityId: string; createdAt: string }> = []
  private readonly notifications = new Map<string, Array<{ id: string; kind: string; title: string; body: string; readAt: string | null; createdAt: string }>>()
  private readonly analytics: Array<{ userId: string | null; eventName: string; createdAt: number }> = []

  constructor(private readonly accounts: AccountStore, private readonly economy: LifeStore) {
    const now = Date.now()
    for (const catalogEvent of EVENT_CATALOG) {
      const startAt = new Date(now + catalogEvent.startOffsetMinutes * 60_000)
      const endAt = new Date(startAt.getTime() + catalogEvent.durationMinutes * 60_000)
      const location = WORLD_LOCATIONS.find((candidate) => candidate.slug === catalogEvent.locationSlug)
      const event: MemoryEvent = {
        id: `catalog:${catalogEvent.slug}`,
        title: catalogEvent.title,
        description: catalogEvent.description,
        eventType: catalogEvent.eventType,
        locationId: location?.id ?? catalogEvent.locationSlug,
        locationName: location?.name ?? catalogEvent.locationSlug,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        capacity: catalogEvent.capacity,
        registeredCount: 0,
        attendeeStatus: null,
        rewards: catalogEvent.rewards,
        status: 'published',
        attendees: new Map(),
      }
      this.events.set(event.id, event)
    }
  }

  private async userName(userId: string) {
    const user = await this.accounts.getBundleByUserId(userId)
    if (!user) throw new LifeRuleError('USER_NOT_FOUND', 'That resident could not be found.', 404)
    return user.profile.displayName || 'Resident'
  }

  private async currentLocation(userId: string) {
    const state = await this.accounts.getWorldState(userId)
    if (!state) throw new LifeRuleError('WORLD_STATE_NOT_FOUND', 'Your world state is unavailable.', 404)
    return state.location.id
  }

  private addNotification(userId: string, kind: string, title: string, body: string) {
    const items = this.notifications.get(userId) ?? []
    items.unshift({ id: randomUUID(), kind, title, body, readAt: null, createdAt: new Date().toISOString() })
    this.notifications.set(userId, items.slice(0, 100))
  }

  async listEvents(userId: string) {
    return [...this.events.values()].map(({ attendees: _attendees, ...event }) => ({ ...event, registeredCount: [..._attendees.values()].filter((status) => status === 'registered').length, attendeeStatus: _attendees.get(userId) ?? null }))
  }

  async createEvent(_userId: string, input: CreateEventInput) {
    const id = randomUUID()
    const event: MemoryEvent = { id, title: input.title, description: input.description, eventType: input.eventType, locationId: input.locationId ?? null, locationName: null, startAt: input.startAt, endAt: input.endAt, capacity: input.capacity ?? null, registeredCount: 0, attendeeStatus: null, rewards: input.rewards, status: 'published', attendees: new Map() }
    this.events.set(id, event)
    this.auditLogs.push({ actorUserId: _userId, action: 'event.publish', entityType: 'event', entityId: id, createdAt: new Date().toISOString() })
    const { attendees: _attendees, ...publicEvent } = event
    return publicEvent
  }

  async registerEvent(userId: string, eventId: string, _idempotencyKey: string) {
    const event = this.events.get(eventId)
    if (!event) throw new LifeRuleError('EVENT_NOT_FOUND', 'That event could not be found.', 404)
    if (event.status !== 'published') throw new LifeRuleError('EVENT_UNAVAILABLE', 'That event is not open for registration.')
    const previous = event.attendees.get(userId)
    if (previous === 'registered' || previous === 'waitlisted') return { ...event, attendees: undefined, attendeeStatus: previous } as unknown as EventOption
    const registered = [...event.attendees.values()].filter((status) => status === 'registered').length
    const status = event.capacity !== null && registered >= event.capacity ? 'waitlisted' : 'registered'
    event.attendees.set(userId, status)
    event.registeredCount = [...event.attendees.values()].filter((item) => item === 'registered').length
    this.addNotification(userId, 'event_registration', 'Event registration updated', status === 'registered' ? 'You are registered for this fictional event.' : 'The event is full; you have been added to the waitlist.')
    return { ...event, attendees: undefined, attendeeStatus: status } as unknown as EventOption
  }

  async listFriends(userId: string) {
    const result: FriendOption[] = []
    for (const friendId of this.friendships.get(userId) ?? []) result.push({ id: friendId, displayName: await this.userName(friendId), status: 'friend', friendshipLevel: 1 })
    for (const request of this.requests.values()) {
      if (request.status !== 'pending') continue
      if (request.requesterId === userId) result.push({ id: request.recipientId, requestId: request.id, displayName: await this.userName(request.recipientId), status: 'pending_sent', friendshipLevel: null })
      if (request.recipientId === userId) result.push({ id: request.requesterId, requestId: request.id, displayName: await this.userName(request.requesterId), status: 'pending_received', friendshipLevel: null })
    }
    return result
  }

  async sendFriendRequest(userId: string, recipientId: string) {
    if (userId === recipientId) throw new LifeRuleError('FRIEND_SELF', 'You cannot send a friend request to yourself.')
    await this.userName(recipientId)
    if (this.friendships.get(userId)?.has(recipientId)) throw new LifeRuleError('ALREADY_FRIENDS', 'You are already friends.')
    const duplicate = [...this.requests.values()].find((request) => request.status === 'pending' && ((request.requesterId === userId && request.recipientId === recipientId) || (request.requesterId === recipientId && request.recipientId === userId)))
    if (duplicate) return { id: duplicate.id, status: duplicate.status }
    const request = { id: randomUUID(), requesterId: userId, recipientId, status: 'pending' }
    this.requests.set(request.id, request)
    this.addNotification(recipientId, 'friend_request', 'New friend request', 'A resident would like to connect with you.')
    return { id: request.id, status: request.status }
  }

  async respondFriendRequest(userId: string, requestId: string, action: 'accept' | 'decline' | 'cancel') {
    const request = this.requests.get(requestId)
    if (!request || request.status !== 'pending') throw new LifeRuleError('FRIEND_REQUEST_NOT_FOUND', 'That friend request is no longer pending.', 404)
    const owns = action === 'cancel' ? request.requesterId === userId : request.recipientId === userId
    if (!owns) throw new LifeRuleError('FORBIDDEN', 'You cannot change that friend request.', 403)
    request.status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled'
    if (action === 'accept') {
      if (!this.friendships.has(request.requesterId)) this.friendships.set(request.requesterId, new Set())
      if (!this.friendships.has(request.recipientId)) this.friendships.set(request.recipientId, new Set())
      this.friendships.get(request.requesterId)!.add(request.recipientId)
      this.friendships.get(request.recipientId)!.add(request.requesterId)
      this.addNotification(request.requesterId, 'friend_accepted', 'New friend', 'Your friend request was accepted.')
    }
    return { ok: true as const }
  }

  async listChatMessages(userId: string, limit = 50) {
    const locationId = await this.currentLocation(userId)
    return (this.chats.get(locationId) ?? []).slice(-Math.min(limit, 100))
  }

  async sendChatMessage(userId: string, body: string) {
    const locationId = await this.currentLocation(userId)
    const now = Date.now()
    const recent = (this.chatRate.get(userId) ?? []).filter((timestamp) => now - timestamp < 60_000)
    if (recent.length >= 20) throw new LifeRuleError('CHAT_RATE_LIMITED', 'Please slow down before sending another message.')
    recent.push(now)
    this.chatRate.set(userId, recent)
    const flagged = /(?:spamword|hateword)/i.test(body)
    const message: ChatMessage = { id: randomUUID(), senderId: userId, senderName: await this.userName(userId), body, moderationStatus: flagged ? 'flagged' : 'approved', createdAt: new Date().toISOString() }
    const messages = this.chats.get(locationId) ?? []
    messages.push(message)
    this.chats.set(locationId, messages.slice(-500))
    return message
  }

  async listBusinesses(_userId: string) {
    return [...this.businesses.values()].map(({ ownerUserId: _ownerUserId, ...business }) => ({ ...business, products: [...this.businessProducts.values()].filter((product) => product.businessId === business.id).map(({ businessId: _businessId, ...product }) => product) }))
  }

  async createBusiness(userId: string, input: CreateBusinessInput) {
    const duplicate = [...this.businesses.values()].find((business) => business.slug === input.slug)
    if (duplicate) throw new LifeRuleError('BUSINESS_SLUG_TAKEN', 'That business address is already in use.')
    const business: MemoryBusiness = { id: randomUUID(), ownerUserId: userId, name: input.name, slug: input.slug, category: input.category, description: input.description, locationId: input.locationId ?? null, locationName: null, reputation: 0, status: 'active', products: [] }
    this.businesses.set(business.id, business)
    const { ownerUserId: _ownerUserId, ...publicBusiness } = business
    return publicBusiness
  }

  async createBusinessProduct(userId: string, businessId: string, input: CreateBusinessProductInput) {
    const business = this.businesses.get(businessId)
    if (!business || business.ownerUserId !== userId) throw new LifeRuleError('FORBIDDEN', 'You do not manage that business.', 403)
    const product = { id: randomUUID(), businessId, name: input.name, description: input.description, kind: input.kind, priceMinor: input.priceMinor }
    this.businessProducts.set(product.id, product)
    return (await this.listBusinesses(userId)).find((candidate) => candidate.id === businessId)!
  }

  async orderBusinessProduct(userId: string, productId: string, quantity: number, idempotencyKey: string) {
    if (quantity < 1) throw new LifeRuleError('INVALID_QUANTITY', 'Order quantity must be at least one.')
    const orderKey = `${userId}:${idempotencyKey}`
    const previous = this.businessOrders.get(orderKey)
    if (previous) return previous
    const product = this.businessProducts.get(productId)
    if (!product) throw new LifeRuleError('PRODUCT_NOT_FOUND', 'That business product could not be found.', 404)
    const business = this.businesses.get(product.businessId)!
    if (business.ownerUserId === userId) throw new LifeRuleError('BUSINESS_SELF_ORDER', 'You cannot order from your own business.')
    const totalMinor = product.priceMinor * quantity
    const balanceMinor = await this.economy.transferVirtualQar(userId, business.ownerUserId, totalMinor, 'business_order', 'business_product', productId, `business:${orderKey}`)
    const result = { orderId: randomUUID(), totalMinor, balanceMinor }
    this.businessOrders.set(orderKey, result)
    return result
  }

  async listMarketplace(_userId: string) {
    return [...this.listings.values()].filter((listing) => listing.status === 'active').map((listing) => ({ ...listing }))
  }

  async createListing(userId: string, input: CreateListingInput) {
    const listing: MemoryListing = { id: randomUUID(), sellerId: userId, sellerName: await this.userName(userId), itemId: input.itemId ?? null, title: input.title, description: input.description, priceMinor: input.priceMinor, quantity: input.quantity, status: 'active', createdAt: new Date().toISOString() }
    this.listings.set(listing.id, listing)
    return { ...listing }
  }

  async buyListing(userId: string, listingId: string, quantity: number, idempotencyKey: string) {
    if (quantity < 1) throw new LifeRuleError('INVALID_QUANTITY', 'Purchase quantity must be at least one.')
    const orderKey = `${userId}:${idempotencyKey}`
    const previous = this.marketplaceOrders.get(orderKey)
    if (previous) return previous
    const listing = this.listings.get(listingId)
    if (!listing || listing.status !== 'active') throw new LifeRuleError('LISTING_NOT_FOUND', 'That listing is no longer available.', 404)
    if (listing.sellerId === userId) throw new LifeRuleError('MARKETPLACE_SELF_BUY', 'You cannot buy your own listing.')
    if (listing.quantity < quantity) throw new LifeRuleError('OUT_OF_STOCK', 'There is not enough quantity in that listing.')
    const totalMinor = listing.priceMinor * quantity
    const balanceMinor = await this.economy.transferVirtualQar(userId, listing.sellerId, totalMinor, 'marketplace_purchase', 'marketplace_listing', listing.id, `marketplace:${orderKey}`)
    listing.quantity -= quantity
    if (!listing.quantity) listing.status = 'sold'
    const result = { orderId: randomUUID(), totalMinor, balanceMinor }
    this.marketplaceOrders.set(orderKey, result)
    return result
  }

  async listAds(_userId: string) {
    const now = Date.now()
    return [...this.ads.values()].filter((ad) => new Date(ad.startAt).getTime() <= now && new Date(ad.endAt).getTime() > now).map(({ impressions: _impressions, clicks: _clicks, ...ad }) => ad)
  }

  async createAd(userId: string, input: CreateAdInput) {
    const ad: MemoryAd = { id: randomUUID(), title: input.title, adType: input.adType, businessId: input.businessId ?? null, destination: input.destination, startAt: input.startAt, endAt: input.endAt, impressions: 0, clicks: 0 }
    this.ads.set(ad.id, ad)
    this.auditLogs.push({ actorUserId: userId, action: 'advertisement.schedule', entityType: 'advertisement', entityId: ad.id, createdAt: new Date().toISOString() })
    return ad
  }

  async recordAdImpression(_userId: string, adId: string) { const ad = this.ads.get(adId); if (ad) ad.impressions += 1 }
  async recordAdClick(_userId: string, adId: string) { const ad = this.ads.get(adId); if (ad) ad.clicks += 1 }

  async submitReport(userId: string, input: ReportInput) {
    const report: MemoryReport = { id: randomUUID(), reporterId: userId, reportedUserId: input.reportedUserId ?? null, reasonCode: input.reasonCode, status: 'open', createdAt: new Date().toISOString(), details: input.details }
    this.reports.set(report.id, report)
    return { id: report.id, status: report.status }
  }

  async listReports(userId: string) {
    const role = await this.accounts.getAdminRole(userId)
    if (!role) throw new LifeRuleError('FORBIDDEN', 'Moderator access is required.', 403)
    return [...this.reports.values()].map((report) => ({ id: report.id, reasonCode: report.reasonCode, status: report.status, createdAt: report.createdAt, details: report.details }))
  }

  async moderateReport(userId: string, reportId: string, actionType: string, _reason: string, _durationSeconds?: number | null) {
    const role = await this.accounts.getAdminRole(userId)
    if (!role) throw new LifeRuleError('FORBIDDEN', 'Moderator access is required.', 403)
    const report = this.reports.get(reportId)
    if (!report) throw new LifeRuleError('REPORT_NOT_FOUND', 'That report could not be found.', 404)
    report.status = actionType === 'resolve' ? 'resolved' : 'triaged'
    this.auditLogs.push({ actorUserId: userId, action: `moderation.${actionType}`, entityType: 'report', entityId: reportId, createdAt: new Date().toISOString() })
    return { ok: true as const }
  }

  async recordAnalytics(userId: string | null, eventName: string, _properties: Record<string, unknown>) {
    this.analytics.push({ userId, eventName, createdAt: Date.now() })
  }

  async listNotifications(userId: string) {
    return (this.notifications.get(userId) ?? []).slice(-50).reverse()
  }

  async markNotificationRead(userId: string, notificationId: string) {
    const notification = (this.notifications.get(userId) ?? []).find((item) => item.id === notificationId)
    if (notification) notification.readAt = new Date().toISOString()
  }

  async getAnalyticsSummary(userId: string) {
    const role = await this.accounts.getAdminRole(userId)
    if (!role) throw new LifeRuleError('FORBIDDEN', 'Admin access is required.', 403)
    const since = Date.now() - 86_400_000
    const recent = this.analytics.filter((event) => event.createdAt >= since)
    const counts = new Map<string, number>()
    for (const event of recent) counts.set(event.eventName, (counts.get(event.eventName) ?? 0) + 1)
    return { eventsLast24h: recent.length, activeUsersLast24h: new Set(recent.map((event) => event.userId).filter(Boolean)).size, topEvents: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([eventName, count]) => ({ eventName, count })) }
  }
}

export class PostgresSocialStore implements SocialStore {
  readonly mode = 'postgres' as const
  private readonly pool: Pool

  constructor(private readonly accounts: AccountStore, private readonly economy: LifeStore, connectionString: string) {
    this.pool = new Pool({ connectionString, max: config.dbPoolMax, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined })
  }

  private async ensureUser(userId: string) {
    const result = await this.pool.query(`SELECT 1 FROM users WHERE id = $1 AND status = 'active'`, [userId])
    if (!result.rowCount) throw new LifeRuleError('UNAUTHENTICATED', 'Sign in to continue.', 401)
  }

  async listEvents(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query(`SELECT e.id, e.title, e.description, e.event_type, e.location_id, l.name AS location_name, e.start_at, e.end_at, e.capacity, e.rewards, e.status, count(ea.user_id) FILTER (WHERE ea.status = 'registered')::int AS registered_count, mine.status AS attendee_status FROM events e LEFT JOIN locations l ON l.id = e.location_id LEFT JOIN event_attendees ea ON ea.event_id = e.id LEFT JOIN event_attendees mine ON mine.event_id = e.id AND mine.user_id = $1 WHERE e.status IN ('published','ended') GROUP BY e.id, l.name, mine.status ORDER BY e.start_at DESC`, [userId])
    return result.rows.map(mapEventRow)
  }

  async createEvent(userId: string, input: CreateEventInput) {
    await this.ensureUser(userId)
    if (new Date(input.endAt) <= new Date(input.startAt)) throw new LifeRuleError('EVENT_TIME_INVALID', 'Event end must be after its start.')
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(`INSERT INTO events (title, description, event_type, location_id, start_at, end_at, capacity, rewards, status, created_by) VALUES ($1, $2, $3, (SELECT id FROM locations WHERE id::text = $4 OR slug = $4), $5, $6, $7, $8::jsonb, 'published', $9) RETURNING id`, [input.title, input.description, input.eventType, input.locationId ?? null, input.startAt, input.endAt, input.capacity ?? null, JSON.stringify(input.rewards), userId])
      await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'event.publish', 'event', $2, $3::jsonb)`, [userId, result.rows[0].id, JSON.stringify({ eventType: input.eventType })])
      await client.query('COMMIT')
      return (await this.listEvents(userId)).find((event) => event.id === result.rows[0].id)!
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async registerEvent(userId: string, eventId: string, idempotencyKey: string) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const eventResult = await client.query(`SELECT id, capacity, status FROM events WHERE id = $1 FOR UPDATE`, [eventId])
      const event = eventResult.rows[0]
      if (!event) throw new LifeRuleError('EVENT_NOT_FOUND', 'That event could not be found.', 404)
      if (event.status !== 'published') throw new LifeRuleError('EVENT_UNAVAILABLE', 'That event is not open for registration.')
      const existing = await client.query(`SELECT status FROM event_attendees WHERE event_id = $1 AND user_id = $2`, [eventId, userId])
      if (existing.rows[0] && ['registered', 'waitlisted'].includes(existing.rows[0].status)) { await client.query('COMMIT'); return (await this.listEvents(userId)).find((candidate) => candidate.id === eventId)! }
      const count = await client.query(`SELECT count(*)::int AS count FROM event_attendees WHERE event_id = $1 AND status = 'registered'`, [eventId])
      const status = event.capacity !== null && Number(count.rows[0].count) >= event.capacity ? 'waitlisted' : 'registered'
      await client.query(`INSERT INTO event_attendees (event_id, user_id, status) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, registered_at = now()`, [eventId, userId, status])
      await client.query(`INSERT INTO notifications (user_id, kind, title, body, payload) VALUES ($1, 'event_registration', 'Event registration updated', $2, $3::jsonb)`, [userId, status === 'registered' ? 'You are registered for this fictional event.' : 'The event is full; you have been added to the waitlist.', JSON.stringify({ eventId, status, idempotencyKey })])
      await client.query('COMMIT')
      return (await this.listEvents(userId)).find((candidate) => candidate.id === eventId)!
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async listFriends(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query(`SELECT f.friend_user_id AS id, NULL::uuid AS request_id, coalesce(p.display_name, 'Resident') AS display_name, 'friend' AS status, f.friendship_level FROM friends f JOIN profiles p ON p.user_id = f.friend_user_id WHERE f.user_id = $1 UNION ALL SELECT fr.recipient_id, fr.id, coalesce(p.display_name, 'Resident'), 'pending_sent', null FROM friend_requests fr JOIN profiles p ON p.user_id = fr.recipient_id WHERE fr.requester_id = $1 AND fr.status = 'pending' UNION ALL SELECT fr.requester_id, fr.id, coalesce(p.display_name, 'Resident'), 'pending_received', null FROM friend_requests fr JOIN profiles p ON p.user_id = fr.requester_id WHERE fr.recipient_id = $1 AND fr.status = 'pending' ORDER BY status, display_name`, [userId])
    return result.rows.map((row) => ({ id: row.id, requestId: row.request_id ?? undefined, displayName: row.display_name, status: row.status, friendshipLevel: row.friendship_level }))
  }

  async sendFriendRequest(userId: string, recipientId: string) {
    await this.ensureUser(userId)
    if (userId === recipientId) throw new LifeRuleError('FRIEND_SELF', 'You cannot send a friend request to yourself.')
    const target = await this.pool.query(`SELECT 1 FROM users WHERE id = $1 AND status = 'active'`, [recipientId])
    if (!target.rowCount) throw new LifeRuleError('USER_NOT_FOUND', 'That resident could not be found.', 404)
    const block = await this.pool.query(`SELECT 1 FROM relationships WHERE (user_id = $1 AND other_user_id = $2 OR user_id = $2 AND other_user_id = $1) AND relationship_type = 'blocked'`, [userId, recipientId])
    if (block.rowCount) throw new LifeRuleError('BLOCKED', 'That connection is unavailable.')
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(`INSERT INTO friend_requests (requester_id, recipient_id) VALUES ($1, $2) ON CONFLICT (requester_id, recipient_id) WHERE status = 'pending' DO NOTHING RETURNING id, status`, [userId, recipientId])
      if (result.rows[0]) {
        await client.query(`INSERT INTO notifications (user_id, kind, title, body, payload) VALUES ($1, 'friend_request', 'New friend request', 'A resident would like to connect with you.', $2::jsonb)`, [recipientId, JSON.stringify({ requesterId: userId, requestId: result.rows[0].id })])
        await client.query('COMMIT')
        return result.rows[0]
      }
      const existing = await client.query(`SELECT id, status FROM friend_requests WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'`, [userId, recipientId])
      await client.query('COMMIT')
      return existing.rows[0]
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async respondFriendRequest(userId: string, requestId: string, action: 'accept' | 'decline' | 'cancel') {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(`SELECT id, requester_id, recipient_id FROM friend_requests WHERE id = $1 AND status = 'pending' FOR UPDATE`, [requestId])
      const request = result.rows[0]
      if (!request) throw new LifeRuleError('FRIEND_REQUEST_NOT_FOUND', 'That friend request is no longer pending.', 404)
      const owns = action === 'cancel' ? request.requester_id === userId : request.recipient_id === userId
      if (!owns) throw new LifeRuleError('FORBIDDEN', 'You cannot change that friend request.', 403)
      const status = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'cancelled'
      await client.query(`UPDATE friend_requests SET status = $1, responded_at = now() WHERE id = $2`, [status, requestId])
      if (action === 'accept') {
        await client.query(`INSERT INTO friends (user_id, friend_user_id) VALUES ($1, $2), ($2, $1) ON CONFLICT DO NOTHING`, [request.requester_id, request.recipient_id])
        await client.query(`INSERT INTO notifications (user_id, kind, title, body, payload) VALUES ($1, 'friend_accepted', 'New friend', 'Your friend request was accepted.', $2::jsonb)`, [request.requester_id, JSON.stringify({ userId })])
      }
      await client.query('COMMIT')
      return { ok: true as const }
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async listChatMessages(userId: string, limit = 50) {
    await this.ensureUser(userId)
    const state = await this.accounts.getWorldState(userId)
    if (!state) throw new LifeRuleError('WORLD_STATE_NOT_FOUND', 'Your world state is unavailable.', 404)
    const result = await this.pool.query(`SELECT cm.id, cm.sender_id, coalesce(p.display_name, 'Resident') AS sender_name, cm.body, cm.moderation_status, cm.created_at FROM chat_messages cm JOIN chat_rooms cr ON cr.id = cm.room_id JOIN profiles p ON p.user_id = cm.sender_id WHERE cr.room_type = 'location' AND cr.location_id = $1 AND cm.moderation_status <> 'removed' ORDER BY cm.created_at DESC LIMIT $2`, [state.location.id, Math.min(limit, 100)])
    return result.rows.reverse().map(mapChatRow)
  }

  async sendChatMessage(userId: string, body: string) {
    await this.ensureUser(userId)
    const state = await this.accounts.getWorldState(userId)
    if (!state) throw new LifeRuleError('WORLD_STATE_NOT_FOUND', 'Your world state is unavailable.', 404)
    const recent = await this.pool.query(`SELECT count(*)::int AS count FROM chat_messages WHERE sender_id = $1 AND created_at > now() - interval '1 minute'`, [userId])
    if (Number(recent.rows[0].count) >= 20) throw new LifeRuleError('CHAT_RATE_LIMITED', 'Please slow down before sending another message.')
    const flagged = /(?:spamword|hateword)/i.test(body)
    const room = await this.pool.query(`INSERT INTO chat_rooms (room_type, location_id, name) VALUES ('location', $1, $2) ON CONFLICT (location_id) WHERE room_type = 'location' AND location_id IS NOT NULL DO UPDATE SET is_active = true RETURNING id`, [state.location.id, state.location.name])
    const row = await this.pool.query(`INSERT INTO chat_messages (room_id, sender_id, body, moderation_status) VALUES ($1, $2, $3, $4) RETURNING id, sender_id, body, moderation_status, created_at`, [room.rows[0].id, userId, body, flagged ? 'flagged' : 'approved'])
    const profile = await this.pool.query(`SELECT coalesce(display_name, 'Resident') AS display_name FROM profiles WHERE user_id = $1`, [userId])
    return { id: row.rows[0].id, senderId: userId, senderName: profile.rows[0]?.display_name ?? 'Resident', body: row.rows[0].body, moderationStatus: row.rows[0].moderation_status, createdAt: new Date(row.rows[0].created_at).toISOString() }
  }

  async listBusinesses(userId: string) {
    await this.ensureUser(userId)
    const businesses = await this.pool.query(`SELECT b.id, b.name, b.slug, b.category, b.description, b.location_id, l.name AS location_name, b.reputation, b.status FROM businesses b LEFT JOIN locations l ON l.id = b.location_id WHERE b.status IN ('active','paused') ORDER BY b.reputation DESC, b.name`)
    const products = await this.pool.query(`SELECT id, business_id, name, description, kind, price_minor FROM business_products WHERE is_active = true ORDER BY name`)
    return businesses.rows.map((business) => ({ id: business.id, name: business.name, slug: business.slug, category: business.category, description: business.description, locationId: business.location_id, locationName: business.location_name, reputation: Number(business.reputation), status: business.status, products: products.rows.filter((product) => product.business_id === business.id).map((product) => ({ id: product.id, name: product.name, description: product.description, kind: product.kind, priceMinor: Number(product.price_minor) })) }))
  }

  async createBusiness(userId: string, input: CreateBusinessInput) {
    await this.ensureUser(userId)
    try {
      const result = await this.pool.query(`INSERT INTO businesses (owner_user_id, name, slug, category, description, location_id, status) VALUES ($1, $2, $3, $4, $5, (SELECT id FROM locations WHERE id::text = $6 OR slug = $6), 'active') RETURNING id`, [userId, input.name, input.slug, input.category, input.description, input.locationId ?? null])
      return (await this.listBusinesses(userId)).find((business) => business.id === result.rows[0].id)!
    } catch (error) { if (isUniqueViolation(error)) throw new LifeRuleError('BUSINESS_SLUG_TAKEN', 'That business address is already in use.'); throw error }
  }

  async createBusinessProduct(userId: string, businessId: string, input: CreateBusinessProductInput) {
    const owner = await this.pool.query(`SELECT 1 FROM businesses WHERE id = $1 AND owner_user_id = $2`, [businessId, userId])
    if (!owner.rowCount) throw new LifeRuleError('FORBIDDEN', 'You do not manage that business.', 403)
    await this.pool.query(`INSERT INTO business_products (business_id, name, description, kind, price_minor) VALUES ($1, $2, $3, $4, $5)`, [businessId, input.name, input.description, input.kind, input.priceMinor])
    return (await this.listBusinesses(userId)).find((business) => business.id === businessId)!
  }

  async orderBusinessProduct(userId: string, productId: string, quantity: number, idempotencyKey: string) {
    if (quantity < 1) throw new LifeRuleError('INVALID_QUANTITY', 'Order quantity must be at least one.')
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query(`SELECT id, total_minor FROM business_orders WHERE buyer_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
      if (existing.rows[0]) {
        const balance = await client.query(`SELECT balance_minor FROM wallets WHERE user_id = $1`, [userId])
        await client.query('COMMIT')
        return { orderId: existing.rows[0].id, totalMinor: Number(existing.rows[0].total_minor), balanceMinor: Number(balance.rows[0]?.balance_minor ?? 0) }
      }
      const product = await client.query(`SELECT bp.id, bp.business_id, bp.price_minor, b.owner_user_id FROM business_products bp JOIN businesses b ON b.id = bp.business_id WHERE bp.id = $1 AND bp.is_active = true FOR UPDATE`, [productId])
      const row = product.rows[0]
      if (!row) throw new LifeRuleError('PRODUCT_NOT_FOUND', 'That business product could not be found.', 404)
      const existingAfterLock = await client.query(`SELECT id, total_minor FROM business_orders WHERE buyer_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
      if (existingAfterLock.rows[0]) {
        const balance = await client.query(`SELECT balance_minor FROM wallets WHERE user_id = $1`, [userId])
        await client.query('COMMIT')
        return { orderId: existingAfterLock.rows[0].id, totalMinor: Number(existingAfterLock.rows[0].total_minor), balanceMinor: Number(balance.rows[0]?.balance_minor ?? 0) }
      }
      if (row.owner_user_id === userId) throw new LifeRuleError('BUSINESS_SELF_ORDER', 'You cannot order from your own business.')
      const totalMinor = Number(row.price_minor) * quantity
      await lockWallets(client, [userId, row.owner_user_id])
      const buyer = await debitLedger(client, userId, totalMinor, 'business_order', 'business_product', productId, `business:buyer:${userId}:${idempotencyKey}`)
      await creditLedger(client, row.owner_user_id, totalMinor, 'business_sale', 'business_product', productId, `business:seller:${userId}:${idempotencyKey}`)
      const order = await client.query(`INSERT INTO business_orders (business_id, buyer_user_id, idempotency_key, status, total_minor, metadata) VALUES ($1, $2, $3, 'placed', $4, $5::jsonb) RETURNING id`, [row.business_id, userId, idempotencyKey, totalMinor, JSON.stringify({ idempotencyKey })])
      await client.query(`INSERT INTO business_order_items (order_id, product_id, quantity, unit_price_minor) VALUES ($1, $2, $3, $4)`, [order.rows[0].id, productId, quantity, row.price_minor])
      await client.query('COMMIT')
      return { orderId: order.rows[0].id, totalMinor, balanceMinor: buyer.balanceAfterMinor }
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async listMarketplace(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query(`SELECT ml.id, ml.seller_user_id AS seller_id, coalesce(p.display_name, 'Resident') AS seller_name, ml.item_id, ml.title, ml.description, ml.price_minor, ml.quantity, ml.status, ml.created_at FROM marketplace_listings ml JOIN profiles p ON p.user_id = ml.seller_user_id WHERE ml.status = 'active' AND ml.quantity > 0 ORDER BY ml.created_at DESC`)
    return result.rows.map((row) => ({ id: row.id, sellerId: row.seller_id, sellerName: row.seller_name, itemId: row.item_id, title: row.title, description: row.description, priceMinor: Number(row.price_minor), quantity: row.quantity, status: row.status, createdAt: new Date(row.created_at).toISOString() }))
  }

  async createListing(userId: string, input: CreateListingInput) {
    await this.ensureUser(userId)
    const result = await this.pool.query(`INSERT INTO marketplace_listings (seller_user_id, item_id, title, description, price_minor, quantity, status) VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id`, [userId, input.itemId ?? null, input.title, input.description, input.priceMinor, input.quantity])
    return (await this.listMarketplace(userId)).find((listing) => listing.id === result.rows[0].id)!
  }

  async buyListing(userId: string, listingId: string, quantity: number, idempotencyKey: string) {
    if (quantity < 1) throw new LifeRuleError('INVALID_QUANTITY', 'Purchase quantity must be at least one.')
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query(`SELECT id, total_minor FROM marketplace_orders WHERE buyer_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
      if (existing.rows[0]) {
        const balance = await client.query(`SELECT balance_minor FROM wallets WHERE user_id = $1`, [userId])
        await client.query('COMMIT')
        return { orderId: existing.rows[0].id, totalMinor: Number(existing.rows[0].total_minor), balanceMinor: Number(balance.rows[0]?.balance_minor ?? 0) }
      }
      const listingResult = await client.query(`SELECT id, seller_user_id, item_id, price_minor, quantity, status FROM marketplace_listings WHERE id = $1 FOR UPDATE`, [listingId])
      const listing = listingResult.rows[0]
      if (!listing) throw new LifeRuleError('LISTING_NOT_FOUND', 'That listing is no longer available.', 404)
      const existingAfterLock = await client.query(`SELECT id, total_minor FROM marketplace_orders WHERE buyer_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
      if (existingAfterLock.rows[0]) {
        const balance = await client.query(`SELECT balance_minor FROM wallets WHERE user_id = $1`, [userId])
        await client.query('COMMIT')
        return { orderId: existingAfterLock.rows[0].id, totalMinor: Number(existingAfterLock.rows[0].total_minor), balanceMinor: Number(balance.rows[0]?.balance_minor ?? 0) }
      }
      if (listing.status !== 'active') throw new LifeRuleError('LISTING_NOT_FOUND', 'That listing is no longer available.', 404)
      if (listing.seller_user_id === userId) throw new LifeRuleError('MARKETPLACE_SELF_BUY', 'You cannot buy your own listing.')
      if (listing.quantity < quantity) throw new LifeRuleError('OUT_OF_STOCK', 'There is not enough quantity in that listing.')
      const totalMinor = Number(listing.price_minor) * quantity
      await lockWallets(client, [userId, listing.seller_user_id])
      const buyer = await debitLedger(client, userId, totalMinor, 'marketplace_purchase', 'marketplace_listing', listing.id, `marketplace:buyer:${userId}:${idempotencyKey}`)
      await creditLedger(client, listing.seller_user_id, totalMinor, 'marketplace_sale', 'marketplace_listing', listing.id, `marketplace:seller:${userId}:${idempotencyKey}`)
      await client.query(`UPDATE marketplace_listings SET quantity = quantity - $1, status = CASE WHEN quantity - $1 = 0 THEN 'sold' ELSE status END, updated_at = now() WHERE id = $2`, [quantity, listing.id])
      if (listing.item_id) {
        const removed = await client.query(`UPDATE inventory SET quantity = quantity - $1, updated_at = now() WHERE user_id = $2 AND item_id = $3 AND quantity >= $1`, [quantity, listing.seller_user_id, listing.item_id])
        if (!removed.rowCount) throw new LifeRuleError('INVENTORY_LOW', 'The seller no longer has that item available.')
        await client.query(`INSERT INTO inventory (user_id, item_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = now()`, [userId, listing.item_id, quantity])
      }
      const order = await client.query(`INSERT INTO marketplace_orders (listing_id, buyer_user_id, seller_user_id, quantity, total_minor, idempotency_key) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [listing.id, userId, listing.seller_user_id, quantity, totalMinor, idempotencyKey])
      await client.query('COMMIT')
      return { orderId: order.rows[0].id, totalMinor, balanceMinor: buyer.balanceAfterMinor }
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async listAds(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query(`SELECT id, title, ad_type, business_id, destination, start_at, end_at FROM advertisements WHERE status IN ('active','scheduled') AND start_at <= now() AND end_at > now() ORDER BY start_at DESC`)
    return result.rows.map(mapAdRow)
  }

  async createAd(userId: string, input: CreateAdInput) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await client.query(`INSERT INTO advertisements (advertiser_user_id, business_id, ad_type, title, destination, start_at, end_at, budget_minor, status) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, 'scheduled') RETURNING id`, [userId, input.businessId ?? null, input.adType, input.title, JSON.stringify(input.destination), input.startAt, input.endAt, input.budgetMinor])
      await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'advertisement.schedule', 'advertisement', $2, $3::jsonb)`, [userId, result.rows[0].id, JSON.stringify({ adType: input.adType, budgetMinor: input.budgetMinor })])
      await client.query('COMMIT')
      return (await this.listAds(userId)).find((ad) => ad.id === result.rows[0].id) ?? { id: result.rows[0].id, title: input.title, adType: input.adType, businessId: input.businessId ?? null, destination: input.destination, startAt: input.startAt, endAt: input.endAt }
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async recordAdImpression(userId: string, adId: string) { await this.ensureUser(userId); await this.pool.query(`INSERT INTO ad_impressions (advertisement_id, user_id) VALUES ($1, $2); UPDATE advertisements SET impressions = impressions + 1, updated_at = now() WHERE id = $1`, [adId, userId]) }
  async recordAdClick(userId: string, adId: string) { await this.ensureUser(userId); await this.pool.query(`INSERT INTO ad_clicks (advertisement_id, user_id) SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM advertisements WHERE id = $1); UPDATE advertisements SET clicks = clicks + 1, updated_at = now() WHERE id = $1`, [adId, userId]) }

  async submitReport(userId: string, input: ReportInput) {
    await this.ensureUser(userId)
    const result = await this.pool.query(`INSERT INTO reports (reporter_user_id, reported_user_id, target_type, target_id, reason_code, details) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status`, [userId, input.reportedUserId ?? null, input.targetType, input.targetId ?? null, input.reasonCode, input.details])
    return result.rows[0]
  }

  async listReports(userId: string) {
    await this.ensureUser(userId)
    const role = await this.accounts.getAdminRole(userId)
    if (!role) throw new LifeRuleError('FORBIDDEN', 'Moderator access is required.', 403)
    const result = await this.pool.query(`SELECT id, reason_code, status, created_at, details FROM reports ORDER BY created_at DESC LIMIT 200`)
    return result.rows.map((row) => ({ id: row.id, reasonCode: row.reason_code, status: row.status, createdAt: new Date(row.created_at).toISOString(), details: row.details }))
  }

  async moderateReport(userId: string, reportId: string, actionType: string, reason: string, durationSeconds?: number | null) {
    await this.ensureUser(userId)
    const role = await this.accounts.getAdminRole(userId)
    if (!role) throw new LifeRuleError('FORBIDDEN', 'Moderator access is required.', 403)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const report = await client.query(`SELECT id, reported_user_id FROM reports WHERE id = $1 FOR UPDATE`, [reportId])
      if (!report.rowCount) throw new LifeRuleError('REPORT_NOT_FOUND', 'That report could not be found.', 404)
      await client.query(`INSERT INTO moderation_actions (report_id, target_user_id, moderator_user_id, action_type, reason, duration_seconds) VALUES ($1, $2, $3, $4, $5, $6)`, [reportId, report.rows[0].reported_user_id, userId, actionType, reason, durationSeconds ?? null])
      const status = actionType === 'resolve' ? 'resolved' : 'triaged'
      await client.query(`UPDATE reports SET status = $1, resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE resolved_at END WHERE id = $2`, [status, reportId])
      await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, $2, 'report', $3, $4::jsonb)`, [userId, `moderation.${actionType}`, reportId, JSON.stringify({ reason, durationSeconds: durationSeconds ?? null })])
      await client.query('COMMIT')
      return { ok: true as const }
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async recordAnalytics(userId: string | null, eventName: string, properties: Record<string, unknown>) {
    await this.pool.query(`INSERT INTO analytics_events (event_name, user_id, properties) VALUES ($1, $2, $3::jsonb)`, [eventName, userId, JSON.stringify(properties)])
  }

  async listNotifications(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query(`SELECT id, kind, title, body, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [userId])
    return result.rows.map((row) => ({ id: row.id, kind: row.kind, title: row.title, body: row.body, readAt: row.read_at ? new Date(row.read_at).toISOString() : null, createdAt: new Date(row.created_at).toISOString() }))
  }

  async markNotificationRead(userId: string, notificationId: string) {
    await this.ensureUser(userId)
    await this.pool.query(`UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2`, [notificationId, userId])
  }

  async getAnalyticsSummary(userId: string) {
    await this.ensureUser(userId)
    const role = await this.accounts.getAdminRole(userId)
    if (!role) throw new LifeRuleError('FORBIDDEN', 'Admin access is required.', 403)
    const [total, active, top] = await Promise.all([
      this.pool.query<{ count: string }>(`SELECT count(*) FROM analytics_events WHERE occurred_at > now() - interval '24 hours'`),
      this.pool.query<{ count: string }>(`SELECT count(DISTINCT user_id) FROM analytics_events WHERE occurred_at > now() - interval '24 hours' AND user_id IS NOT NULL`),
      this.pool.query<{ event_name: string; count: string }>(`SELECT event_name, count(*) FROM analytics_events WHERE occurred_at > now() - interval '24 hours' GROUP BY event_name ORDER BY count(*) DESC LIMIT 10`),
    ])
    return { eventsLast24h: Number(total.rows[0]?.count ?? 0), activeUsersLast24h: Number(active.rows[0]?.count ?? 0), topEvents: top.rows.map((row) => ({ eventName: row.event_name, count: Number(row.count) })) }
  }
}

function mapEventRow(row: any): EventOption {
  return { id: row.id, title: row.title, description: row.description, eventType: row.event_type, locationId: row.location_id, locationName: row.location_name, startAt: new Date(row.start_at).toISOString(), endAt: new Date(row.end_at).toISOString(), capacity: row.capacity, registeredCount: Number(row.registered_count ?? 0), attendeeStatus: row.attendee_status ?? null, rewards: row.rewards ?? [], status: row.status }
}

function mapChatRow(row: any): ChatMessage {
  return { id: row.id, senderId: row.sender_id, senderName: row.sender_name, body: row.body, moderationStatus: row.moderation_status, createdAt: new Date(row.created_at).toISOString() }
}

function mapAdRow(row: any): AdvertisementOption {
  return { id: row.id, title: row.title, adType: row.ad_type, businessId: row.business_id, destination: row.destination ?? {}, startAt: new Date(row.start_at).toISOString(), endAt: new Date(row.end_at).toISOString() }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505'
}

export function createSocialStore(accounts: AccountStore, economy: LifeStore): SocialStore {
  return config.databaseUrl ? new PostgresSocialStore(accounts, economy, config.databaseUrl) : new MemorySocialStore(accounts, economy)
}
