import { randomUUID } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { config } from './config'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'
type LogMeta = Record<string, unknown>

const priority: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function write(level: LogLevel, message: string, meta: LogMeta = {}) {
  if (priority[level] < priority[config.logLevel]) return
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'qatar-life-api',
    message,
    ...redactMeta(meta),
  })
  if (level === 'error') console.error(line)
  else console.log(line)
}

function redactMeta(meta: LogMeta): LogMeta {
  const safe = { ...meta }
  for (const key of ['password', 'passwordHash', 'token', 'authorization', 'cookie', 'session']) {
    if (key in safe) safe[key] = '[REDACTED]'
  }
  return safe
}

export const logger = {
  debug: (message: string, meta?: LogMeta) => write('debug', message, meta),
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const requestId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : randomUUID()
  res.setHeader('x-request-id', requestId)
  const started = process.hrtime.bigint()
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000
    logger.info('http_request', {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userAgent: req.get('user-agent')?.slice(0, 120),
    })
  })
  next()
}
