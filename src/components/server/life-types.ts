export type LedgerDirection = 'credit' | 'debit'

export type JobOption = {
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

export type WorkSession = {
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

export type LedgerEntry = {
  id: string
  direction: LedgerDirection
  amountMinor: number
  balanceAfterMinor: number
  reasonCode: string
  createdAt: string
}

export type InventoryEntry = {
  itemId: string
  slug: string
  name: string
  description: string
  category: string
  rarity: string
  quantity: number
  metadata: Record<string, unknown>
}

export type ShopProduct = {
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

export type HomeOption = {
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

export type ActivityOption = {
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

export type PassportAchievement = {
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

export type LifeOverview = {
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

export type EventOption = {
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

export type FriendOption = {
  id: string
  requestId?: string
  displayName: string
  status: 'friend' | 'pending_sent' | 'pending_received' | 'blocked'
  friendshipLevel: number | null
}

export type ChatMessage = {
  id: string
  senderId: string
  senderName: string
  body: string
  moderationStatus: 'pending' | 'approved' | 'flagged' | 'removed'
  createdAt: string
}

export type BusinessOption = {
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

export type MarketplaceListing = {
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

export type AdvertisementOption = {
  id: string
  title: string
  adType: string
  businessId: string | null
  destination: Record<string, unknown>
  startAt: string
  endAt: string
}
