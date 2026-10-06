export type RegionSlug = 'doha' | 'the-pearl' | 'lusail' | 'outside-doha'
export type PresentationStyle = 'modern-casual' | 'thobe-inspired' | 'abaya-inspired' | 'activewear'
export type AvatarSkinTone = 'warm-sand' | 'desert-rose' | 'deep-umber' | 'pearl'
export type AvatarHairstyle = 'natural-short' | 'soft-waves' | 'textured-crop' | 'covered'
export type AvatarHairColor = 'dark-brown' | 'black' | 'chestnut' | 'silver'
export type AvatarFaceShape = 'soft-square' | 'oval' | 'round' | 'long'

export interface AvatarBundle {
  presentation: PresentationStyle
  skinTone: AvatarSkinTone
  hairstyle: AvatarHairstyle
  hairColor: AvatarHairColor
  faceShape: AvatarFaceShape
}

export interface UserBundle {
  id: string
  email: string
  createdAt: string
  profile: {
    displayName: string | null
    bio: string
    startingRegion: RegionSlug | null
    onboardingComplete: boolean
  }
  avatar: AvatarBundle
  character: {
    presentation: PresentationStyle
    level: number
  }
  wallet: {
    balanceMinor: number
    currency: 'Virtual QAR'
  }
}

export type OpeningStatus = 'open' | 'closed' | 'seasonal'
export type InteractionPointType = 'activity' | 'shop' | 'social' | 'transport' | 'scenery'

export interface InteractionPoint {
  id: string
  name: string
  type: InteractionPointType
  x: number
  y: number
}

export interface WorldLocation {
  id: string
  slug: string
  name: string
  description: string
  districtId: string
  district: string
  regionSlug: RegionSlug
  coordinates: { x: number; y: number }
  type: string
  openingStatus: OpeningStatus
  activities: string[]
  interactionPoints: InteractionPoint[]
}

export interface NearbyPlayer {
  id: string
  displayName: string
  x: number
  y: number
  status: 'online' | 'away' | 'offline'
}

export interface PlayerWorldState {
  location: WorldLocation
  x: number
  y: number
  isInside: boolean
  sequence: number
  nearbyPlayers: NearbyPlayer[]
}

export type WorldRealtimeMessage =
  | { type: 'world:ready'; state: PlayerWorldState }
  | { type: 'world:state'; state: PlayerWorldState }
  | { type: 'world:move_ack'; state: PlayerWorldState }
  | { type: 'presence:snapshot'; locationId: string; players: NearbyPlayer[] }
  | { type: 'world:error'; code: string; message: string }
  | { type: 'world:pong'; at: number }

export interface JobOption {
  id: string
  slug: string
  title: string
  description: string
  category: string
  requiredLevel: number
  salaryMinor: number
  workDurationSeconds: number
  cooldownSeconds: number
  energyCost: number
  locationId: string | null
  locationName: string | null
  current: boolean
  currentLevel: number | null
  experience: number | null
}

export interface WorkSession {
  id: string
  jobId: string
  jobTitle: string
  startedAt: string
  completeAfter: string
  completedAt: string | null
  rewardMinor: number
  energySpent: number
  status: 'active' | 'completed'
}

export interface LedgerEntry {
  id: string
  direction: 'credit' | 'debit'
  amountMinor: number
  balanceAfterMinor: number
  reasonCode: string
  createdAt: string
}

export interface InventoryEntry {
  itemId: string
  slug: string
  name: string
  description: string
  category: string
  rarity: string
  quantity: number
  metadata: Record<string, unknown>
}

export interface ShopProduct {
  id: string
  shopId: string
  shopName: string
  shopType: string
  locationId: string | null
  name: string
  description: string
  itemId: string | null
  priceMinor: number
  stockQuantity: number | null
  isActive: boolean
}

export interface HomeOption {
  id: string
  slug: string
  name: string
  tier: string
  locationId: string
  locationName: string
  purchasePriceMinor: number | null
  rentPriceMinor: number | null
  capacity: number
  furnitureSlots: number
  description: string
  activeOwnership: 'rented' | 'owned' | null
  ownershipEndsAt: string | null
}

export interface ActivityOption {
  id: string
  slug: string
  title: string
  description: string
  category: string
  locationId: string | null
  locationName: string | null
  energyCost: number
  experienceReward: number
  rewardMinor: number
  cooldownSeconds: number
  available: boolean
  nextAvailableAt: string | null
}

export interface PassportAchievement {
  id: string
  slug: string
  title: string
  description: string
  category: string
  iconKey: string | null
  progress: number
  target: number
  unlockedAt: string | null
}

export interface LifeOverview {
  balanceMinor: number
  currency: 'Virtual QAR'
  energy: number
  level: number
  experience: number
  currentJob: JobOption | null
  activeWork: WorkSession | null
  inventory: InventoryEntry[]
  homes: HomeOption[]
  activities: ActivityOption[]
  achievements: PassportAchievement[]
  unreadNotifications: number
}

export interface EventOption {
  id: string
  title: string
  description: string
  eventType: string
  locationId: string | null
  locationName: string | null
  startAt: string
  endAt: string
  capacity: number | null
  registeredCount: number
  attendeeStatus: 'registered' | 'attended' | 'cancelled' | 'waitlisted' | null
  rewards: unknown[]
  status: string
}

export interface FriendOption {
  id: string
  requestId?: string
  displayName: string
  status: 'friend' | 'pending_sent' | 'pending_received' | 'blocked'
  friendshipLevel: number | null
}

export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  body: string
  moderationStatus: 'pending' | 'approved' | 'flagged' | 'removed'
  createdAt: string
}

export interface BusinessOption {
  id: string
  name: string
  slug: string
  category: string
  description: string
  locationId: string | null
  locationName: string | null
  reputation: number
  status: string
  products: Array<{ id: string; name: string; description: string; kind: 'product' | 'service'; priceMinor: number }>
}

export interface MarketplaceListing {
  id: string
  sellerId: string
  sellerName: string
  itemId: string | null
  title: string
  description: string
  priceMinor: number
  quantity: number
  status: string
  createdAt: string
}

export interface AdvertisementOption {
  id: string
  title: string
  adType: string
  businessId: string | null
  destination: Record<string, unknown>
  startAt: string
  endAt: string
}

export interface NotificationItem {
  id: string
  kind: string
  title: string
  body: string
  readAt: string | null
  createdAt: string
}

export interface ApiErrorShape {
  error: {
    code: string
    message: string
    fields?: Record<string, string>
  }
}
