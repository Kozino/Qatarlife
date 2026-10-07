import type { ActivityOption, AdvertisementOption, ApiErrorShape, AvatarBundle, AvatarFaceShape, AvatarHairColor, AvatarHairstyle, AvatarSkinTone, BusinessOption, ChatMessage, EventOption, FriendOption, HomeOption, InventoryEntry, JobOption, LedgerEntry, LifeOverview, MarketplaceListing, NearbyPlayer, NotificationItem, PassportAchievement, PlayerWorldState, PresentationStyle, RegionSlug, ShopProduct, UserBundle, WorkSession, WorldLocation } from '../types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers, credentials: 'include' })
  const payload = (await response.json().catch(() => ({}))) as T | ApiErrorShape
  if (!response.ok) {
    const errorPayload = payload as ApiErrorShape
    const error = new Error(errorPayload.error?.message || 'Something went wrong.') as Error & { code?: string; fields?: Record<string, string>; status?: number }
    error.code = errorPayload.error?.code
    error.fields = errorPayload.error?.fields
    error.status = response.status
    throw error
  }
  return payload as T
}

export const api = {
  signup: (email: string, password: string) => request<{ user: UserBundle }>('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) => request<{ user: UserBundle }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: UserBundle }>('/api/auth/me'),
  requestPasswordReset: (email: string) => request<{ ok: true; message: string; devResetToken?: string }>('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) }),
  confirmPasswordReset: (token: string, password: string) => request<{ ok: true; message: string }>('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, password }) }),
  completeOnboarding: (payload: { displayName: string; startingRegion: RegionSlug; presentation: PresentationStyle; skinTone?: AvatarSkinTone; hairstyle?: AvatarHairstyle }) =>
    request<{ user: UserBundle }>('/api/onboarding', { method: 'PUT', body: JSON.stringify({ skinTone: 'warm-sand', hairstyle: 'natural-short', ...payload }) }),
  updateProfile: (payload: { displayName: string; bio: string }) => request<{ user: UserBundle }>('/api/profile', { method: 'PUT', body: JSON.stringify(payload) }),
  getAvatar: () => request<{ avatar: AvatarBundle }>('/api/avatar'),
  updateAvatar: (payload: { presentation: PresentationStyle; skinTone: AvatarSkinTone; hairstyle: AvatarHairstyle; hairColor: AvatarHairColor; faceShape: AvatarFaceShape }) => request<{ user: UserBundle }>('/api/avatar', { method: 'PUT', body: JSON.stringify(payload) }),
  worldLocations: () => request<{ locations: WorldLocation[] }>('/api/world/locations'),
  worldState: () => request<{ state: PlayerWorldState }>('/api/world/state'),
  nearbyPlayers: () => request<{ players: NearbyPlayer[] }>('/api/world/nearby'),
  movePlayer: (payload: { x: number; y: number; sequence: number }) => request<{ state: PlayerWorldState }>('/api/world/move', { method: 'POST', body: JSON.stringify(payload) }),
  enterLocation: (locationId: string) => request<{ state: PlayerWorldState }>('/api/world/enter', { method: 'POST', body: JSON.stringify({ locationId }) }),
  exitLocation: () => request<{ state: PlayerWorldState }>('/api/world/exit', { method: 'POST' }),
  overview: () => request<{ overview: LifeOverview }>('/api/life/overview'),
  jobs: () => request<{ jobs: JobOption[] }>('/api/jobs'),
  hireJob: (jobId: string) => request<{ job: JobOption }>(`/api/jobs/${encodeURIComponent(jobId)}/hire`, { method: 'POST' }),
  startWork: (jobId: string, idempotencyKey: string) => request<{ session: WorkSession }>('/api/work/start', { method: 'POST', body: JSON.stringify({ jobId, idempotencyKey }) }),
  completeWork: (sessionId: string, idempotencyKey: string) => request<{ session: WorkSession }>(`/api/work/${encodeURIComponent(sessionId)}/complete`, { method: 'POST', body: JSON.stringify({ idempotencyKey }) }),
  ledger: () => request<{ transactions: LedgerEntry[] }>('/api/wallet/transactions'),
  inventory: () => request<{ inventory: InventoryEntry[] }>('/api/inventory'),
  shops: () => request<{ products: ShopProduct[] }>('/api/shops'),
  purchaseProduct: (productId: string, quantity: number, idempotencyKey: string) => request<{ purchase: { product: ShopProduct; quantity: number; balanceMinor: number } }>(`/api/shops/${encodeURIComponent(productId)}/purchase`, { method: 'POST', body: JSON.stringify({ quantity, idempotencyKey }) }),
  homes: () => request<{ homes: HomeOption[] }>('/api/homes'),
  rentHome: (homeId: string, idempotencyKey: string) => request<{ home: HomeOption }>(`/api/homes/${encodeURIComponent(homeId)}/rent`, { method: 'POST', body: JSON.stringify({ idempotencyKey }) }),
  buyHome: (homeId: string, idempotencyKey: string) => request<{ home: HomeOption }>(`/api/homes/${encodeURIComponent(homeId)}/buy`, { method: 'POST', body: JSON.stringify({ idempotencyKey }) }),
  activities: () => request<{ activities: ActivityOption[] }>('/api/activities'),
  completeActivity: (activityId: string, idempotencyKey: string) => request<{ result: { activity: ActivityOption; balanceMinor: number; energy: number; experience: number } }>('/api/activities/complete', { method: 'POST', body: JSON.stringify({ activityId, idempotencyKey }) }),
  passport: () => request<{ achievements: PassportAchievement[] }>('/api/passport'),
  events: () => request<{ events: EventOption[] }>('/api/events'),
  registerEvent: (eventId: string, idempotencyKey: string) => request<{ event: EventOption }>(`/api/events/${encodeURIComponent(eventId)}/register`, { method: 'POST', body: JSON.stringify({ idempotencyKey }) }),
  friends: () => request<{ friends: FriendOption[] }>('/api/friends'),
  sendFriendRequest: (userId: string) => request<{ request: { id: string; status: string } }>('/api/friends/request', { method: 'POST', body: JSON.stringify({ userId }) }),
  respondFriendRequest: (requestId: string, action: 'accept' | 'decline' | 'cancel') => request<{ ok: true }>(`/api/friends/requests/${encodeURIComponent(requestId)}/respond`, { method: 'POST', body: JSON.stringify({ action }) }),
  chatMessages: () => request<{ messages: ChatMessage[] }>('/api/chat/location'),
  sendChatMessage: (body: string) => request<{ message: ChatMessage }>('/api/chat/location', { method: 'POST', body: JSON.stringify({ body }) }),
  businesses: () => request<{ businesses: BusinessOption[] }>('/api/businesses'),
  createBusiness: (payload: { name: string; slug: string; category: string; description: string; locationId?: string | null }) => request<{ business: BusinessOption }>('/api/businesses', { method: 'POST', body: JSON.stringify(payload) }),
  createBusinessProduct: (businessId: string, payload: { name: string; description: string; kind: 'product' | 'service'; priceMinor: number }) => request<{ business: BusinessOption }>(`/api/businesses/${encodeURIComponent(businessId)}/products`, { method: 'POST', body: JSON.stringify(payload) }),
  orderBusinessProduct: (productId: string, quantity: number, idempotencyKey: string) => request<{ order: { orderId: string; totalMinor: number; balanceMinor: number } }>(`/api/business-products/${encodeURIComponent(productId)}/order`, { method: 'POST', body: JSON.stringify({ quantity, idempotencyKey }) }),
  marketplace: () => request<{ listings: MarketplaceListing[] }>('/api/marketplace'),
  createListing: (payload: { itemId?: string | null; title: string; description: string; priceMinor: number; quantity: number }) => request<{ listing: MarketplaceListing }>('/api/marketplace/listings', { method: 'POST', body: JSON.stringify(payload) }),
  buyListing: (listingId: string, quantity: number, idempotencyKey: string) => request<{ order: { orderId: string; totalMinor: number; balanceMinor: number } }>(`/api/marketplace/listings/${encodeURIComponent(listingId)}/buy`, { method: 'POST', body: JSON.stringify({ quantity, idempotencyKey }) }),
  ads: () => request<{ advertisements: AdvertisementOption[] }>('/api/ads'),
  notifications: () => request<{ notifications: NotificationItem[] }>('/api/notifications'),
  markNotificationRead: (notificationId: string) => request<{ ok: true }>(`/api/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' }),
}

