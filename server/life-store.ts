import { randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { store as accountStore, type AccountStore } from './db'
import { config } from './config'
import { ACHIEVEMENT_CATALOG, ACTIVITY_CATALOG, HOME_CATALOG, ITEM_CATALOG, JOB_CATALOG, SHOP_CATALOG } from './life-catalog'
import type { ActivityOption, HomeOption, InventoryEntry, JobOption, LedgerEntry, LifeOverview, PassportAchievement, ShopProduct, WorkSession } from './life-types'
import { WORLD_LOCATIONS } from './world-catalog'

export class LifeRuleError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message)
    this.name = 'LifeRuleError'
  }
}

type StoreMode = 'preview-memory' | 'postgres'

type MemoryWork = WorkSession & { completeAtMs: number }
type MemoryUserState = {
  balanceMinor: number
  energy: number
  level: number
  experience: number
  currentJobId: string | null
  currentJobExperience: number
  workSessions: Map<string, MemoryWork>
  ledger: LedgerEntry[]
  inventory: Map<string, number>
  ownedHomes: Map<string, { status: 'rented' | 'owned'; endsAt: string | null; startedAt: string }>
  activityCompletions: Map<string, number>
  idempotency: Map<string, unknown>
  achievementProgress: Map<string, { progress: number; unlockedAt: string | null }>
}

export interface LifeStore {
  readonly mode: StoreMode
  getOverview(userId: string): Promise<LifeOverview>
  listJobs(userId: string): Promise<JobOption[]>
  hireJob(userId: string, jobId: string): Promise<JobOption>
  startWork(userId: string, jobId: string, idempotencyKey: string): Promise<WorkSession>
  completeWork(userId: string, sessionId: string, idempotencyKey: string): Promise<WorkSession>
  listLedger(userId: string, limit?: number): Promise<LedgerEntry[]>
  listInventory(userId: string): Promise<InventoryEntry[]>
  listShops(): Promise<ShopProduct[]>
  purchaseProduct(userId: string, productId: string, quantity: number, idempotencyKey: string): Promise<{ product: ShopProduct; quantity: number; balanceMinor: number }>
  listHomes(userId: string): Promise<HomeOption[]>
  rentHome(userId: string, homeId: string, idempotencyKey: string): Promise<HomeOption>
  buyHome(userId: string, homeId: string, idempotencyKey: string): Promise<HomeOption>
  listActivities(userId: string): Promise<ActivityOption[]>
  completeActivity(userId: string, activityId: string, idempotencyKey: string): Promise<{ activity: ActivityOption; balanceMinor: number; energy: number; experience: number }>
  listPassport(userId: string): Promise<PassportAchievement[]>
  debitVirtualQar(userId: string, amountMinor: number, reasonCode: string, referenceType: string, referenceId: string, idempotencyKey: string): Promise<number>
  creditVirtualQar(userId: string, amountMinor: number, reasonCode: string, referenceType: string, referenceId: string, idempotencyKey: string): Promise<number>
  transferVirtualQar(fromUserId: string, toUserId: string, amountMinor: number, reasonCode: string, referenceType: string, referenceId: string, idempotencyKey: string): Promise<number>
}

export class MemoryLifeStore implements LifeStore {
  readonly mode = 'preview-memory' as const
  private readonly users = new Map<string, MemoryUserState>()

  constructor(private readonly accounts: AccountStore) {}

  private async state(userId: string) {
    const user = await this.accounts.getBundleByUserId(userId)
    if (!user) throw new LifeRuleError('UNAUTHENTICATED', 'Sign in to continue.', 401)
    let state = this.users.get(userId)
    if (!state) {
      state = {
        balanceMinor: user.wallet.balanceMinor,
        energy: 100,
        level: user.character.level,
        experience: 0,
        currentJobId: null,
        currentJobExperience: 0,
        workSessions: new Map(),
        ledger: [{ id: randomUUID(), direction: 'credit', amountMinor: user.wallet.balanceMinor, balanceAfterMinor: user.wallet.balanceMinor, reasonCode: 'starter_balance', createdAt: user.createdAt }],
        inventory: new Map(),
        ownedHomes: new Map(),
        activityCompletions: new Map(),
        idempotency: new Map(),
        achievementProgress: new Map(),
      }
      this.users.set(userId, state)
    }
    return state
  }

  async getOverview(userId: string) {
    const state = await this.state(userId)
    const jobs = await this.listJobs(userId)
    const activeWork = [...state.workSessions.values()].find((session) => session.status === 'active') ?? null
    return {
      balanceMinor: state.balanceMinor,
      currency: 'Virtual QAR',
      energy: state.energy,
      level: state.level,
      experience: state.experience,
      currentJob: jobs.find((job) => job.current) ?? null,
      activeWork,
      inventory: await this.listInventory(userId),
      homes: await this.listHomes(userId),
      activities: await this.listActivities(userId),
      achievements: await this.listPassport(userId),
      unreadNotifications: 0,
    } satisfies LifeOverview
  }

  async listJobs(userId: string) {
    const state = await this.state(userId)
    return JOB_CATALOG.map((job, index) => ({
      id: job.slug,
      slug: job.slug,
      title: job.title,
      description: job.description,
      category: job.category,
      requiredLevel: 1,
      salaryMinor: job.salaryMinor,
      workDurationSeconds: job.workDurationSeconds,
      cooldownSeconds: job.cooldownSeconds,
      energyCost: job.energyCost,
      locationId: job.locationSlug,
      locationName: WORLD_LOCATIONS.find((location) => location.slug === job.locationSlug)?.name ?? null,
      current: state.currentJobId === job.slug,
      currentLevel: state.currentJobId === job.slug ? 1 : null,
      experience: state.currentJobId === job.slug ? state.currentJobExperience : null,
      // Make the map operation intentionally deterministic for preview data.
      _catalogIndex: index,
    })).map(({ _catalogIndex: _ignored, ...job }) => job)
  }

  async hireJob(userId: string, jobId: string) {
    const state = await this.state(userId)
    const job = JOB_CATALOG.find((candidate) => candidate.slug === jobId)
    if (!job) throw new LifeRuleError('JOB_NOT_FOUND', 'That job is not available.', 404)
    state.currentJobId = job.slug
    state.currentJobExperience = 0
    return (await this.listJobs(userId)).find((candidate) => candidate.slug === job.slug)!
  }

