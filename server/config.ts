import 'dotenv/config'
import { z } from 'zod'

const environmentSchema = z.enum(['development', 'test', 'staging', 'production'])

const rawConfig = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: process.env.PORT || '8787',
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  DATABASE_SSL: process.env.DATABASE_SSL || 'disable',
  DB_POOL_MAX: process.env.DB_POOL_MAX || '10',
  APP_ORIGIN: process.env.APP_ORIGIN || undefined,
  CORS_ORIGINS: process.env.CORS_ORIGINS || process.env.APP_ORIGIN || undefined,
  SESSION_SECRET: process.env.SESSION_SECRET || undefined,
  PASSWORD_RESET_TTL_MINUTES: process.env.PASSWORD_RESET_TTL_MINUTES || '30',
  RETURN_DEV_RESET_TOKEN: process.env.RETURN_DEV_RESET_TOKEN || ((process.env.NODE_ENV || 'development') === 'development' ? 'true' : 'false'),
  WORLD_BOOTSTRAP: process.env.WORLD_BOOTSTRAP || 'false',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ADMIN_BOOTSTRAP_TOKEN: process.env.ADMIN_BOOTSTRAP_TOKEN || undefined,
  SOKONI_HUB_BASE_URL: process.env.SOKONI_HUB_BASE_URL || undefined,
  SOKONI_HUB_API_KEY: process.env.SOKONI_HUB_API_KEY || undefined,
  OBJECT_STORAGE_ENDPOINT: process.env.OBJECT_STORAGE_ENDPOINT || undefined,
  OBJECT_STORAGE_BUCKET: process.env.OBJECT_STORAGE_BUCKET || undefined,
}

const parsed = z.object({
  NODE_ENV: environmentSchema,
  PORT: z.coerce.number().int().positive().max(65535),
  DATABASE_URL: z.string().min(1).optional(),
  DATABASE_SSL: z.enum(['disable', 'require']).default('disable'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100),
  APP_ORIGIN: z.string().url().optional(),
  CORS_ORIGINS: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440),
  RETURN_DEV_RESET_TOKEN: z.enum(['true', 'false']).transform((value) => value === 'true'),
  WORLD_BOOTSTRAP: z.enum(['true', 'false']).transform((value) => value === 'true'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  ADMIN_BOOTSTRAP_TOKEN: z.string().min(32).optional(),
  SOKONI_HUB_BASE_URL: z.string().url().optional(),
  SOKONI_HUB_API_KEY: z.string().min(1).optional(),
  OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
  OBJECT_STORAGE_BUCKET: z.string().min(1).optional(),
}).parse(rawConfig)

if (parsed.NODE_ENV === 'production') {
  if (!parsed.DATABASE_URL) throw new Error('DATABASE_URL is required in production.')
  if (!parsed.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production.')
  if (!parsed.APP_ORIGIN) throw new Error('APP_ORIGIN is required in production.')
  if (!parsed.CORS_ORIGINS) throw new Error('CORS_ORIGINS is required in production.')
}

export const config = {
  env: parsed.NODE_ENV,
  isProduction: parsed.NODE_ENV === 'production',
  secureCookies: parsed.NODE_ENV === 'staging' || parsed.NODE_ENV === 'production',
  crossSiteCookies: parsed.NODE_ENV === 'staging' || parsed.NODE_ENV === 'production',
  port: parsed.PORT,
  databaseUrl: parsed.DATABASE_URL,
  databaseSsl: parsed.DATABASE_SSL === 'require',
  dbPoolMax: parsed.DB_POOL_MAX,
  appOrigin: parsed.APP_ORIGIN,
  corsOrigins: (parsed.CORS_ORIGINS || parsed.APP_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean),
  sessionSecret: parsed.SESSION_SECRET || 'qatar-life-local-preview-session-secret-change-me',
  passwordResetTtlMinutes: parsed.PASSWORD_RESET_TTL_MINUTES,
  returnDevResetToken: parsed.RETURN_DEV_RESET_TOKEN && parsed.NODE_ENV !== 'production',
  worldBootstrap: parsed.WORLD_BOOTSTRAP,
  logLevel: parsed.LOG_LEVEL,
  adminBootstrapToken: parsed.ADMIN_BOOTSTRAP_TOKEN,
  sokoniHubBaseUrl: parsed.SOKONI_HUB_BASE_URL,
  sokoniHubApiKey: parsed.SOKONI_HUB_API_KEY,
  objectStorageEndpoint: parsed.OBJECT_STORAGE_ENDPOINT,
  objectStorageBucket: parsed.OBJECT_STORAGE_BUCKET,
} as const

export type AppRole = 'super_admin' | 'admin' | 'moderator' | 'support' | 'business_manager' | 'advertiser_manager'
export const appRoles: readonly AppRole[] = [
  'super_admin',
  'admin',
  'moderator',
  'support',
  'business_manager',
  'advertiser_manager',
]
