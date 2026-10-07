import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'

import { config, type AppRole } from './config'
import { getLocationById, getSpawnLocationForRegion, WORLD_LOCATIONS } from './world-catalog'
import { mapWorldLocation, type WorldLocationRow } from './world-db-helpers'
import { validateMove, WorldValidationError } from './world-rules'
import type { MoveInput, NearbyPlayer, PlayerWorldState, WorldLocation } from './world-types'
import type { AvatarUpdateInput, OnboardingInput, ProfileUpdateInput } from './validation'

export const STARTER_BALANCE_MINOR = 500_000

export interface AvatarBundle {
  presentation: 'modern-casual' | 'thobe-inspired' | 'abaya-inspired' | 'activewear'
  skinTone: 'warm-sand' | 'desert-rose' | 'deep-umber' | 'pearl'
  hairstyle: 'natural-short' | 'soft-waves' | 'textured-crop' | 'covered'
  hairColor: 'dark-brown' | 'black' | 'chestnut' | 'silver'
  faceShape: 'soft-square' | 'oval' | 'round' | 'long'
}

export interface UserCredentials {
  id: string
  email: string
  passwordHash: string
  status: 'active' | 'suspended' | 'pending_deletion' | 'deleted'
}

export interface UserBundle {
  id: string
  email: string
  createdAt: string
  profile: {
    displayName: string | null
    bio: string
    startingRegion: 'doha' | 'the-pearl' | 'lusail' | 'outside-doha' | null
    onboardingComplete: boolean
  }
  avatar: AvatarBundle
  character: {
    presentation: AvatarBundle['presentation']
    level: number
  }
  wallet: {
    balanceMinor: number
    currency: 'Virtual QAR'
  }
}

export class EmailTakenError extends Error {
  constructor() {
    super('EMAIL_TAKEN')
    this.name = 'EmailTakenError'
  }
}