  async startWork(userId: string, jobId: string, idempotencyKey: string) {
    const state = await this.state(userId)
    const previous = state.idempotency.get(`work-start:${idempotencyKey}`) as WorkSession | undefined
    if (previous) return previous
    const job = JOB_CATALOG.find((candidate) => candidate.slug === jobId)
    if (!job) throw new LifeRuleError('JOB_NOT_FOUND', 'That job is not available.', 404)
    if (state.currentJobId !== job.slug) throw new LifeRuleError('JOB_REQUIRED', 'Hire this job before starting a work session.')
    const lastCompleted = [...state.workSessions.values()].filter((session) => session.jobId === job.slug && session.status === 'completed' && session.completedAt).sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0]
    if (lastCompleted && Date.now() < new Date(lastCompleted.completedAt!).getTime() + job.cooldownSeconds * 1000) throw new LifeRuleError('JOB_COOLDOWN', 'That job is resting before your next shift.')
    if (state.energy < job.energyCost) throw new LifeRuleError('ENERGY_LOW', 'You need more energy before starting work.')
    if ([...state.workSessions.values()].some((session) => session.status === 'active')) throw new LifeRuleError('WORK_ACTIVE', 'Finish your current work session first.')
    state.energy -= job.energyCost
    const startedAt = new Date()
    const completeAt = new Date(startedAt.getTime() + job.workDurationSeconds * 1000)
    const session: MemoryWork = {
      id: randomUUID(), jobId: job.slug, jobTitle: job.title, startedAt: startedAt.toISOString(), completeAfter: completeAt.toISOString(), completedAt: null,
      rewardMinor: job.salaryMinor, energySpent: job.energyCost, status: 'active', completeAtMs: completeAt.getTime(),
    }
    state.workSessions.set(session.id, session)
    state.idempotency.set(`work-start:${idempotencyKey}`, session)
    return session
  }

  async completeWork(userId: string, sessionId: string, idempotencyKey: string) {
    const state = await this.state(userId)
    const previous = state.idempotency.get(`work-complete:${idempotencyKey}`) as WorkSession | undefined
    if (previous) return previous
    const session = state.workSessions.get(sessionId)
    if (!session) throw new LifeRuleError('WORK_NOT_FOUND', 'That work session could not be found.', 404)
    if (session.status === 'completed') return session
    if (Date.now() < session.completeAtMs) throw new LifeRuleError('WORK_NOT_READY', `Your session completes at ${session.completeAfter}.`)
    session.status = 'completed'
    session.completedAt = new Date().toISOString()
    state.balanceMinor += session.rewardMinor
    state.currentJobExperience += 100
    state.experience += 100
    const entry: LedgerEntry = { id: randomUUID(), direction: 'credit', amountMinor: session.rewardMinor, balanceAfterMinor: state.balanceMinor, reasonCode: 'work_reward', createdAt: session.completedAt }
    state.ledger.unshift(entry)
    state.idempotency.set(`work-complete:${idempotencyKey}`, session)
    return session
  }

  async listLedger(userId: string, limit = 30) {
    const state = await this.state(userId)
    return state.ledger.slice(0, Math.min(limit, 100))
  }

  async listInventory(userId: string) {
    const state = await this.state(userId)
    return ITEM_CATALOG.filter((item) => (state.inventory.get(item.slug) ?? 0) > 0).map((item) => ({
      itemId: `item:${item.slug}`, slug: item.slug, name: item.name, description: item.description, category: item.category, rarity: item.rarity,
      quantity: state.inventory.get(item.slug) ?? 0, metadata: item.metadata ?? {},
    }))
  }

  async listShops() {
    return SHOP_CATALOG.flatMap((shop) => shop.products.map((product) => ({
      id: `product:${shop.slug}:${product.itemSlug}`, shopId: `shop:${shop.slug}`, shopName: shop.name, shopType: shop.shopType,
      locationId: shop.locationSlug, name: product.name, description: product.description, itemId: `item:${product.itemSlug}`,
      priceMinor: product.priceMinor, stockQuantity: product.stockQuantity, isActive: true,
    })))
  }

  async purchaseProduct(userId: string, productId: string, quantity: number, idempotencyKey: string) {
    const state = await this.state(userId)
    const previous = state.idempotency.get(`purchase:${idempotencyKey}`) as { product: ShopProduct; quantity: number; balanceMinor: number } | undefined
    if (previous) return previous
    const product = (await this.listShops()).find((candidate) => candidate.id === productId)
    if (!product) throw new LifeRuleError('PRODUCT_NOT_FOUND', 'That product is not available.', 404)
    const total = product.priceMinor * quantity
    if (state.balanceMinor < total) throw new LifeRuleError('INSUFFICIENT_VIRTUAL_QAR', 'Your Virtual QAR balance is not high enough.')
    state.balanceMinor -= total
    const itemSlug = product.itemId?.replace(/^item:/, '')
    if (itemSlug) state.inventory.set(itemSlug, (state.inventory.get(itemSlug) ?? 0) + quantity)
    const entry: LedgerEntry = { id: randomUUID(), direction: 'debit', amountMinor: total, balanceAfterMinor: state.balanceMinor, reasonCode: 'shop_purchase', createdAt: new Date().toISOString() }
    state.ledger.unshift(entry)
    const result = { product, quantity, balanceMinor: state.balanceMinor }
    state.idempotency.set(`purchase:${idempotencyKey}`, result)
    return result
  }

  async listHomes(userId: string) {
    const state = await this.state(userId)
    return HOME_CATALOG.map((home) => {
      const owned = state.ownedHomes.get(home.slug)
      return { id: home.slug, slug: home.slug, name: home.name, tier: home.tier, locationId: home.locationSlug, locationName: WORLD_LOCATIONS.find((location) => location.slug === home.locationSlug)?.name ?? home.locationSlug, purchasePriceMinor: home.purchasePriceMinor, rentPriceMinor: home.rentPriceMinor, capacity: home.capacity, furnitureSlots: home.furnitureSlots, description: home.description, activeOwnership: owned?.status ?? null, ownershipEndsAt: owned?.endsAt ?? null }
    })
  }

  async rentHome(userId: string, homeId: string, idempotencyKey: string) {
    return this.acquireHome(userId, homeId, idempotencyKey, 'rented')
  }

  async buyHome(userId: string, homeId: string, idempotencyKey: string) {
    return this.acquireHome(userId, homeId, idempotencyKey, 'owned')
  }

  private async acquireHome(userId: string, homeId: string, idempotencyKey: string, status: 'rented' | 'owned') {
    const state = await this.state(userId)
    const previous = state.idempotency.get(`home:${status}:${idempotencyKey}`) as HomeOption | undefined
    if (previous) return previous
    const home = HOME_CATALOG.find((candidate) => candidate.slug === homeId)
    if (!home) throw new LifeRuleError('HOME_NOT_FOUND', 'That home is not available.', 404)
    if (state.ownedHomes.size > 0) throw new LifeRuleError('HOME_ALREADY_ACTIVE', 'End your current home arrangement before choosing another home.')
    const price = status === 'owned' ? home.purchasePriceMinor : home.rentPriceMinor
    if (price === null) throw new LifeRuleError('HOME_ACTION_UNAVAILABLE', 'That home does not support this arrangement.')
    if (state.balanceMinor < price) throw new LifeRuleError('INSUFFICIENT_VIRTUAL_QAR', 'Your Virtual QAR balance is not high enough.')
    state.balanceMinor -= price
    const endsAt = status === 'rented' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null
    state.ownedHomes.set(home.slug, { status, endsAt, startedAt: new Date().toISOString() })
    state.ledger.unshift({ id: randomUUID(), direction: 'debit', amountMinor: price, balanceAfterMinor: state.balanceMinor, reasonCode: status === 'rented' ? 'home_rent' : 'home_purchase', createdAt: new Date().toISOString() })
    const option = (await this.listHomes(userId)).find((candidate) => candidate.slug === home.slug)!
    state.idempotency.set(`home:${status}:${idempotencyKey}`, option)
    return option
  }

  async listActivities(userId: string) {
    const state = await this.state(userId)
    const world = await this.accounts.getWorldState(userId)
    return ACTIVITY_CATALOG.map((activity) => {
      const last = state.activityCompletions.get(activity.slug) ?? 0
      const next = last ? last + activity.cooldownSeconds * 1000 : 0
      const location = WORLD_LOCATIONS.find((candidate) => candidate.slug === activity.locationSlug)
      return { id: activity.slug, slug: activity.slug, title: activity.title, description: activity.description, category: activity.category, locationId: activity.locationSlug, locationName: location?.name ?? null, energyCost: activity.energyCost, experienceReward: activity.experienceReward, rewardMinor: activity.rewardMinor, cooldownSeconds: activity.cooldownSeconds, available: Boolean(world?.location.slug === activity.locationSlug && Date.now() >= next), nextAvailableAt: next && Date.now() < next ? new Date(next).toISOString() : null }
    })
  }

  async completeActivity(userId: string, activityId: string, idempotencyKey: string) {
    const state = await this.state(userId)
    const previous = state.idempotency.get(`activity:${idempotencyKey}`) as { activity: ActivityOption; balanceMinor: number; energy: number; experience: number } | undefined
    if (previous) return previous
    const activity = ACTIVITY_CATALOG.find((candidate) => candidate.slug === activityId)
    if (!activity) throw new LifeRuleError('ACTIVITY_NOT_FOUND', 'That activity is not available.', 404)
    const world = await this.accounts.getWorldState(userId)
    if (!world || world.location.slug !== activity.locationSlug) throw new LifeRuleError('WRONG_LOCATION', 'Move to the activity location before completing it.')
    const last = state.activityCompletions.get(activity.slug) ?? 0
    if (last && Date.now() < last + activity.cooldownSeconds * 1000) throw new LifeRuleError('ACTIVITY_COOLDOWN', 'That activity is resting before it can be completed again.')
    if (state.energy < activity.energyCost) throw new LifeRuleError('ENERGY_LOW', 'You need more energy before starting that activity.')
    state.energy -= activity.energyCost
    state.balanceMinor += activity.rewardMinor
    state.experience += activity.experienceReward
    state.activityCompletions.set(activity.slug, Date.now())
    state.ledger.unshift({ id: randomUUID(), direction: 'credit', amountMinor: activity.rewardMinor, balanceAfterMinor: state.balanceMinor, reasonCode: 'activity_reward', createdAt: new Date().toISOString() })
    const available = (await this.listActivities(userId)).find((candidate) => candidate.slug === activity.slug)!
    const result = { activity: available, balanceMinor: state.balanceMinor, energy: state.energy, experience: state.experience }
    state.idempotency.set(`activity:${idempotencyKey}`, result)
    return result
  }

  async listPassport(userId: string) {
    const state = await this.state(userId)
    const account = await this.accounts.getBundleByUserId(userId)
    const world = await this.accounts.getWorldState(userId)
    const workSessions = [...state.workSessions.values()]
    const completedWork = workSessions.filter((session) => session.status === 'completed')
    const activityCount = state.activityCompletions.size
    const earnedMinor = state.ledger.filter((entry) => entry.direction === 'credit' && entry.reasonCode !== 'starter_balance').reduce((total, entry) => total + entry.amountMinor, 0)
    const latestActivityAt = [...state.activityCompletions.values()].sort((a, b) => b - a)[0]
    const firstJob = workSessions.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())[0]
    const firstSalary = completedWork.sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime())[0]
    const firstHome = [...state.ownedHomes.values()].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())[0]
    const progressBySlug: Record<string, number> = {
      'joined-qatar-life': account?.profile.onboardingComplete ? 1 : 0,
      'first-move': world?.sequence ? 1 : 0,
      'first-job': firstJob ? 1 : 0,
      'first-salary': firstSalary ? 1 : 0,
      'first-home': firstHome ? 1 : 0,
      'five-activities': Math.min(activityCount, 5),
      'circle-of-ten': 0,
      'virtual-qar-100k': Math.min(earnedMinor, 10_000_000),
    }
    const timestampBySlug: Record<string, string | null> = {
      'joined-qatar-life': account?.profile.onboardingComplete ? account.createdAt : null,
      'first-move': world?.sequence ? account?.createdAt ?? null : null,
      'first-job': firstJob?.startedAt ?? null,
      'first-salary': firstSalary?.completedAt ?? null,
      'first-home': firstHome?.startedAt ?? null,
      'five-activities': latestActivityAt ? new Date(latestActivityAt).toISOString() : null,
      'circle-of-ten': null,
      'virtual-qar-100k': state.ledger.find((entry) => entry.direction === 'credit' && entry.reasonCode !== 'starter_balance')?.createdAt ?? null,
    }
    return ACHIEVEMENT_CATALOG.map((achievement) => {
      const requirement = achievement.requirement as { count?: number; lifetime_earned_minor?: number }
      const target = requirement.count ?? requirement.lifetime_earned_minor ?? 1
      const progress = progressBySlug[achievement.slug] ?? 0
      return { id: `achievement:${achievement.slug}`, slug: achievement.slug, title: achievement.title, description: achievement.description, category: achievement.category, iconKey: achievement.iconKey, progress, target, unlockedAt: progress >= target ? timestampBySlug[achievement.slug] ?? account?.createdAt ?? null : null }
    }) satisfies PassportAchievement[]
  }

  async debitVirtualQar(userId: string, amountMinor: number, reasonCode: string, _referenceType: string, _referenceId: string, idempotencyKey: string) {
    const state = await this.state(userId)
    const key = `external-debit:${idempotencyKey}`
    const previous = state.idempotency.get(key) as { balanceMinor: number } | undefined
    if (previous) return previous.balanceMinor
    if (amountMinor <= 0) throw new LifeRuleError('INVALID_AMOUNT', 'The Virtual QAR amount must be positive.')
    const next = state.balanceMinor - amountMinor
    if (next < 0) throw new LifeRuleError('INSUFFICIENT_VIRTUAL_QAR', 'Your Virtual QAR balance is not high enough.')
    state.balanceMinor = next
    state.ledger.unshift({ id: randomUUID(), direction: 'debit', amountMinor, balanceAfterMinor: next, reasonCode, createdAt: new Date().toISOString() })
    state.idempotency.set(key, { balanceMinor: next })
    return next
  }

  async creditVirtualQar(userId: string, amountMinor: number, reasonCode: string, _referenceType: string, _referenceId: string, idempotencyKey: string) {
    const state = await this.state(userId)
    const key = `external-credit:${idempotencyKey}`
    const previous = state.idempotency.get(key) as { balanceMinor: number } | undefined
    if (previous) return previous.balanceMinor
    if (amountMinor <= 0) throw new LifeRuleError('INVALID_AMOUNT', 'The Virtual QAR amount must be positive.')
    state.balanceMinor += amountMinor
    state.ledger.unshift({ id: randomUUID(), direction: 'credit', amountMinor, balanceAfterMinor: state.balanceMinor, reasonCode, createdAt: new Date().toISOString() })
    state.idempotency.set(key, { balanceMinor: state.balanceMinor })
    return state.balanceMinor
  }

  async transferVirtualQar(fromUserId: string, toUserId: string, amountMinor: number, reasonCode: string, _referenceType: string, _referenceId: string, idempotencyKey: string) {
    if (fromUserId === toUserId) throw new LifeRuleError('TRANSFER_SELF', 'A Virtual QAR transfer needs two different residents.')
    if (amountMinor <= 0) throw new LifeRuleError('INVALID_AMOUNT', 'The Virtual QAR amount must be positive.')
    const from = await this.state(fromUserId)
    const to = await this.state(toUserId)
    const key = `external-transfer:${idempotencyKey}`
    const previous = from.idempotency.get(key) as { balanceMinor: number } | undefined
    if (previous) return previous.balanceMinor
    const next = from.balanceMinor - amountMinor
    if (next < 0) throw new LifeRuleError('INSUFFICIENT_VIRTUAL_QAR', 'Your Virtual QAR balance is not high enough.')
    const now = new Date().toISOString()
    from.balanceMinor = next
    to.balanceMinor += amountMinor
    from.ledger.unshift({ id: randomUUID(), direction: 'debit', amountMinor, balanceAfterMinor: next, reasonCode, createdAt: now })
    to.ledger.unshift({ id: randomUUID(), direction: 'credit', amountMinor, balanceAfterMinor: to.balanceMinor, reasonCode, createdAt: now })
    from.idempotency.set(key, { balanceMinor: next })
    to.idempotency.set(`external-transfer-credit:${idempotencyKey}`, { balanceMinor: to.balanceMinor })
    return next
  }
}

