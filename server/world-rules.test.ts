import { describe, expect, it } from 'vitest'
import { validateMove, WorldValidationError } from './world-rules'

describe('server-authoritative world movement', () => {
  it('accepts a bounded sequential move', () => {
    expect(validateMove({ x: 50, y: 50, sequence: 0 }, { x: 53, y: 50, sequence: 1 })).toEqual({ x: 53, y: 50, sequence: 1 })
  })

  it('rejects out-of-bounds movement', () => {
    expect(() => validateMove({ x: 50, y: 50, sequence: 0 }, { x: 101, y: 50, sequence: 1 })).toThrowError(WorldValidationError)
  })

  it('rejects a teleport-sized movement', () => {
    expect(() => validateMove({ x: 50, y: 50, sequence: 0 }, { x: 80, y: 50, sequence: 1 })).toThrowError(/too fast/)
  })

  it('rejects replayed and out-of-order sequences', () => {
    expect(() => validateMove({ x: 50, y: 50, sequence: 3 }, { x: 51, y: 50, sequence: 3 })).toThrowError(/out of sequence/)
    expect(() => validateMove({ x: 50, y: 50, sequence: 3 }, { x: 51, y: 50, sequence: 2 })).toThrowError(/out of sequence/)
  })
})