export interface AccountStore {
  readonly mode: 'preview-memory' | 'postgres'
  createAccount(input: { email: string; passwordHash: string }): Promise<UserBundle>
  findCredentialsByEmail(email: string): Promise<UserCredentials | null>
  getBundleByUserId(userId: string): Promise<UserBundle | null>
  completeOnboarding(userId: string, input: OnboardingInput): Promise<UserBundle | null>
  updateProfile(userId: string, input: ProfileUpdateInput): Promise<UserBundle | null>
  updateAvatar(userId: string, input: AvatarUpdateInput): Promise<UserBundle | null>
  createSession(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>
  getUserIdBySessionHash(tokenHash: string): Promise<string | null>
  revokeSession(tokenHash: string): Promise<void>
  revokeAllSessions(userId: string): Promise<void>
  createPasswordReset(input: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void>
  consumePasswordReset(input: { tokenHash: string; passwordHash: string }): Promise<boolean>
  getAdminRole(userId: string): Promise<AppRole | null>
  setAdminRole(userId: string, role: AppRole): Promise<void>
  hasAnyAdmin(): Promise<boolean>
  claimFirstAdmin(userId: string, role: AppRole): Promise<boolean>
  listWorldLocations(): Promise<WorldLocation[]>
  getWorldState(userId: string): Promise<PlayerWorldState | null>
  enterLocation(userId: string, locationId: string): Promise<PlayerWorldState | null>
  exitLocation(userId: string): Promise<PlayerWorldState | null>
  movePlayer(userId: string, input: MoveInput): Promise<PlayerWorldState | null>
  listNearbyPlayers(userId: string): Promise<NearbyPlayer[]>
}

type MemorySession = { userId: string; expiresAt: number; revoked: boolean }
type MemoryResetToken = { userId: string; expiresAt: number; used: boolean }
type MemoryWorldPosition = { locationId: string | null; x: number; y: number; isInside: boolean; lastSequence: number; lastActivityAt: number }
type MemoryAccount = {
  credentials: UserCredentials
  bundle: UserBundle
  world: MemoryWorldPosition
  ledger: Array<{ id: string; direction: 'credit' | 'debit'; amountMinor: number; reasonCode: string }>
}

export class MemoryStore implements AccountStore {
  readonly mode = 'preview-memory' as const
  private readonly accounts = new Map<string, MemoryAccount>()
  private readonly userIdByEmail = new Map<string, string>()
  private readonly sessions = new Map<string, MemorySession>()
  private readonly resetTokens = new Map<string, MemoryResetToken>()
  private readonly admins = new Map<string, AppRole>()
  private readonly auditLogs: Array<{ actorUserId: string; action: string; entityType: string; entityId: string; createdAt: string }> = []

  async createAccount(input: { email: string; passwordHash: string }) {
    if (this.userIdByEmail.has(input.email)) throw new EmailTakenError()
    const id = randomUUID()
    const now = new Date().toISOString()
    const avatar: AvatarBundle = {
      presentation: 'modern-casual',
      skinTone: 'warm-sand',
      hairstyle: 'natural-short',
      hairColor: 'dark-brown',
      faceShape: 'soft-square',
    }
    const account: MemoryAccount = {
      credentials: { id, email: input.email, passwordHash: input.passwordHash, status: 'active' },
      bundle: {
        id,
        email: input.email,
        createdAt: now,
        profile: { displayName: null, bio: '', startingRegion: null, onboardingComplete: false },
        avatar,
        character: { presentation: avatar.presentation, level: 1 },
        wallet: { balanceMinor: STARTER_BALANCE_MINOR, currency: 'Virtual QAR' },
      },
      world: { locationId: null, x: 50, y: 50, isInside: false, lastSequence: 0, lastActivityAt: Date.now() },
      ledger: [{ id: randomUUID(), direction: 'credit', amountMinor: STARTER_BALANCE_MINOR, reasonCode: 'starter_balance' }],
    }
    this.accounts.set(id, account)
    this.userIdByEmail.set(input.email, id)
    return cloneBundle(account.bundle)
  }

  async findCredentialsByEmail(email: string) {
    const id = this.userIdByEmail.get(email)
    return id ? structuredClone(this.accounts.get(id)!.credentials) : null
  }

  async getBundleByUserId(userId: string) {
    const account = this.accounts.get(userId)
    return account ? cloneBundle(account.bundle) : null
  }

  async completeOnboarding(userId: string, input: OnboardingInput) {
    const account = this.accounts.get(userId)
    if (!account) return null
    account.bundle.profile = {
      ...account.bundle.profile,
      displayName: input.displayName,
      startingRegion: input.startingRegion,
      onboardingComplete: true,
    }
    account.bundle.avatar = { ...account.bundle.avatar, presentation: input.presentation, skinTone: input.skinTone, hairstyle: input.hairstyle }
    account.bundle.character.presentation = input.presentation
    const spawn = getSpawnLocationForRegion(input.startingRegion)
    account.world.locationId = spawn.id
    account.world.x = spawn.coordinates.x
    account.world.y = spawn.coordinates.y
    account.world.isInside = false
    account.world.lastSequence = 0
    account.world.lastActivityAt = Date.now()
    return cloneBundle(account.bundle)
  }

  async updateProfile(userId: string, input: ProfileUpdateInput) {
    const account = this.accounts.get(userId)
    if (!account) return null
    account.bundle.profile.displayName = input.displayName
    account.bundle.profile.bio = input.bio
    return cloneBundle(account.bundle)
  }

  async updateAvatar(userId: string, input: AvatarUpdateInput) {
    const account = this.accounts.get(userId)
    if (!account) return null
    account.bundle.avatar = { ...input }
    account.bundle.character.presentation = input.presentation
    return cloneBundle(account.bundle)
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    this.sessions.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt.getTime(), revoked: false })
  }

