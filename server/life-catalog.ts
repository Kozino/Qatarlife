import type { WorldRegionSlug } from './world-types'

export type CatalogRegion = {
  slug: WorldRegionSlug
  name: string
  description: string
  sortOrder: number
}

export const CATALOG_REGIONS: CatalogRegion[] = [
  { slug: 'doha', name: 'Doha', description: 'The bright heart of the story: markets, galleries, coastline and everyday city life.', sortOrder: 10 },
  { slug: 'the-pearl', name: 'The Pearl', description: 'A marina district for slow afternoons, food, style and waterfront walks.', sortOrder: 20 },
  { slug: 'lusail', name: 'Lusail', description: 'A future-facing district of boulevards, entertainment and new neighbourhoods.', sortOrder: 30 },
  { slug: 'outside-doha', name: 'Outside Doha', description: 'Open skies, shoreline escapes, desert routes and quieter discoveries.', sortOrder: 40 },
]

export type JobCatalogEntry = {
  slug: string
  title: string
  description: string
  category: string
  salaryMinor: number
  workDurationSeconds: number
  cooldownSeconds: number
  energyCost: number
  locationSlug: string
}

export const JOB_CATALOG: JobCatalogEntry[] = [
  { slug: 'story-designer', title: 'Story designer', description: 'Shape clear, welcoming experiences for the people of the world.', category: 'creative', salaryMinor: 8_500, workDurationSeconds: 1_800, cooldownSeconds: 3_600, energyCost: 12, locationSlug: 'msheireb-art-house' },
  { slug: 'community-host', title: 'Community host', description: 'Make new residents feel seen, safe and ready to explore.', category: 'community', salaryMinor: 6_200, workDurationSeconds: 1_500, cooldownSeconds: 3_000, energyCost: 10, locationSlug: 'doha-gateway' },
  { slug: 'market-curator', title: 'Market curator', description: 'Bring colour, craft and thoughtful finds to a fictional market lane.', category: 'commerce', salaryMinor: 5_800, workDurationSeconds: 1_200, cooldownSeconds: 2_400, energyCost: 9, locationSlug: 'souq-lantern-lane' },
  { slug: 'waterfront-guide', title: 'Waterfront guide', description: 'Help visitors discover calm routes, views and sea-air moments.', category: 'hospitality', salaryMinor: 5_400, workDurationSeconds: 1_200, cooldownSeconds: 2_400, energyCost: 8, locationSlug: 'corniche-waterfront' },
  { slug: 'city-planner', title: 'City planner', description: 'Connect neighbourhood ideas into a more joyful city rhythm.', category: 'professional', salaryMinor: 7_400, workDurationSeconds: 1_800, cooldownSeconds: 3_600, energyCost: 12, locationSlug: 'west-bay-work-hub' },
  { slug: 'marina-coordinator', title: 'Marina coordinator', description: 'Keep a waterfront day moving with warmth and precision.', category: 'hospitality', salaryMinor: 6_000, workDurationSeconds: 1_500, cooldownSeconds: 3_000, energyCost: 10, locationSlug: 'pearl-marina' },
  { slug: 'event-producer', title: 'Event producer', description: 'Turn a good gathering into a shared memory.', category: 'events', salaryMinor: 7_100, workDurationSeconds: 1_500, cooldownSeconds: 3_000, energyCost: 11, locationSlug: 'katara-amphitheatre' },
  { slug: 'desert-naturalist', title: 'Desert naturalist', description: 'Guide thoughtful adventures under wide open skies.', category: 'nature', salaryMinor: 5_600, workDurationSeconds: 1_200, cooldownSeconds: 2_400, energyCost: 9, locationSlug: 'desert-camp' },
]

export type ItemCatalogEntry = {
  slug: string
  name: string
  description: string
  category: string
  priceMinor: number
  rarity: string
  metadata?: Record<string, unknown>
}

export const ITEM_CATALOG: ItemCatalogEntry[] = [
  { slug: 'woven-tote', name: 'Woven tote', description: 'A practical fictional market find for everyday errands.', category: 'style', priceMinor: 1_250, rarity: 'common' },
  { slug: 'lantern-charm', name: 'Lantern charm', description: 'A small keepsake inspired by warm evening streets.', category: 'collectible', priceMinor: 900, rarity: 'common' },
  { slug: 'sea-glass-token', name: 'Sea-glass token', description: 'A polished token from a slow waterfront walk.', category: 'collectible', priceMinor: 1_100, rarity: 'uncommon' },
  { slug: 'star-route-kit', name: 'Star-route kit', description: 'A fictional kit for patient observers of the night sky.', category: 'activity', priceMinor: 2_400, rarity: 'uncommon' },
  { slug: 'courtyard-chair', name: 'Courtyard chair', description: 'A simple furniture piece for a first home.', category: 'furniture', priceMinor: 3_200, rarity: 'common' },
  { slug: 'painted-rug', name: 'Painted rug', description: 'A fictional rug that adds colour to a quiet room.', category: 'furniture', priceMinor: 4_800, rarity: 'uncommon' },
  { slug: 'marina-postcard', name: 'Marina postcard', description: 'A share-safe memory from the waterfront.', category: 'collectible', priceMinor: 650, rarity: 'common' },
  { slug: 'festival-wristband', name: 'Festival wristband', description: 'A memento from a fictional community event.', category: 'collectible', priceMinor: 750, rarity: 'common' },
]

