import { createHash, randomBytes } from 'node:crypto'
import type { CookieOptions, NextFunction, Request, Response } from 'express'
import { config, type AppRole } from './config'
import type { AccountStore } from './db'

export const sessionCookieName = 'ql_session'
export const sessionMaxAgeMs = 7 * 24 * 60 * 60 * 1000

export type AuthContext = {
  userId: string
  role?: AppRole
}

export type AuthenticatedRequest = Request & { auth?: AuthContext }

export function createOpaqueToken() {
  return randomBytes(32).toString('base64url')
}

export function hashOpaqueToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Decide cookie attributes per request.
 *
 * A browser silently DROPS a cookie that is:
 *   - SameSite=Lax/Strict but set by a different site than the page (Netlify -> Render), or
 *   - SameSite=None without Secure.
 * That makes login "work" (response body has the user) while every later request is 401.
 *
 * So we treat the request as cross-site when the config says so, when running in production,
 * or when the browser's Origin host differs from the API host. Cross-site => SameSite=None + Secure.
 * Requires `app.set('trust proxy', 1)` so req.secure is correct behind Render's proxy.
 */
function cookieOptions(res: Response): CookieOptions {
  const req = res.req
  const origin = typeof req?.headers?.origin === 'string' ? req.headers.origin : ''
  let originDiffers = false
  if (origin) {
    try {
      originDiffers = new URL(origin).host !== req.headers.host
    } catch {
      originDiffers = false
    }
  }
  const crossSite = Boolean(config.crossSiteCookies) || Boolean(config.isProduction) || originDiffers
  const secure = crossSite || Boolean(config.secureCookies) || Boolean(req?.secure)
  return {
    httpOnly: true,
    sameSite: crossSite ? 'none' : 'lax',
    secure,
    path: '/',
  }
}

export function setSessionCookie(res: Response, rawToken: string) {
  res.cookie(sessionCookieName, rawToken, { ...cookieOptions(res), maxAge: sessionMaxAgeMs })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(sessionCookieName, cookieOptions(res))
}

export function getRawSessionToken(req: Request) {
  const token = req.cookies?.[sessionCookieName]
  return typeof token === 'string' && token.length >= 20 ? token : null
}

export function requireAuth(store: AccountStore) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rawToken = getRawSessionToken(req)
      if (!rawToken) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } })
      const userId = await store.getUserIdBySessionHash(hashOpaqueToken(rawToken))
      if (!userId) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } })
      req.auth = { userId }
      return next()
    } catch (error) {
      return next(error)
    }
  }
}

export function requireRole(store: AccountStore, allowedRoles: readonly AppRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.auth) return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } })
      const role = await store.getAdminRole(req.auth.userId)
      if (!role || !allowedRoles.includes(role)) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource.' } })
      }
      req.auth.role = role
      return next()
    } catch (error) {
      return next(error)
    }
  }
}