  async getUserIdBySessionHash(tokenHash: string) {
    const session = this.sessions.get(tokenHash)
    if (!session || session.revoked || session.expiresAt <= Date.now()) return null
    const account = this.accounts.get(session.userId)
    return account?.credentials.status === 'active' ? session.userId : null
  }

  async revokeSession(tokenHash: string) {
    const session = this.sessions.get(tokenHash)
    if (session) session.revoked = true
  }

  async revokeAllSessions(userId: string) {
    for (const session of this.sessions.values()) if (session.userId === userId) session.revoked = true
  }

  async createPasswordReset(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    this.resetTokens.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt.getTime(), used: false })
  }

  async consumePasswordReset(input: { tokenHash: string; passwordHash: string }) {
    const reset = this.resetTokens.get(input.tokenHash)
    if (!reset || reset.used || reset.expiresAt <= Date.now()) return false
    const account = this.accounts.get(reset.userId)
    if (!account || account.credentials.status !== 'active') return false
    account.credentials.passwordHash = input.passwordHash
    reset.used = true
    await this.revokeAllSessions(reset.userId)
    return true
  }

  async getAdminRole(userId: string) {
    return this.admins.get(userId) ?? null
  }

  async setAdminRole(userId: string, role: AppRole) {
    this.admins.set(userId, role)
  }

  async hasAnyAdmin() {
    return this.admins.size > 0
  }

  async claimFirstAdmin(userId: string, role: AppRole) {
    if (this.admins.size > 0) return false
    this.admins.set(userId, role)
    this.auditLogs.push({ actorUserId: userId, action: 'admin.bootstrap', entityType: 'admin_user', entityId: userId, createdAt: new Date().toISOString() })
    return true
  }

  async listWorldLocations() {
    return structuredClone(WORLD_LOCATIONS)
  }

  async getWorldState(userId: string) {
    const account = this.accounts.get(userId)
    if (!account) return null
    if (!account.world.locationId) {
      const spawn = getSpawnLocationForRegion(account.bundle.profile.startingRegion)
      account.world.locationId = spawn.id
      account.world.x = spawn.coordinates.x
      account.world.y = spawn.coordinates.y
    }
    const location = getLocationById(account.world.locationId)
    if (!location) return null
    return {
      location: structuredClone(location),
      x: account.world.x,
      y: account.world.y,
      isInside: account.world.isInside,
      sequence: account.world.lastSequence,
      nearbyPlayers: await this.listNearbyPlayers(userId),
    }
  }

  async enterLocation(userId: string, locationId: string) {
    const account = this.accounts.get(userId)
    const location = getLocationById(locationId)
    if (!account || !location) return null
    if (location.openingStatus === 'closed') throw new WorldValidationError('LOCATION_CLOSED', 'That location is currently closed.')
    account.world.locationId = location.id
    account.world.x = location.coordinates.x
    account.world.y = location.coordinates.y
    account.world.isInside = true
    account.world.lastSequence += 1
    account.world.lastActivityAt = Date.now()
    return this.getWorldState(userId)
  }

  async exitLocation(userId: string) {
    const account = this.accounts.get(userId)
    if (!account) return null
    account.world.isInside = false
    account.world.lastSequence += 1
    account.world.lastActivityAt = Date.now()
    return this.getWorldState(userId)
  }

  async movePlayer(userId: string, input: MoveInput) {
    const account = this.accounts.get(userId)
    if (!account) return null
    if (!account.world.locationId) await this.getWorldState(userId)
    validateMove({ x: account.world.x, y: account.world.y, sequence: account.world.lastSequence }, input)
    account.world.x = input.x
    account.world.y = input.y
    account.world.lastSequence = input.sequence
    account.world.lastActivityAt = Date.now()
    return this.getWorldState(userId)
  }

  async listNearbyPlayers(userId: string) {
    const current = this.accounts.get(userId)
    if (!current?.world.locationId) return []
    const players: NearbyPlayer[] = []
    for (const account of this.accounts.values()) {
      if (account.credentials.id === userId || account.credentials.status !== 'active' || !account.bundle.profile.onboardingComplete) continue
      if (account.world.locationId !== current.world.locationId) continue
      if (Date.now() - account.world.lastActivityAt > 5 * 60 * 1000) continue
      players.push({ id: account.credentials.id, displayName: account.bundle.profile.displayName || 'Resident', x: account.world.x, y: account.world.y, status: 'online' })
    }
    return players
  }
}