export type ShopCatalogEntry = {
  slug: string
  name: string
  description: string
  shopType: string
  locationSlug: string
  products: Array<{ itemSlug: string; name: string; description: string; priceMinor: number; stockQuantity: number | null }>
}

export const SHOP_CATALOG: ShopCatalogEntry[] = [
  {
    slug: 'lantern-house', name: 'Lantern House', description: 'A fictional market shop for warm little finds.', shopType: 'market', locationSlug: 'souq-lantern-lane',
    products: [
      { itemSlug: 'woven-tote', name: 'Woven tote', description: 'A practical fictional market find.', priceMinor: 1_250, stockQuantity: null },
      { itemSlug: 'lantern-charm', name: 'Lantern charm', description: 'A small evening keepsake.', priceMinor: 900, stockQuantity: null },
    ],
  },
  {
    slug: 'shoreline-studio', name: 'Shoreline Studio', description: 'A calm fictional shop for coastal memories.', shopType: 'waterfront', locationSlug: 'pearl-marina',
    products: [
      { itemSlug: 'sea-glass-token', name: 'Sea-glass token', description: 'A polished waterfront token.', priceMinor: 1_100, stockQuantity: null },
      { itemSlug: 'marina-postcard', name: 'Marina postcard', description: 'A share-safe memory from the marina.', priceMinor: 650, stockQuantity: null },
    ],
  },
  {
    slug: 'home-corner', name: 'Home Corner', description: 'A fictional furniture shop for early chapters.', shopType: 'furniture', locationSlug: 'msheireb-courtyard',
    products: [
      { itemSlug: 'courtyard-chair', name: 'Courtyard chair', description: 'A simple first-home piece.', priceMinor: 3_200, stockQuantity: null },
      { itemSlug: 'painted-rug', name: 'Painted rug', description: 'A colourful fictional rug.', priceMinor: 4_800, stockQuantity: null },
    ],
  },
  {
    slug: 'night-route-outfitter', name: 'Night Route Outfitter', description: 'A fictional activity shop for open-sky evenings.', shopType: 'activity', locationSlug: 'desert-camp',
    products: [
      { itemSlug: 'star-route-kit', name: 'Star-route kit', description: 'A kit for patient observers.', priceMinor: 2_400, stockQuantity: null },
      { itemSlug: 'festival-wristband', name: 'Festival wristband', description: 'A community-event memento.', priceMinor: 750, stockQuantity: null },
    ],
  },
]

export type HomeCatalogEntry = {
  slug: string
  name: string
  tier: string
  locationSlug: string
  purchasePriceMinor: number | null
  rentPriceMinor: number | null
  capacity: number
  furnitureSlots: number
  description: string
}

export const HOME_CATALOG: HomeCatalogEntry[] = [
  { slug: 'courtyard-room', name: 'Courtyard room', tier: 'starter', locationSlug: 'msheireb-courtyard', purchasePriceMinor: null, rentPriceMinor: 2_500, capacity: 1, furnitureSlots: 4, description: 'A small, bright room above a fictional courtyard.' },
  { slug: 'marina-studio', name: 'Marina studio', tier: 'settled', locationSlug: 'pearl-marina', purchasePriceMinor: 145_000, rentPriceMinor: 5_500, capacity: 1, furnitureSlots: 7, description: 'A fictional studio with a view toward evening boats.' },
  { slug: 'boulevard-loft', name: 'Boulevard loft', tier: 'signature', locationSlug: 'lusail-boulevard', purchasePriceMinor: 285_000, rentPriceMinor: 8_500, capacity: 2, furnitureSlots: 12, description: 'A larger fictional home for a new chapter with room to grow.' },
  { slug: 'shoreline-house', name: 'Shoreline house', tier: 'signature', locationSlug: 'beach-tide-cove', purchasePriceMinor: 420_000, rentPriceMinor: 11_000, capacity: 4, furnitureSlots: 16, description: 'A fictional shared home near a quiet beach route.' },
]

