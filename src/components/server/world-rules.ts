import type { MoveInput } from './world-types'

export const WORLD_POSITION_MIN = 5
export const WORLD_POSITION_MAX = 95
export const MAX_MOVE_DISTANCE = 12

export class WorldValidationError extends Error {
  constructor(public readonly code: 'INVALID_POSITION' | 'MOVE_TOO_FAR' | 'MOVE_REPLAY' | 'LOCATION_MISMATCH' | 'LOCATION_CLOSED', message: string) {
    super(message)
    this.name = 'WorldValidationError'
  }
}

export function validateMove(previous: { x: number; y: number; sequence: number }, next: MoveInput) {
  if (!Number.isFinite(next.x) || !Number.isFinite(next.y) || next.x < WORLD_POSITION_MIN || next.x > WORLD_POSITION_MAX || next.y < WORLD_POSITION_MIN || next.y > WORLD_POSITION_MAX) {
    throw new WorldValidationError('INVALID_POSITION', 'That movement is outside the playable area.')
  }
  if (!Number.isInteger(next.sequence) || next.sequence <= previous.sequence) {
    throw new WorldValidationError('MOVE_REPLAY', 'That movement update is out of sequence.')
  }
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y)
  if (distance > MAX_MOVE_DISTANCE) {
    throw new WorldValidationError('MOVE_TOO_FAR', 'That movement is too fast for one server update.')
  }
  return next
}
