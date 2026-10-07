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
  { slug: 'learning-facilitator', title: 'Learning facilitator', description: 'Help residents turn curiosity into shared projects and practical ideas.', category: 'learning', salaryMinor: 6_900, workDurationSeconds: 1_500, cooldownSeconds: 3_000, energyCost: 10, locationSlug: 'education-knowledge-commons' },
  { slug: 'park-coach', title: 'Community park coach', description: 'Welcome all levels to movement, games and healthier fictional routines.', category: 'wellbeing', salaryMinor: 6_300, workDurationSeconds: 1_200, cooldownSeconds: 2_400, energyCost: 9, locationSlug: 'aspire-community-park' },
  { slug: 'harbour-storyteller', title: 'Harbour storyteller', description: 'Connect visitors with the coast, craft and small stories of the south.', category: 'culture', salaryMinor: 5_900, workDurationSeconds: 1_200, cooldownSeconds: 2_400, energyCost: 8, locationSlug: 'wakrah-story-house' },
  { slug: 'mangrove-guide', title: 'Mangrove guide', description: 'Lead patient, fictional nature routes along the northern tide.', category: 'nature', salaryMinor: 6_100, workDurationSeconds: 1_500, cooldownSeconds: 3_000, energyCost: 10, locationSlug: 'khor-mangrove-boardwalk' },
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
  { slug: 'majlis-cushion', name: 'Majlis cushion', description: 'A soft fictional cushion for a welcoming gathering corner.', category: 'furniture', priceMinor: 2_100, rarity: 'common' },
  { slug: 'campus-notebook', name: 'Campus notebook', description: 'A practical fictional notebook for ideas, plans and new routes.', category: 'learning', priceMinor: 800, rarity: 'common' },
  { slug: 'mangrove-field-card', name: 'Mangrove field card', description: 'A collectible observation card from the northern tide route.', category: 'collectible', priceMinor: 1_350, rarity: 'uncommon' },
  { slug: 'dune-lantern', name: 'Dune lantern', description: 'A warm fictional light for an open-sky evening.', category: 'collectible', priceMinor: 1_600, rarity: 'uncommon' },
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
  {
    slug: 'knowledge-commons-store', name: 'Knowledge Commons Store', description: 'A fictional campus shop for ideas, stationery and thoughtful gifts.', shopType: 'learning', locationSlug: 'education-knowledge-commons',
    products: [
      { itemSlug: 'campus-notebook', name: 'Campus notebook', description: 'A notebook for ideas and plans.', priceMinor: 800, stockQuantity: null },
      { itemSlug: 'majlis-cushion', name: 'Majlis cushion', description: 'A welcoming gathering-corner piece.', priceMinor: 2_100, stockQuantity: null },
    ],
  },
  {
    slug: 'coast-and-tide', name: 'Coast & Tide', description: 'A fictional southern and northern coast shop for patient explorers.', shopType: 'nature', locationSlug: 'wakrah-old-harbour',
    products: [
      { itemSlug: 'mangrove-field-card', name: 'Mangrove field card', description: 'A collectible observation card.', priceMinor: 1_350, stockQuantity: null },
      { itemSlug: 'dune-lantern', name: 'Dune lantern', description: 'A warm light for open-sky evenings.', priceMinor: 1_600, stockQuantity: null },
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
  { slug: 'knowledge-loft', name: 'Knowledge loft', tier: 'settled', locationSlug: 'education-knowledge-commons', purchasePriceMinor: 190_000, rentPriceMinor: 6_200, capacity: 2, furnitureSlots: 10, description: 'A bright fictional loft close to gardens, ideas and late study sessions.' },
  { slug: 'harbour-courtyard', name: 'Harbour courtyard', tier: 'signature', locationSlug: 'wakrah-old-harbour', purchasePriceMinor: 265_000, rentPriceMinor: 7_800, capacity: 3, furnitureSlots: 13, description: 'A fictional courtyard home near a slower southern coast rhythm.' },
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
  { slug: 'knowledge-commons-study', title: 'Settle into a study session', description: 'Turn a quiet hour in the knowledge commons into a useful next step.', category: 'learning', locationSlug: 'education-knowledge-commons', energyCost: 5, experienceReward: 42, rewardMinor: 375, cooldownSeconds: 900 },
  { slug: 'majlis-story-circle', title: 'Join a majlis story circle', description: 'Listen generously, share a small story and leave room for another voice.', category: 'social', locationSlug: 'education-majlis-courtyard', energyCost: 4, experienceReward: 36, rewardMinor: 325, cooldownSeconds: 900 },
  { slug: 'aspire-morning-movement', title: 'Take a morning movement loop', description: 'A gentle fictional park route for starting the day with energy.', category: 'wellbeing', locationSlug: 'aspire-community-park', energyCost: 7, experienceReward: 44, rewardMinor: 400, cooldownSeconds: 1_200 },
  { slug: 'wakrah-harbour-walk', title: 'Walk the old harbour', description: 'Follow the coast, notice the boats and find a market-side detail.', category: 'exploration', locationSlug: 'wakrah-old-harbour', energyCost: 6, experienceReward: 40, rewardMinor: 375, cooldownSeconds: 900 },
  { slug: 'mangrove-boardwalk-watch', title: 'Watch the mangrove tide', description: 'Slow down for a fictional north-coast nature route and patient observation.', category: 'nature', locationSlug: 'khor-mangrove-boardwalk', energyCost: 7, experienceReward: 48, rewardMinor: 500, cooldownSeconds: 1_500 },
  { slug: 'sealine-dune-sunset', title: 'Watch the dune coast sunset', description: 'Make a calm evening of the place where open sand meets the sea.', category: 'nature', locationSlug: 'sealine-dune-camp', energyCost: 8, experienceReward: 55, rewardMinor: 625, cooldownSeconds: 1_800 },
]

export type EventCatalogEntry = {
  slug: string
  title: string
  description: string
  eventType: string
  locationSlug: string
  startOffsetMinutes: number
  durationMinutes: number
  capacity: number
  rewards: unknown[]
}

// These are recurring fictional gatherings, not real-world government or venue listings.
// The bootstrap keeps their schedule moving without touching player registrations.
export const EVENT_CATALOG: EventCatalogEntry[] = [
  { slug: 'lantern-souk-evening', title: 'Lantern Souq Evening', description: 'A warm fictional market night for makers, storytellers and new neighbours.', eventType: 'community', locationSlug: 'souq-lantern-lane', startOffsetMinutes: 15, durationMinutes: 90, capacity: 80, rewards: [{ kind: 'experience', amount: 40 }, { kind: 'passport', slug: 'showed-up' }] },
  { slug: 'corniche-twilight-walk', title: 'Corniche Twilight Walk', description: 'A guided fictional waterfront walk with skyline views and easy conversation.', eventType: 'wellbeing', locationSlug: 'corniche-waterfront', startOffsetMinutes: 45, durationMinutes: 75, capacity: 120, rewards: [{ kind: 'experience', amount: 35 }] },
  { slug: 'cultural-shore-open-stage', title: 'Cultural Shore Open Stage', description: 'A fictional open-air showcase for music, poetry, comedy and friendly applause.', eventType: 'culture', locationSlug: 'katara-amphitheatre', startOffsetMinutes: 90, durationMinutes: 120, capacity: 180, rewards: [{ kind: 'experience', amount: 60 }, { kind: 'item', slug: 'festival-wristband' }] },
  { slug: 'marina-moonlight-market', title: 'Marina Moonlight Market', description: 'A fictional waterfront market of small businesses, food stories and late lights.', eventType: 'market', locationSlug: 'pearl-marina', startOffsetMinutes: 150, durationMinutes: 120, capacity: 100, rewards: [{ kind: 'experience', amount: 50 }] },
  { slug: 'lusail-light-run', title: 'Lusail Light Run', description: 'A relaxed fictional night route through the boulevard lights; no leaderboard pressure.', eventType: 'activity', locationSlug: 'lusail-boulevard', startOffsetMinutes: 210, durationMinutes: 90, capacity: 200, rewards: [{ kind: 'experience', amount: 55 }] },
  { slug: 'desert-star-gathering', title: 'Desert Star Gathering', description: 'A fictional open-sky evening for patient observers, shared stories and quiet skies.', eventType: 'nature', locationSlug: 'desert-stars', startOffsetMinutes: 300, durationMinutes: 150, capacity: 60, rewards: [{ kind: 'experience', amount: 75 }, { kind: 'item', slug: 'star-route-kit' }] },
  { slug: 'knowledge-commons-ideas-night', title: 'Knowledge Commons Ideas Night', description: 'A fictional evening of small demos, kind questions and projects in progress.', eventType: 'learning', locationSlug: 'education-knowledge-commons', startOffsetMinutes: 360, durationMinutes: 105, capacity: 90, rewards: [{ kind: 'experience', amount: 65 }, { kind: 'item', slug: 'campus-notebook' }] },
  { slug: 'aspire-community-games', title: 'Aspire Community Games', description: 'Friendly fictional games where showing up matters more than winning.', eventType: 'sports', locationSlug: 'aspire-community-park', startOffsetMinutes: 420, durationMinutes: 120, capacity: 160, rewards: [{ kind: 'experience', amount: 60 }] },
  { slug: 'wakrah-harbour-story-night', title: 'Harbour Story Night', description: 'A fictional southern-coast gathering for craft, memory and shared stories.', eventType: 'culture', locationSlug: 'wakrah-story-house', startOffsetMinutes: 480, durationMinutes: 120, capacity: 70, rewards: [{ kind: 'experience', amount: 70 }, { kind: 'item', slug: 'majlis-cushion' }] },
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
