import { createHash, randomBytes } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
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

export function setSessionCookie(res: Response, rawToken: string) {
  res.cookie(sessionCookieName, rawToken, {
    httpOnly: true,
    sameSite: config.crossSiteCookies ? 'none' : 'lax',
    secure: config.secureCookies,
    maxAge: sessionMaxAgeMs,
    path: '/',
  })
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    sameSite: config.crossSiteCookies ? 'none' : 'lax',
    secure: config.secureCookies,
    path: '/',
  })
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