export class PostgresLifeStore implements LifeStore {
  readonly mode = 'postgres' as const
  private readonly pool: Pool

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: config.dbPoolMax, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined })
  }

  private async ensureUser(userId: string) {
    const result = await this.pool.query(`SELECT 1 FROM users WHERE id = $1 AND status = 'active'`, [userId])
    if (!result.rowCount) throw new LifeRuleError('UNAUTHENTICATED', 'Sign in to continue.', 401)
  }

  async getOverview(userId: string) {
    await this.ensureUser(userId)
    const [wallet, character, jobs, inventory, homes, activities, achievements, activeWork, notifications] = await Promise.all([
      this.pool.query<{ balance_minor: string | number; currency: 'Virtual QAR' }>(`SELECT balance_minor, currency FROM wallets WHERE user_id = $1`, [userId]),
      this.pool.query<{ level: number; experience: number; energy: number }>(`SELECT level, experience, energy FROM characters WHERE user_id = $1`, [userId]),
      this.listJobs(userId), this.listInventory(userId), this.listHomes(userId), this.listActivities(userId), this.listPassport(userId),
      this.pool.query(`SELECT ws.id, ws.job_id, j.title AS job_title, ws.started_at, ws.completed_at, ws.energy_spent, j.salary_minor, j.work_duration_seconds FROM work_sessions ws JOIN jobs j ON j.id = ws.job_id WHERE ws.user_id = $1 AND ws.completed_at IS NULL ORDER BY ws.started_at DESC LIMIT 1`, [userId]),
      this.pool.query<{ count: string }>(`SELECT count(*) FROM notifications WHERE user_id = $1 AND read_at IS NULL`, [userId]),
    ])
    const job = jobs.find((candidate) => candidate.current) ?? null
    const active = activeWork.rows[0]
    const activeSession: WorkSession | null = active ? { id: active.id, jobId: active.job_id, jobTitle: active.job_title, startedAt: new Date(active.started_at).toISOString(), completeAfter: new Date(new Date(active.started_at).getTime() + Number(active.work_duration_seconds) * 1000).toISOString(), completedAt: null, rewardMinor: Number(active.salary_minor), energySpent: Number(active.energy_spent), status: 'active' } : null
    return { balanceMinor: Number(wallet.rows[0]?.balance_minor ?? 0), currency: wallet.rows[0]?.currency ?? 'Virtual QAR', energy: character.rows[0]?.energy ?? 100, level: character.rows[0]?.level ?? 1, experience: character.rows[0]?.experience ?? 0, currentJob: job, activeWork: activeSession, inventory, homes, activities, achievements, unreadNotifications: Number(notifications.rows[0]?.count ?? 0) } satisfies LifeOverview
  }

  async listJobs(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query<{ id: string; slug: string; title: string; description: string; category: string; required_level: number; salary_minor: string | number; work_duration_seconds: number; cooldown_seconds: number; energy_cost: number; location_id: string | null; location_name: string | null; player_level: number | null; player_experience: number | null; is_current: boolean | null }>(
      `SELECT j.id, j.slug, j.title, j.description, j.category, j.required_level, j.salary_minor, j.work_duration_seconds, j.cooldown_seconds, j.energy_cost, j.location_id, l.name AS location_name, pj.job_level AS player_level, pj.experience AS player_experience, pj.is_current
       FROM jobs j LEFT JOIN locations l ON l.id = j.location_id LEFT JOIN player_jobs pj ON pj.job_id = j.id AND pj.user_id = $1
       WHERE j.is_active = true ORDER BY j.category, j.title`, [userId],
    )
    return result.rows.map((row) => ({ id: row.id, slug: row.slug, title: row.title, description: row.description, category: row.category, requiredLevel: row.required_level, salaryMinor: Number(row.salary_minor), workDurationSeconds: row.work_duration_seconds, cooldownSeconds: row.cooldown_seconds, energyCost: row.energy_cost, locationId: row.location_id, locationName: row.location_name, current: Boolean(row.is_current), currentLevel: row.player_level, experience: row.player_experience }))
  }

  async hireJob(userId: string, jobId: string) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const job = await client.query(`SELECT id FROM jobs WHERE (id::text = $1 OR slug = $1) AND is_active = true`, [jobId])
      const jobIdValue = job.rows[0]?.id
      if (!jobIdValue) throw new LifeRuleError('JOB_NOT_FOUND', 'That job is not available.', 404)
      await client.query(`UPDATE player_jobs SET is_current = false WHERE user_id = $1`, [userId])
      await client.query(`INSERT INTO player_jobs (user_id, job_id, job_level, experience, is_current) VALUES ($1, $2, 1, 0, true) ON CONFLICT (user_id, job_id) DO UPDATE SET is_current = true`, [userId, jobIdValue])
      await client.query('COMMIT')
      return (await this.listJobs(userId)).find((candidate) => candidate.id === jobIdValue)!
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async startWork(userId: string, jobId: string, idempotencyKey: string) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query(`SELECT ws.id, ws.job_id, j.title AS job_title, ws.started_at, ws.completed_at, ws.energy_spent, j.salary_minor, j.work_duration_seconds FROM work_sessions ws JOIN jobs j ON j.id = ws.job_id WHERE ws.user_id = $1 AND ws.idempotency_key = $2`, [userId, idempotencyKey])
      if (existing.rows[0]) { await client.query('COMMIT'); return mapWorkRow(existing.rows[0]) }
      const row = await client.query(`SELECT j.id, j.title, j.salary_minor, j.work_duration_seconds, j.cooldown_seconds, j.energy_cost FROM jobs j JOIN player_jobs pj ON pj.job_id = j.id AND pj.user_id = $1 AND pj.is_current = true WHERE (j.id::text = $2 OR j.slug = $2) AND j.is_active = true`, [userId, jobId])
      const job = row.rows[0]
      if (!job) throw new LifeRuleError('JOB_REQUIRED', 'Hire this job before starting a work session.')
      const character = await client.query<{ energy: number }>(`SELECT energy FROM characters WHERE user_id = $1 FOR UPDATE`, [userId])
      const existingAfterCharacterLock = await client.query(`SELECT ws.id, ws.job_id, j.title AS job_title, ws.started_at, ws.completed_at, ws.energy_spent, j.salary_minor, j.work_duration_seconds FROM work_sessions ws JOIN jobs j ON j.id = ws.job_id WHERE ws.user_id = $1 AND ws.idempotency_key = $2`, [userId, idempotencyKey])
      if (existingAfterCharacterLock.rows[0]) { await client.query('COMMIT'); return mapWorkRow(existingAfterCharacterLock.rows[0]) }
      const lastCompleted = await client.query<{ completed_at: Date }>(`SELECT completed_at FROM work_sessions WHERE user_id = $1 AND job_id = $2 AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1`, [userId, job.id])
      if (lastCompleted.rows[0] && Date.now() < new Date(lastCompleted.rows[0].completed_at).getTime() + Number(job.cooldown_seconds) * 1000) throw new LifeRuleError('JOB_COOLDOWN', 'That job is resting before your next shift.')
      if ((character.rows[0]?.energy ?? 0) < job.energy_cost) throw new LifeRuleError('ENERGY_LOW', 'You need more energy before starting work.')
      const active = await client.query(`SELECT 1 FROM work_sessions WHERE user_id = $1 AND completed_at IS NULL LIMIT 1`, [userId])
      if (active.rowCount) throw new LifeRuleError('WORK_ACTIVE', 'Finish your current work session first.')
      await client.query(`UPDATE characters SET energy = energy - $1, updated_at = now() WHERE user_id = $2`, [job.energy_cost, userId])
      const inserted = await client.query(`INSERT INTO work_sessions (user_id, job_id, job_level, energy_spent, idempotency_key) VALUES ($1, $2, 1, $3, $4) RETURNING id, job_id, started_at, completed_at, energy_spent`, [userId, job.id, job.energy_cost, idempotencyKey])
      await client.query('COMMIT')
      return { id: inserted.rows[0].id, jobId: job.id, jobTitle: job.title, startedAt: new Date(inserted.rows[0].started_at).toISOString(), completeAfter: new Date(new Date(inserted.rows[0].started_at).getTime() + Number(job.work_duration_seconds) * 1000).toISOString(), completedAt: null, rewardMinor: Number(job.salary_minor), energySpent: Number(job.energy_cost), status: 'active' } satisfies WorkSession
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async completeWork(userId: string, sessionId: string, idempotencyKey: string) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existingTx = await client.query(`SELECT ws.id, ws.job_id, j.title AS job_title, ws.started_at, ws.completed_at, ws.energy_spent, j.salary_minor, j.work_duration_seconds FROM work_sessions ws JOIN jobs j ON j.id = ws.job_id WHERE ws.user_id = $1 AND ws.idempotency_key = $2`, [userId, idempotencyKey])
      if (existingTx.rows[0] && existingTx.rows[0].completed_at) { await client.query('COMMIT'); return mapWorkRow(existingTx.rows[0]) }
      const result = await client.query(`SELECT ws.id, ws.job_id, ws.started_at, ws.completed_at, ws.energy_spent, j.title AS job_title, j.salary_minor, j.work_duration_seconds FROM work_sessions ws JOIN jobs j ON j.id = ws.job_id WHERE ws.id = $1 AND ws.user_id = $2 FOR UPDATE`, [sessionId, userId])
      const row = result.rows[0]
      if (!row) throw new LifeRuleError('WORK_NOT_FOUND', 'That work session could not be found.', 404)
      if (row.completed_at) { await client.query('COMMIT'); return mapWorkRow(row) }
      const completeAfter = new Date(new Date(row.started_at).getTime() + Number(row.work_duration_seconds) * 1000)
      if (Date.now() < completeAfter.getTime()) throw new LifeRuleError('WORK_NOT_READY', `Your session completes at ${completeAfter.toISOString()}.`)
      const transaction = await creditLedger(client, userId, Number(row.salary_minor), 'work_reward', 'work_session', row.id, idempotencyKey)
      await client.query(`UPDATE work_sessions SET completed_at = now(), reward_transaction_id = $1 WHERE id = $2`, [transaction.id, row.id])
      await client.query(`UPDATE characters SET experience = experience + 100, updated_at = now() WHERE user_id = $1`, [userId])
      await client.query(`UPDATE player_jobs SET experience = experience + 100 WHERE user_id = $1 AND job_id = $2`, [userId, row.job_id])
      await client.query('COMMIT')
      return { id: row.id, jobId: row.job_id, jobTitle: row.job_title, startedAt: new Date(row.started_at).toISOString(), completeAfter: completeAfter.toISOString(), completedAt: new Date().toISOString(), rewardMinor: Number(row.salary_minor), energySpent: Number(row.energy_spent), status: 'completed' } satisfies WorkSession
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async listLedger(userId: string, limit = 30) {
    await this.ensureUser(userId)
    const result = await this.pool.query<{ id: string; direction: 'credit' | 'debit'; amount_minor: string | number; balance_after_minor: string | number; reason_code: string; created_at: Date }>(`SELECT id, direction, amount_minor, balance_after_minor, reason_code, created_at FROM wallet_transactions WHERE wallet_user_id = $1 ORDER BY created_at DESC LIMIT $2`, [userId, Math.min(limit, 100)])
    return result.rows.map((row) => ({ id: row.id, direction: row.direction, amountMinor: Number(row.amount_minor), balanceAfterMinor: Number(row.balance_after_minor), reasonCode: row.reason_code, createdAt: new Date(row.created_at).toISOString() }))
  }

  async listInventory(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query<{ item_id: string; slug: string; name: string; description: string; category: string; rarity: string; quantity: number; metadata: Record<string, unknown> }>(`SELECT i.id AS item_id, i.slug, i.name, i.description, i.category, i.rarity, inv.quantity, inv.metadata FROM inventory inv JOIN items i ON i.id = inv.item_id WHERE inv.user_id = $1 AND inv.quantity > 0 ORDER BY i.category, i.name`, [userId])
    return result.rows.map((row) => ({ itemId: row.item_id, slug: row.slug, name: row.name, description: row.description, category: row.category, rarity: row.rarity, quantity: row.quantity, metadata: row.metadata ?? {} }))
  }

  async listShops() {
    const result = await this.pool.query<{ id: string; shop_id: string; shop_name: string; shop_type: string; location_id: string | null; name: string; description: string; item_id: string | null; price_minor: string | number; stock_quantity: number | null; is_active: boolean }>(`SELECT p.id, s.id AS shop_id, s.name AS shop_name, s.shop_type, s.location_id, p.name, p.description, p.item_id, p.price_minor, p.stock_quantity, p.is_active FROM products p JOIN shops s ON s.id = p.shop_id WHERE s.is_active = true AND p.is_active = true ORDER BY s.name, p.name`)
    return result.rows.map((row) => ({ id: row.id, shopId: row.shop_id, shopName: row.shop_name, shopType: row.shop_type, locationId: row.location_id, name: row.name, description: row.description, itemId: row.item_id, priceMinor: Number(row.price_minor), stockQuantity: row.stock_quantity, isActive: row.is_active }))
  }

  async purchaseProduct(userId: string, productId: string, quantity: number, idempotencyKey: string) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query(`SELECT metadata FROM wallet_transactions WHERE wallet_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
      if (existing.rows[0]?.metadata?.purchase) { await client.query('COMMIT'); return existing.rows[0].metadata.purchase as { product: ShopProduct; quantity: number; balanceMinor: number } }
      if (existing.rows[0]) throw new LifeRuleError('IDEMPOTENCY_CONFLICT', 'That idempotency key was already used for a different purchase.')
      const productResult = await client.query(`SELECT p.id, s.id AS shop_id, s.name AS shop_name, s.shop_type, s.location_id, p.name, p.description, p.item_id, p.price_minor, p.stock_quantity, p.is_active FROM products p JOIN shops s ON s.id = p.shop_id WHERE p.id = $1 AND p.is_active = true AND s.is_active = true FOR UPDATE`, [productId])
      const row = productResult.rows[0]
      if (!row) throw new LifeRuleError('PRODUCT_NOT_FOUND', 'That product is not available.', 404)
      const existingAfterProductLock = await client.query(`SELECT metadata FROM wallet_transactions WHERE wallet_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
      if (existingAfterProductLock.rows[0]?.metadata?.purchase) { await client.query('COMMIT'); return existingAfterProductLock.rows[0].metadata.purchase as { product: ShopProduct; quantity: number; balanceMinor: number } }
      if (existingAfterProductLock.rows[0]) throw new LifeRuleError('IDEMPOTENCY_CONFLICT', 'That idempotency key was already used for a different purchase.')
      if (row.stock_quantity !== null && row.stock_quantity < quantity) throw new LifeRuleError('OUT_OF_STOCK', 'There is not enough stock for that purchase.')
      const product = { id: row.id, shopId: row.shop_id, shopName: row.shop_name, shopType: row.shop_type, locationId: row.location_id, name: row.name, description: row.description, itemId: row.item_id, priceMinor: Number(row.price_minor), stockQuantity: row.stock_quantity, isActive: row.is_active } satisfies ShopProduct
      const wallet = await client.query<{ balance_minor: string | number }>(`SELECT balance_minor FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId])
      if (!wallet.rows[0]) throw new LifeRuleError('WALLET_NOT_FOUND', 'Your wallet could not be found.', 404)
      const expectedBalanceMinor = Number(wallet.rows[0].balance_minor) - product.priceMinor * quantity
      const transaction = await debitLedger(client, userId, product.priceMinor * quantity, 'shop_purchase', 'product', product.id, idempotencyKey, { purchase: { product, quantity, balanceMinor: expectedBalanceMinor } })
      if (row.stock_quantity !== null) await client.query(`UPDATE products SET stock_quantity = stock_quantity - $1, updated_at = now() WHERE id = $2`, [quantity, product.id])
      if (product.itemId) await client.query(`INSERT INTO inventory (user_id, item_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (user_id, item_id) DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = now()`, [userId, product.itemId, quantity])
      const result = { product, quantity, balanceMinor: transaction.balanceAfterMinor }
      await client.query('COMMIT')
      return result
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async listHomes(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query<{ id: string; slug: string; name: string; tier: string; location_id: string; location_name: string; purchase_price_minor: string | number | null; rent_price_minor: string | number | null; capacity: number; furniture_slots: number; description: string | null; ownership_status: 'rented' | 'owned' | null; ends_at: Date | null }>(`SELECT h.id, h.slug, h.name, h.tier, h.location_id, l.name AS location_name, h.purchase_price_minor, h.rent_price_minor, h.capacity, h.furniture_slots, h.metadata->>'description' AS description, ho.status AS ownership_status, ho.ends_at FROM homes h JOIN locations l ON l.id = h.location_id LEFT JOIN LATERAL (SELECT status, ends_at FROM home_ownership WHERE home_id = h.id AND user_id = $1 AND status IN ('rented','owned') ORDER BY started_at DESC LIMIT 1) ho ON true WHERE h.is_active = true ORDER BY h.tier, h.name`, [userId])
    return result.rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name, tier: row.tier, locationId: row.location_id, locationName: row.location_name, purchasePriceMinor: row.purchase_price_minor === null ? null : Number(row.purchase_price_minor), rentPriceMinor: row.rent_price_minor === null ? null : Number(row.rent_price_minor), capacity: row.capacity, furnitureSlots: row.furniture_slots, description: row.description ?? '', activeOwnership: row.ownership_status, ownershipEndsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null }))
  }

  async rentHome(userId: string, homeId: string, idempotencyKey: string) { return this.acquireHome(userId, homeId, idempotencyKey, 'rented') }
  async buyHome(userId: string, homeId: string, idempotencyKey: string) { return this.acquireHome(userId, homeId, idempotencyKey, 'owned') }

  private async acquireHome(userId: string, homeId: string, idempotencyKey: string, status: 'rented' | 'owned') {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      // Serialize home changes for one player before checking active ownership.
      // This closes the race where two different homes could otherwise both pass
      // the active-arrangement check.
      const walletLock = await client.query(`SELECT user_id FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId])
      if (!walletLock.rowCount) throw new LifeRuleError('WALLET_NOT_FOUND', 'Your wallet could not be found.', 404)
      const homeResult = await client.query(`SELECT h.id, h.purchase_price_minor, h.rent_price_minor FROM homes h WHERE (h.id::text = $1 OR h.slug = $1) AND h.is_active = true FOR UPDATE`, [homeId])
      const home = homeResult.rows[0]
      if (!home) throw new LifeRuleError('HOME_NOT_FOUND', 'That home is not available.', 404)
      const active = await client.query(`SELECT 1 FROM home_ownership WHERE user_id = $1 AND status IN ('rented','owned') AND (ends_at IS NULL OR ends_at > now()) LIMIT 1`, [userId])
      if (active.rowCount) throw new LifeRuleError('HOME_ALREADY_ACTIVE', 'End your current home arrangement before choosing another home.')
      const price = status === 'owned' ? home.purchase_price_minor : home.rent_price_minor
      if (price === null) throw new LifeRuleError('HOME_ACTION_UNAVAILABLE', 'That home does not support this arrangement.')
      const tx = await debitLedger(client, userId, Number(price), status === 'owned' ? 'home_purchase' : 'home_rent', 'home', home.id, idempotencyKey)
      const endsAt = status === 'rented' ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null
      await client.query(`INSERT INTO home_ownership (home_id, user_id, status, ends_at) VALUES ($1, $2, $3, $4)`, [home.id, userId, status, endsAt])
      await client.query('COMMIT')
      return (await this.listHomes(userId)).find((candidate) => candidate.id === home.id)!
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async listActivities(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query<{ id: string; slug: string; title: string; description: string; category: string; location_id: string | null; location_name: string | null; energy_cost: number; experience_reward: number; reward_minor: string | number; cooldown_seconds: number; last_completed_at: Date | null }>(`SELECT a.id, a.slug, a.title, a.description, a.category, a.location_id, l.name AS location_name, a.energy_cost, a.experience_reward, a.reward_minor, a.cooldown_seconds, max(pac.completed_at) AS last_completed_at FROM activity_catalog a LEFT JOIN locations l ON l.id = a.location_id LEFT JOIN player_activity_completions pac ON pac.activity_id = a.id AND pac.user_id = $1 WHERE a.is_active = true GROUP BY a.id, l.name ORDER BY a.category, a.title`, [userId])
    const world = await this.pool.query<{ location_id: string }>(`SELECT location_id FROM player_locations WHERE user_id = $1`, [userId])
    return result.rows.map((row) => { const next = row.last_completed_at ? new Date(new Date(row.last_completed_at).getTime() + row.cooldown_seconds * 1000) : null; return { id: row.id, slug: row.slug, title: row.title, description: row.description, category: row.category, locationId: row.location_id, locationName: row.location_name, energyCost: row.energy_cost, experienceReward: row.experience_reward, rewardMinor: Number(row.reward_minor), cooldownSeconds: row.cooldown_seconds, available: Boolean(world.rows[0]?.location_id === row.location_id && (!next || Date.now() >= next.getTime())), nextAvailableAt: next && Date.now() < next.getTime() ? next.toISOString() : null } })
  }

  async completeActivity(userId: string, activityId: string, idempotencyKey: string) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const existing = await client.query(`SELECT metadata FROM wallet_transactions WHERE wallet_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
      if (existing.rows[0]?.metadata?.activity) { await client.query('COMMIT'); return existing.rows[0].metadata.activity }
      if (existing.rows[0]) throw new LifeRuleError('IDEMPOTENCY_CONFLICT', 'That idempotency key was already used for a different activity.')
      const activityResult = await client.query(`SELECT a.*, l.slug AS location_slug, l.name AS location_name FROM activity_catalog a LEFT JOIN locations l ON l.id = a.location_id WHERE (a.id::text = $1 OR a.slug = $1) AND a.is_active = true`, [activityId])
      const activity = activityResult.rows[0]
      if (!activity) throw new LifeRuleError('ACTIVITY_NOT_FOUND', 'That activity is not available.', 404)
      const world = await client.query(`SELECT pl.location_id, c.energy, c.experience FROM player_locations pl JOIN characters c ON c.user_id = pl.user_id WHERE pl.user_id = $1 FOR UPDATE`, [userId])
      const existingAfterCharacterLock = await client.query(`SELECT metadata FROM wallet_transactions WHERE wallet_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
      if (existingAfterCharacterLock.rows[0]?.metadata?.activity) { await client.query('COMMIT'); return existingAfterCharacterLock.rows[0].metadata.activity }
      if (existingAfterCharacterLock.rows[0]) throw new LifeRuleError('IDEMPOTENCY_CONFLICT', 'That idempotency key was already used for a different activity.')
      if (!world.rows[0] || world.rows[0].location_id !== activity.location_id) throw new LifeRuleError('WRONG_LOCATION', 'Move to the activity location before completing it.')
      if (world.rows[0].energy < activity.energy_cost) throw new LifeRuleError('ENERGY_LOW', 'You need more energy before starting that activity.')
      const recent = await client.query(`SELECT completed_at FROM player_activity_completions WHERE user_id = $1 AND activity_id = $2 ORDER BY completed_at DESC LIMIT 1`, [userId, activity.id])
      if (recent.rows[0] && Date.now() < new Date(recent.rows[0].completed_at).getTime() + activity.cooldown_seconds * 1000) throw new LifeRuleError('ACTIVITY_COOLDOWN', 'That activity is resting before it can be completed again.')
      const wallet = await client.query<{ balance_minor: string | number }>(`SELECT balance_minor FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId])
      if (!wallet.rows[0]) throw new LifeRuleError('WALLET_NOT_FOUND', 'Your wallet could not be found.', 404)
      await client.query(`UPDATE characters SET energy = energy - $1, experience = experience + $2, updated_at = now() WHERE user_id = $3`, [activity.energy_cost, activity.experience_reward, userId])
      const payload = { activity: { id: activity.id, slug: activity.slug, title: activity.title, description: activity.description, category: activity.category, locationId: activity.location_id, locationName: activity.location_name, energyCost: activity.energy_cost, experienceReward: activity.experience_reward, rewardMinor: Number(activity.reward_minor), cooldownSeconds: activity.cooldown_seconds, available: false, nextAvailableAt: new Date(Date.now() + activity.cooldown_seconds * 1000).toISOString() }, balanceMinor: Number(wallet.rows[0].balance_minor) + Number(activity.reward_minor), energy: Number(world.rows[0].energy) - activity.energy_cost, experience: Number(world.rows[0].experience) + activity.experience_reward }
      const tx = await creditLedger(client, userId, Number(activity.reward_minor), 'activity_reward', 'activity', activity.id, idempotencyKey, { activity: payload })
      payload.balanceMinor = tx.balanceAfterMinor
      await client.query(`INSERT INTO player_activity_completions (user_id, activity_id, reward_transaction_id, idempotency_key) VALUES ($1, $2, $3, $4)`, [userId, activity.id, tx.id, idempotencyKey])
      await client.query('COMMIT')
      return payload
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async listPassport(userId: string) {
    await this.ensureUser(userId)
    const result = await this.pool.query<{ id: string; slug: string; title: string; description: string; category: string; icon_key: string | null; progress: string | number; target: string | number; unlocked_at: Date | null }>(
      `WITH metrics AS (
         SELECT a.id, a.slug, a.title, a.description, a.category, a.icon_key,
           CASE a.slug
             WHEN 'joined-qatar-life' THEN CASE WHEN p.onboarding_complete THEN 1 ELSE 0 END
             WHEN 'first-move' THEN CASE WHEN coalesce(pl.last_sequence, 0) > 0 THEN 1 ELSE 0 END
             WHEN 'first-job' THEN CASE WHEN EXISTS (SELECT 1 FROM work_sessions ws WHERE ws.user_id = u.id) THEN 1 ELSE 0 END
             WHEN 'first-salary' THEN CASE WHEN EXISTS (SELECT 1 FROM work_sessions ws WHERE ws.user_id = u.id AND ws.completed_at IS NOT NULL) THEN 1 ELSE 0 END
             WHEN 'first-home' THEN CASE WHEN EXISTS (SELECT 1 FROM home_ownership ho WHERE ho.user_id = u.id AND ho.status IN ('rented', 'owned')) THEN 1 ELSE 0 END
             WHEN 'five-activities' THEN least(5, (SELECT count(*) FROM player_activity_completions pac WHERE pac.user_id = u.id))
             WHEN 'circle-of-ten' THEN least(10, (SELECT count(*) FROM friends f WHERE f.user_id = u.id))
             WHEN 'virtual-qar-100k' THEN least(10000000, coalesce((SELECT sum(wt.amount_minor) FROM wallet_transactions wt WHERE wt.wallet_user_id = u.id AND wt.direction = 'credit' AND wt.reason_code <> 'starter_balance'), 0))
             ELSE coalesce(pa.progress, 0)
           END AS progress,
           CASE a.slug
             WHEN 'five-activities' THEN 5
             WHEN 'circle-of-ten' THEN 10
             WHEN 'virtual-qar-100k' THEN 10000000
             ELSE 1
           END AS target,
           pa.unlocked_at, u.created_at
         FROM achievements a
         JOIN users u ON u.id = $1
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN player_locations pl ON pl.user_id = u.id
         LEFT JOIN player_achievements pa ON pa.achievement_id = a.id AND pa.user_id = u.id
         WHERE a.is_active = true
       )
       SELECT id, slug, title, description, category, icon_key, progress, target,
              CASE WHEN progress >= target THEN coalesce(unlocked_at, created_at) ELSE unlocked_at END AS unlocked_at
       FROM metrics ORDER BY category, title`,
      [userId],
    )
    return result.rows.map((row) => ({ id: row.id, slug: row.slug, title: row.title, description: row.description, category: row.category, iconKey: row.icon_key, progress: Number(row.progress), target: Number(row.target), unlockedAt: row.unlocked_at ? new Date(row.unlocked_at).toISOString() : null }))
  }

  async debitVirtualQar(userId: string, amountMinor: number, reasonCode: string, referenceType: string, referenceId: string, idempotencyKey: string) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await debitLedger(client, userId, amountMinor, reasonCode, referenceType, referenceId, idempotencyKey)
      await client.query('COMMIT')
      return result.balanceAfterMinor
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async creditVirtualQar(userId: string, amountMinor: number, reasonCode: string, referenceType: string, referenceId: string, idempotencyKey: string) {
    await this.ensureUser(userId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await creditLedger(client, userId, amountMinor, reasonCode, referenceType, referenceId, idempotencyKey)
      await client.query('COMMIT')
      return result.balanceAfterMinor
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }

  async transferVirtualQar(fromUserId: string, toUserId: string, amountMinor: number, reasonCode: string, referenceType: string, referenceId: string, idempotencyKey: string) {
    if (fromUserId === toUserId) throw new LifeRuleError('TRANSFER_SELF', 'A Virtual QAR transfer needs two different residents.')
    await this.ensureUser(fromUserId)
    await this.ensureUser(toUserId)
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await lockWallets(client, [fromUserId, toUserId])
      const debit = await debitLedger(client, fromUserId, amountMinor, reasonCode, referenceType, referenceId, `transfer:debit:${idempotencyKey}`)
      await creditLedger(client, toUserId, amountMinor, reasonCode, referenceType, referenceId, `transfer:credit:${idempotencyKey}`)
      await client.query('COMMIT')
      return debit.balanceAfterMinor
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  }
}

function mapWorkRow(row: any): WorkSession {
  const startedAt = new Date(row.started_at)
  const completeAfter = new Date(startedAt.getTime() + Number(row.work_duration_seconds) * 1000)
  return { id: row.id, jobId: row.job_id, jobTitle: row.job_title, startedAt: startedAt.toISOString(), completeAfter: completeAfter.toISOString(), completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null, rewardMinor: Number(row.salary_minor), energySpent: Number(row.energy_spent), status: row.completed_at ? 'completed' : 'active' }
}

export async function lockWallets(client: PoolClient, userIds: string[]) {
  const ids = [...new Set(userIds)].sort()
  const result = await client.query<{ user_id: string }>(`SELECT user_id FROM wallets WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR UPDATE`, [ids])
  if (result.rows.length !== ids.length) throw new LifeRuleError('WALLET_NOT_FOUND', 'A wallet could not be found.', 404)
}

export async function creditLedger(client: PoolClient, userId: string, amountMinor: number, reasonCode: string, referenceType: string, referenceId: string, idempotencyKey: string, metadata: Record<string, unknown> = {}) {
  if (amountMinor <= 0) throw new LifeRuleError('INVALID_AMOUNT', 'The Virtual QAR amount must be positive.')
  // Lock the wallet before reading the idempotency row. A concurrent retry with
  // the same actor/key therefore waits, then observes the committed ledger row.
  const wallet = await client.query<{ balance_minor: string | number }>(`SELECT balance_minor FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId])
  if (!wallet.rows[0]) throw new LifeRuleError('WALLET_NOT_FOUND', 'Your wallet could not be found.', 404)
  const existing = await client.query<{ id: string; balance_after_minor: string | number; direction: 'credit' | 'debit'; amount_minor: string | number; reason_code: string; reference_type: string; reference_id: string }>(`SELECT id, balance_after_minor, direction, amount_minor, reason_code, reference_type, reference_id FROM wallet_transactions WHERE wallet_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
  if (existing.rows[0]) {
    const row = existing.rows[0]
    if (row.direction !== 'credit' || Number(row.amount_minor) !== amountMinor || row.reason_code !== reasonCode || row.reference_type !== referenceType || row.reference_id !== referenceId) throw new LifeRuleError('IDEMPOTENCY_CONFLICT', 'That idempotency key was already used for a different Virtual QAR operation.')
    return { id: row.id, balanceAfterMinor: Number(row.balance_after_minor) }
  }
  const balanceAfterMinor = Number(wallet.rows[0].balance_minor) + amountMinor
  await client.query(`UPDATE wallets SET balance_minor = $1, version = version + 1, updated_at = now() WHERE user_id = $2`, [balanceAfterMinor, userId])
  const row = await client.query<{ id: string }>(`INSERT INTO wallet_transactions (wallet_user_id, direction, amount_minor, balance_after_minor, reason_code, reference_type, reference_id, idempotency_key, metadata) VALUES ($1, 'credit', $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`, [userId, amountMinor, balanceAfterMinor, reasonCode, referenceType, referenceId, idempotencyKey, JSON.stringify(metadata)])
  return { id: row.rows[0].id, balanceAfterMinor }
}

export async function debitLedger(client: PoolClient, userId: string, amountMinor: number, reasonCode: string, referenceType: string, referenceId: string, idempotencyKey: string, metadata: Record<string, unknown> = {}) {
  if (amountMinor <= 0) throw new LifeRuleError('INVALID_AMOUNT', 'The Virtual QAR amount must be positive.')
  // See creditLedger: serialize by wallet before the idempotency read so
  // concurrent retries return the original result instead of racing a unique key.
  const wallet = await client.query<{ balance_minor: string | number }>(`SELECT balance_minor FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId])
  if (!wallet.rows[0]) throw new LifeRuleError('WALLET_NOT_FOUND', 'Your wallet could not be found.', 404)
  const existing = await client.query<{ id: string; balance_after_minor: string | number; direction: 'debit' | 'credit'; amount_minor: string | number; reason_code: string; reference_type: string; reference_id: string }>(`SELECT id, balance_after_minor, direction, amount_minor, reason_code, reference_type, reference_id FROM wallet_transactions WHERE wallet_user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey])
  if (existing.rows[0]) {
    const row = existing.rows[0]
    if (row.direction !== 'debit' || Number(row.amount_minor) !== amountMinor || row.reason_code !== reasonCode || row.reference_type !== referenceType || row.reference_id !== referenceId) throw new LifeRuleError('IDEMPOTENCY_CONFLICT', 'That idempotency key was already used for a different Virtual QAR operation.')
    return { id: row.id, balanceAfterMinor: Number(row.balance_after_minor) }
  }
  const balanceAfterMinor = Number(wallet.rows[0].balance_minor) - amountMinor
  if (balanceAfterMinor < 0) throw new LifeRuleError('INSUFFICIENT_VIRTUAL_QAR', 'Your Virtual QAR balance is not high enough.')
  await client.query(`UPDATE wallets SET balance_minor = $1, version = version + 1, updated_at = now() WHERE user_id = $2`, [balanceAfterMinor, userId])
  const row = await client.query<{ id: string }>(`INSERT INTO wallet_transactions (wallet_user_id, direction, amount_minor, balance_after_minor, reason_code, reference_type, reference_id, idempotency_key, metadata) VALUES ($1, 'debit', $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`, [userId, amountMinor, balanceAfterMinor, reasonCode, referenceType, referenceId, idempotencyKey, JSON.stringify(metadata)])
  return { id: row.rows[0].id, balanceAfterMinor }
}

export const lifeStore: LifeStore = config.databaseUrl ? new PostgresLifeStore(config.databaseUrl) : new MemoryLifeStore(accountStore)