export type ActivityCatalogEntry = {
  slug: string
  title: string
  description: string
  category: string
  locationSlug: string
  energyCost: number
  experienceReward: number
  rewardMinor: number
  cooldownSeconds: number
  metadata?: Record<string, unknown>
}

export const ACTIVITY_CATALOG: ActivityCatalogEntry[] = [
  { slug: 'lantern-lane-stroll', title: 'Take a lantern-lane stroll', description: 'Slow down, notice the colours and find one small detail.', category: 'exploration', locationSlug: 'souq-lantern-lane', energyCost: 5, experienceReward: 30, rewardMinor: 350, cooldownSeconds: 900 },
  { slug: 'corniche-photo-walk', title: 'Take a waterfront photo walk', description: 'Follow the breeze and frame the city from the waterline.', category: 'exploration', locationSlug: 'corniche-waterfront', energyCost: 6, experienceReward: 35, rewardMinor: 400, cooldownSeconds: 900 },
  { slug: 'courtyard-coffee', title: 'Pause at the courtyard', description: 'Make a quiet stop and reset your next move.', category: 'wellbeing', locationSlug: 'msheireb-courtyard', energyCost: 3, experienceReward: 20, rewardMinor: 250, cooldownSeconds: 600 },
  { slug: 'skyline-sketch', title: 'Sketch the skyline', description: 'Turn a few minutes of observation into a small creative habit.', category: 'creative', locationSlug: 'west-bay-skyline', energyCost: 5, experienceReward: 30, rewardMinor: 300, cooldownSeconds: 900 },
  { slug: 'shoreline-meetup', title: 'Join a shoreline meetup', description: 'Make space for a shared moment by the cultural shore.', category: 'social', locationSlug: 'katara-cultural-shore', energyCost: 4, experienceReward: 28, rewardMinor: 320, cooldownSeconds: 900 },
  { slug: 'marina-sunset', title: 'Watch the marina sunset', description: 'A fictional sunset ritual for calm evenings.', category: 'wellbeing', locationSlug: 'pearl-marina', energyCost: 3, experienceReward: 24, rewardMinor: 275, cooldownSeconds: 600 },
  { slug: 'boulevard-night-loop', title: 'Walk the boulevard at night', description: 'Follow the lights and find a new route home.', category: 'exploration', locationSlug: 'lusail-boulevard', energyCost: 6, experienceReward: 38, rewardMinor: 450, cooldownSeconds: 900 },
  { slug: 'desert-star-route', title: 'Follow the star route', description: 'Take an open-sky pause beyond the city rhythm.', category: 'nature', locationSlug: 'desert-stars', energyCost: 8, experienceReward: 50, rewardMinor: 650, cooldownSeconds: 1_800 },
]

export type AchievementCatalogEntry = {
  slug: string
  title: string
  description: string
  category: string
  iconKey: string
  requirement: Record<string, unknown>
  reward: Record<string, unknown>
}

export const ACHIEVEMENT_CATALOG: AchievementCatalogEntry[] = [
  { slug: 'joined-qatar-life', title: 'Joined Qatar Life', description: 'Open your first chapter in the world.', category: 'milestone', iconKey: 'spark', requirement: { event: 'onboarding_complete' }, reward: { xp: 50 } },
  { slug: 'first-move', title: 'First move', description: 'Take your first server-validated step.', category: 'exploration', iconKey: 'footprints', requirement: { event: 'move', count: 1 }, reward: { xp: 25 } },
  { slug: 'first-job', title: 'First job', description: 'Take your first step into the working world.', category: 'progression', iconKey: 'briefcase', requirement: { event: 'job_started', count: 1 }, reward: { xp: 100 } },
  { slug: 'first-salary', title: 'First salary', description: 'Earn your first Virtual QAR from work.', category: 'economy', iconKey: 'wallet', requirement: { event: 'salary_earned', count: 1 }, reward: { xp: 100 } },
  { slug: 'first-home', title: 'First home', description: 'Find a place to call home.', category: 'housing', iconKey: 'home', requirement: { event: 'home_started', count: 1 }, reward: { xp: 150 } },
  { slug: 'five-activities', title: 'Finding your rhythm', description: 'Complete five activities across the world.', category: 'lifestyle', iconKey: 'spark', requirement: { event: 'activity_completed', count: 5 }, reward: { xp: 175 } },
  { slug: 'circle-of-ten', title: 'Circle of ten', description: 'Build a circle of ten friends.', category: 'social', iconKey: 'users', requirement: { event: 'friends', count: 10 }, reward: { xp: 250 } },
  { slug: 'virtual-qar-100k', title: 'A hundred thousand', description: 'Earn 100,000 Virtual QAR over time.', category: 'economy', iconKey: 'coins', requirement: { lifetime_earned_minor: 10_000_000 }, reward: { xp: 500 } },
]
