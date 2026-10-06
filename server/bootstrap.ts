import { Pool } from 'pg'
import { config } from './config'
import { logger } from './logger'
import { ACTIVITY_CATALOG, ACHIEVEMENT_CATALOG, CATALOG_REGIONS, HOME_CATALOG, ITEM_CATALOG, JOB_CATALOG, SHOP_CATALOG } from './life-catalog'
import { WORLD_DISTRICTS, WORLD_LOCATIONS } from './world-catalog'

/**
 * Provisions only static, non-player catalog data. It is deliberately idempotent
 * and lives in TypeScript rather than a seed file so Render can safely run it at
 * every boot after migrations have completed.
 */
export async function bootstrapRuntimeCatalog(connectionString = config.databaseUrl) {
  if (!connectionString) return { skipped: true, reason: 'no-database' as const }
  const pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: 5_000,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
  })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const region of CATALOG_REGIONS) {
      await client.query(
        `INSERT INTO world_regions (slug, name, description, sort_order, is_active)
         VALUES ($1, $2, $3, $4, true)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order, is_active = true, updated_at = now()`,
        [region.slug, region.name, region.description, region.sortOrder],
      )
    }

    for (const district of WORLD_DISTRICTS) {
      await client.query(
        `INSERT INTO world_districts (region_id, slug, name, description, map_x, map_y, sort_order, is_active)
         VALUES ((SELECT id FROM world_regions WHERE slug = $1), $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT (slug) DO UPDATE SET region_id = EXCLUDED.region_id, name = EXCLUDED.name,
           description = EXCLUDED.description, map_x = EXCLUDED.map_x, map_y = EXCLUDED.map_y,
           sort_order = EXCLUDED.sort_order, is_active = true, updated_at = now()`,
        [district.regionSlug, district.slug, district.name, district.description, district.mapX, district.mapY, district.sortOrder],
      )
    }

    for (const location of WORLD_LOCATIONS) {
      await client.query(
        `INSERT INTO locations (
           region_id, district_id, slug, name, description, location_type, activity_tags,
           activities, coordinates, opening_status, interaction_points, map_x, map_y, is_active
         ) VALUES (
           (SELECT id FROM world_regions WHERE slug = $1),
           (SELECT id FROM world_districts WHERE slug = $2),
           $3, $4, $5, $6, $7::jsonb, $7::jsonb, $8::jsonb, $9, $10::jsonb, $11, $12, true
         )
         ON CONFLICT (slug) DO UPDATE SET
           region_id = EXCLUDED.region_id, district_id = EXCLUDED.district_id, name = EXCLUDED.name,
           description = EXCLUDED.description, location_type = EXCLUDED.location_type,
           activity_tags = EXCLUDED.activity_tags, activities = EXCLUDED.activities,
           coordinates = EXCLUDED.coordinates, opening_status = EXCLUDED.opening_status,
           interaction_points = EXCLUDED.interaction_points, map_x = EXCLUDED.map_x,
           map_y = EXCLUDED.map_y, is_active = true, updated_at = now()`,
        [
          location.regionSlug,
          location.districtId,
          location.slug,
          location.name,
          location.description,
          location.type,
          JSON.stringify(location.activities),
          JSON.stringify(location.coordinates),
          location.openingStatus,
          JSON.stringify(location.interactionPoints),
          location.coordinates.x,
          location.coordinates.y,
        ],
      )
    }

    for (const job of JOB_CATALOG) {
      const result = await client.query<{ id: string }>(
        `INSERT INTO jobs (slug, title, description, category, required_level, salary_minor, work_duration_seconds, cooldown_seconds, energy_cost, location_id, is_active)
         VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, (SELECT id FROM locations WHERE slug = $9), true)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
           category = EXCLUDED.category, salary_minor = EXCLUDED.salary_minor,
           work_duration_seconds = EXCLUDED.work_duration_seconds, cooldown_seconds = EXCLUDED.cooldown_seconds,
           energy_cost = EXCLUDED.energy_cost, location_id = EXCLUDED.location_id, is_active = true, updated_at = now()
         RETURNING id`,
        [job.slug, job.title, job.description, job.category, job.salaryMinor, job.workDurationSeconds, job.cooldownSeconds, job.energyCost, job.locationSlug],
      )
      const jobId = result.rows[0]?.id
      if (!jobId) continue
      for (const level of [1, 2, 3]) {
        await client.query(
          `INSERT INTO job_levels (job_id, level, title, salary_minor, required_experience)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (job_id, level) DO UPDATE SET title = EXCLUDED.title,
             salary_minor = EXCLUDED.salary_minor, required_experience = EXCLUDED.required_experience`,
          [jobId, level, `${job.title} · level ${level}`, Math.round(job.salaryMinor * (1 + (level - 1) * 0.18)), (level - 1) * 250],
        )
      }
    }

    for (const item of ITEM_CATALOG) {
      await client.query(
        `INSERT INTO items (slug, name, description, category, price_minor, rarity, metadata, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, true)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
           category = EXCLUDED.category, price_minor = EXCLUDED.price_minor, rarity = EXCLUDED.rarity,
           metadata = EXCLUDED.metadata, is_active = true, updated_at = now()`,
        [item.slug, item.name, item.description, item.category, item.priceMinor, item.rarity, JSON.stringify(item.metadata ?? {})],
      )
    }

    for (const shop of SHOP_CATALOG) {
      const shopResult = await client.query<{ id: string }>(
        `INSERT INTO shops (slug, name, description, location_id, shop_type, is_active)
         VALUES ($1, $2, $3, (SELECT id FROM locations WHERE slug = $4), $5, true)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
           location_id = EXCLUDED.location_id, shop_type = EXCLUDED.shop_type, is_active = true, updated_at = now()
         RETURNING id`,
        [shop.slug, shop.name, shop.description, shop.locationSlug, shop.shopType],
      )
      const shopId = shopResult.rows[0]?.id
      if (!shopId) continue
      for (const product of shop.products) {
        // Stock is a mutable gameplay projection; never reset it on a later boot.
        await client.query(
          `INSERT INTO products (shop_id, item_id, name, description, price_minor, stock_quantity, is_active)
           VALUES ($1, (SELECT id FROM items WHERE slug = $2), $3, $4, $5, $6, true)
           ON CONFLICT (shop_id, name) DO UPDATE SET item_id = EXCLUDED.item_id,
             description = EXCLUDED.description, price_minor = EXCLUDED.price_minor,
             is_active = true, updated_at = now()`,
          [shopId, product.itemSlug, product.name, product.description, product.priceMinor, product.stockQuantity],
        )
      }
    }

    for (const home of HOME_CATALOG) {
      await client.query(
        `INSERT INTO homes (slug, name, tier, location_id, purchase_price_minor, rent_price_minor, capacity, furniture_slots, metadata, is_active)
         VALUES ($1, $2, $3, (SELECT id FROM locations WHERE slug = $4), $5, $6, $7, $8, $9::jsonb, true)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, tier = EXCLUDED.tier,
           location_id = EXCLUDED.location_id, purchase_price_minor = EXCLUDED.purchase_price_minor,
           rent_price_minor = EXCLUDED.rent_price_minor, capacity = EXCLUDED.capacity,
           furniture_slots = EXCLUDED.furniture_slots, metadata = EXCLUDED.metadata, is_active = true, updated_at = now()`,
        [home.slug, home.name, home.tier, home.locationSlug, home.purchasePriceMinor, home.rentPriceMinor, home.capacity, home.furnitureSlots, JSON.stringify({ description: home.description })],
      )
    }

    for (const activity of ACTIVITY_CATALOG) {
      await client.query(
        `INSERT INTO activity_catalog (slug, title, description, category, location_id, energy_cost, experience_reward, reward_minor, cooldown_seconds, metadata, is_active)
         VALUES ($1, $2, $3, $4, (SELECT id FROM locations WHERE slug = $5), $6, $7, $8, $9, $10::jsonb, true)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
           category = EXCLUDED.category, location_id = EXCLUDED.location_id, energy_cost = EXCLUDED.energy_cost,
           experience_reward = EXCLUDED.experience_reward, reward_minor = EXCLUDED.reward_minor,
           cooldown_seconds = EXCLUDED.cooldown_seconds, metadata = EXCLUDED.metadata, is_active = true, updated_at = now()`,
        [activity.slug, activity.title, activity.description, activity.category, activity.locationSlug, activity.energyCost, activity.experienceReward, activity.rewardMinor, activity.cooldownSeconds, JSON.stringify(activity.metadata ?? {})],
      )
    }

    for (const achievement of ACHIEVEMENT_CATALOG) {
      await client.query(
        `INSERT INTO achievements (slug, title, description, category, icon_key, requirement, reward, is_active)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, true)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
           category = EXCLUDED.category, icon_key = EXCLUDED.icon_key, requirement = EXCLUDED.requirement,
           reward = EXCLUDED.reward, is_active = true`,
        [achievement.slug, achievement.title, achievement.description, achievement.category, achievement.iconKey, JSON.stringify(achievement.requirement), JSON.stringify(achievement.reward)],
      )
    }

    await client.query('COMMIT')
    const summary = { regions: CATALOG_REGIONS.length, districts: WORLD_DISTRICTS.length, locations: WORLD_LOCATIONS.length, jobs: JOB_CATALOG.length, items: ITEM_CATALOG.length, homes: HOME_CATALOG.length, activities: ACTIVITY_CATALOG.length }
    logger.info('runtime_catalog_bootstrapped', summary)
    return { skipped: false as const, ...summary }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}