export class PostgresStore implements AccountStore {
  readonly mode = 'postgres' as const
  private readonly pool: Pool

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: config.dbPoolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    })
  }

  async createAccount(input: { email: string; passwordHash: string }) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const userResult = await client.query<{ id: string; email: string; created_at: Date }>(
        `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at`,
        [input.email, input.passwordHash],
      )
      const user = userResult.rows[0]
      await client.query(`INSERT INTO profiles (user_id) VALUES ($1)`, [user.id])
      const avatarResult = await client.query<{ id: string }>(`INSERT INTO avatars (user_id) VALUES ($1) RETURNING id`, [user.id])
      await client.query(`INSERT INTO characters (user_id, avatar_id) VALUES ($1, $2)`, [user.id, avatarResult.rows[0].id])
      await client.query(`INSERT INTO wallets (user_id, balance_minor, version) VALUES ($1, $2, 1)`, [user.id, STARTER_BALANCE_MINOR])
      await client.query(
        `INSERT INTO wallet_transactions (wallet_user_id, direction, amount_minor, balance_after_minor, reason_code, idempotency_key)
         VALUES ($1, 'credit', $2, $2, 'starter_balance', $3)`,
        [user.id, STARTER_BALANCE_MINOR, `starter:${user.id}`],
      )
      await client.query('COMMIT')
      return (await this.getBundleByUserId(user.id))!
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (isUniqueViolation(error)) throw new EmailTakenError()
      throw error
    } finally {
      client.release()
    }
  }

  async findCredentialsByEmail(email: string) {
    const result = await this.pool.query<UserCredentials>(
      `SELECT id, email, password_hash AS "passwordHash", status FROM users WHERE lower(email) = lower($1) AND status = 'active' LIMIT 1`,
      [email],
    )
    return result.rows[0] ?? null
  }

  async getBundleByUserId(userId: string) {
    const result = await this.pool.query<{
      id: string
      email: string
      created_at: Date
      display_name: string | null
      bio: string
      starting_region: UserBundle['profile']['startingRegion']
      onboarding_complete: boolean
      presentation: AvatarBundle['presentation'] | null
      skin_tone: AvatarBundle['skinTone'] | null
      hairstyle: AvatarBundle['hairstyle'] | null
      hair_color: AvatarBundle['hairColor'] | null
      face_shape: AvatarBundle['faceShape'] | null
      level: number | null
      balance_minor: string | number | null
      currency: 'Virtual QAR' | null
    }>(
      `SELECT u.id, u.email, u.created_at, p.display_name, p.bio, r.slug AS starting_region, p.onboarding_complete,
              a.clothing_style AS presentation, a.skin_tone, a.hairstyle, a.hair_color, a.face_shape,
              c.level, w.balance_minor, w.currency
       FROM users u
       JOIN profiles p ON p.user_id = u.id
       LEFT JOIN world_regions r ON r.id = p.starting_region_id
       LEFT JOIN avatars a ON a.user_id = u.id
       LEFT JOIN characters c ON c.user_id = u.id
       LEFT JOIN wallets w ON w.user_id = u.id
       WHERE u.id = $1 AND u.status = 'active'`,
      [userId],
    )
    const row = result.rows[0]
    if (!row) return null
    const avatar: AvatarBundle = {
      presentation: row.presentation ?? 'modern-casual',
      skinTone: row.skin_tone ?? 'warm-sand',
      hairstyle: row.hairstyle ?? 'natural-short',
      hairColor: row.hair_color ?? 'dark-brown',
      faceShape: row.face_shape ?? 'soft-square',
    }
    return {
      id: row.id,
      email: row.email,
      createdAt: new Date(row.created_at).toISOString(),
      profile: { displayName: row.display_name, bio: row.bio ?? '', startingRegion: row.starting_region, onboardingComplete: row.onboarding_complete },
      avatar,
      character: { presentation: avatar.presentation, level: row.level ?? 1 },
      wallet: { balanceMinor: Number(row.balance_minor ?? 0), currency: row.currency ?? 'Virtual QAR' },
    } satisfies UserBundle
  }

  async completeOnboarding(userId: string, input: OnboardingInput) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const region = await client.query<{ id: string }>(`SELECT id FROM world_regions WHERE slug = $1`, [input.startingRegion])
      if (!region.rows[0]) {
        await client.query('ROLLBACK')
        return null
      }
      const update = await client.query<{ user_id: string }>(
        `UPDATE profiles SET display_name = $1, starting_region_id = $2, onboarding_complete = true, updated_at = now()
         WHERE user_id = $3 RETURNING user_id`,
        [input.displayName, region.rows[0].id, userId],
      )
      if (!update.rows[0]) {
        await client.query('ROLLBACK')
        return null
      }
      await client.query(
        `UPDATE avatars SET clothing_style = $1, skin_tone = $2, hairstyle = $3, updated_at = now() WHERE user_id = $4`,
        [input.presentation, input.skinTone, input.hairstyle, userId],
      )
      await client.query(`UPDATE characters SET display_name = $1, updated_at = now() WHERE user_id = $2`, [input.displayName, userId])
      await client.query('COMMIT')
      return this.getBundleByUserId(userId)
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async updateProfile(userId: string, input: ProfileUpdateInput) {
    const result = await this.pool.query(`UPDATE profiles SET display_name = $1, bio = $2, updated_at = now() WHERE user_id = $3`, [input.displayName, input.bio, userId])
    return result.rowCount ? this.getBundleByUserId(userId) : null
  }

  async updateAvatar(userId: string, input: AvatarUpdateInput) {
    const result = await this.pool.query(
      `UPDATE avatars SET clothing_style = $1, skin_tone = $2, hairstyle = $3, hair_color = $4, face_shape = $5, updated_at = now() WHERE user_id = $6`,
      [input.presentation, input.skinTone, input.hairstyle, input.hairColor, input.faceShape, userId],
    )
    return result.rowCount ? this.getBundleByUserId(userId) : null
  }

  async createSession(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    await this.pool.query(`INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [input.userId, input.tokenHash, input.expiresAt])
  }

  async getUserIdBySessionHash(tokenHash: string) {
    const result = await this.pool.query<{ user_id: string }>(
      `SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'active' LIMIT 1`,
      [tokenHash],
    )
    return result.rows[0]?.user_id ?? null
  }

  async revokeSession(tokenHash: string) {
    await this.pool.query(`UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [tokenHash])
  }

  async revokeAllSessions(userId: string) {
    await this.pool.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId])
  }

  async createPasswordReset(input: { userId: string; tokenHash: string; expiresAt: Date }) {
    await this.pool.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`, [input.userId, input.tokenHash, input.expiresAt])
  }

  async consumePasswordReset(input: { tokenHash: string; passwordHash: string }) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const token = await client.query<{ user_id: string }>(
        `SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE`,
        [input.tokenHash],
      )
      const userId = token.rows[0]?.user_id
      if (!userId) {
        await client.query('ROLLBACK')
        return false
      }
      await client.query(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2 AND status = 'active'`, [input.passwordHash, userId])
      await client.query(`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1`, [input.tokenHash])
      await client.query(`UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId])
      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async getAdminRole(userId: string) {
    const result = await this.pool.query<{ role: AppRole }>(`SELECT role FROM admin_users WHERE user_id = $1`, [userId])
    return result.rows[0]?.role ?? null
  }

  async setAdminRole(userId: string, role: AppRole) {
    await this.pool.query(
      `INSERT INTO admin_users (user_id, role) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`,
      [userId, role],
    )
  }

  async hasAnyAdmin() {
    const result = await this.pool.query(`SELECT 1 FROM admin_users LIMIT 1`)
    return Boolean(result.rowCount)
  }

  async claimFirstAdmin(userId: string, role: AppRole) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(`LOCK TABLE admin_users IN EXCLUSIVE MODE`)
      const existing = await client.query(`SELECT 1 FROM admin_users LIMIT 1`)
      if (existing.rowCount) {
        await client.query('COMMIT')
        return false
      }
      await client.query(`INSERT INTO admin_users (user_id, role) VALUES ($1, $2)`, [userId, role])
      await client.query(`INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES ($1, 'admin.bootstrap', 'admin_user', $1, $2::jsonb)`, [userId, JSON.stringify({ role })])
      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async listWorldLocations() {
    const result = await this.pool.query<WorldLocationRow>(
      `SELECT l.id, l.slug, l.name, l.description, l.location_type, l.coordinates, l.opening_status,
              l.activities, l.interaction_points, d.id AS district_id, d.name AS district, r.slug AS region_slug
       FROM locations l
       JOIN world_districts d ON d.id = l.district_id
       JOIN world_regions r ON r.id = d.region_id
       WHERE l.is_active = true AND d.is_active = true
       ORDER BY d.sort_order, l.name`,
    )
    return result.rows.map(mapWorldLocation)
  }

  async getWorldState(userId: string) {
    let position = await this.pool.query<{ location_id: string; x: string | number; y: string | number; last_sequence: string | number; is_inside: boolean }>(
      `SELECT location_id, x, y, last_sequence, is_inside FROM player_locations WHERE user_id = $1`,
      [userId],
    )
    if (!position.rows[0]) {
      const region = await this.pool.query<{ slug: 'doha' | 'the-pearl' | 'lusail' | 'outside-doha' | null }>(
        `SELECT r.slug FROM profiles p LEFT JOIN world_regions r ON r.id = p.starting_region_id WHERE p.user_id = $1`,
        [userId],
      )
      const spawn = getSpawnLocationForRegion(region.rows[0]?.slug ?? null)
      const spawnLocation = await this.getWorldLocationById(spawn.id)
      if (!spawnLocation) return null
      await this.pool.query(
        `INSERT INTO player_locations (user_id, location_id, x, y, last_sequence, is_inside)
         VALUES ($1, $2, $3, $4, 0, false) ON CONFLICT (user_id) DO NOTHING`,
        [userId, spawnLocation.id, spawnLocation.coordinates.x, spawnLocation.coordinates.y],
      )
      position = await this.pool.query(`SELECT location_id, x, y, last_sequence, is_inside FROM player_locations WHERE user_id = $1`, [userId])
    }
    const row = position.rows[0]
    if (!row) return null
    const location = await this.getWorldLocationById(row.location_id)
    if (!location) return null
    await this.pool.query(`UPDATE player_locations SET updated_at = now() WHERE user_id = $1`, [userId])
    return {
      location,
      x: Number(row.x),
      y: Number(row.y),
      isInside: row.is_inside,
      sequence: Number(row.last_sequence),
      nearbyPlayers: await this.listNearbyPlayers(userId),
    } satisfies PlayerWorldState
  }

  async enterLocation(userId: string, locationId: string) {
    const location = await this.getWorldLocationById(locationId)
    if (!location) return null
    if (location.openingStatus === 'closed') throw new WorldValidationError('LOCATION_CLOSED', 'That location is currently closed.')
    await this.pool.query(
      `INSERT INTO player_locations (user_id, location_id, x, y, last_sequence, is_inside)
       VALUES ($1, $2, $3, $4, 1, true)
       ON CONFLICT (user_id) DO UPDATE SET location_id = EXCLUDED.location_id, x = EXCLUDED.x, y = EXCLUDED.y,
         last_sequence = player_locations.last_sequence + 1, is_inside = true, updated_at = now()`,
      [userId, location.id, location.coordinates.x, location.coordinates.y],
    )
    return this.getWorldState(userId)
  }

  async exitLocation(userId: string) {
    await this.pool.query(`UPDATE player_locations SET is_inside = false, last_sequence = last_sequence + 1, updated_at = now() WHERE user_id = $1`, [userId])
    return this.getWorldState(userId)
  }

  async movePlayer(userId: string, input: MoveInput) {
    let current = await this.pool.query<{ x: string | number; y: string | number; last_sequence: string | number }>(
      `SELECT x, y, last_sequence FROM player_locations WHERE user_id = $1`,
      [userId],
    )
    if (!current.rows[0]) {
      await this.getWorldState(userId)
      current = await this.pool.query(`SELECT x, y, last_sequence FROM player_locations WHERE user_id = $1`, [userId])
    }
    const row = current.rows[0]
    if (!row) return null
    validateMove({ x: Number(row.x), y: Number(row.y), sequence: Number(row.last_sequence) }, input)
    const updated = await this.pool.query(
      `UPDATE player_locations SET x = $1, y = $2, last_sequence = $3, last_validated_at = now(), updated_at = now()
       WHERE user_id = $4 AND last_sequence = $5`,
      [input.x, input.y, input.sequence, userId, Number(row.last_sequence)],
    )
    if (!updated.rowCount) throw new WorldValidationError('MOVE_REPLAY', 'That movement update is out of sequence.')
    return this.getWorldState(userId)
  }

  async listNearbyPlayers(userId: string) {
    const current = await this.pool.query<{ location_id: string }>(`SELECT location_id FROM player_locations WHERE user_id = $1`, [userId])
    const locationId = current.rows[0]?.location_id
    if (!locationId) return []
    const result = await this.pool.query<{ id: string; display_name: string | null; x: string | number; y: string | number }>(
      `SELECT u.id, p.display_name, pl.x, pl.y
       FROM player_locations pl
       JOIN users u ON u.id = pl.user_id
       JOIN profiles p ON p.user_id = u.id
       WHERE pl.location_id = $1 AND pl.user_id <> $2 AND u.status = 'active'
         AND p.onboarding_complete = true AND pl.updated_at > now() - interval '5 minutes'
       ORDER BY pl.updated_at DESC LIMIT 50`,
      [locationId, userId],
    )
    return result.rows.map((player) => ({ id: player.id, displayName: player.display_name || 'Resident', x: Number(player.x), y: Number(player.y), status: 'online' as const }))
  }

  private async getWorldLocationById(locationId: string) {
    const result = await this.pool.query<WorldLocationRow>(
      `SELECT l.id, l.slug, l.name, l.description, l.location_type, l.coordinates, l.opening_status,
              l.activities, l.interaction_points, d.id AS district_id, d.name AS district, r.slug AS region_slug
       FROM locations l
       JOIN world_districts d ON d.id = l.district_id
       JOIN world_regions r ON r.id = d.region_id
       WHERE l.is_active = true AND d.is_active = true AND (l.id::text = $1 OR l.slug = $1)
       LIMIT 1`,
      [locationId],
    )
    return result.rows[0] ? mapWorldLocation(result.rows[0]) : null
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505'
}

function cloneBundle(bundle: UserBundle): UserBundle {
  return structuredClone(bundle)
}

export const store: AccountStore = config.databaseUrl ? new PostgresStore(config.databaseUrl) : new MemoryStore()
