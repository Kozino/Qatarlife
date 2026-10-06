import { describe, expect, it } from 'vitest'
import request from 'supertest'

process.env.NODE_ENV = 'test'
process.env.RETURN_DEV_RESET_TOKEN = 'true'

const { app } = await import('./index')
const { store } = await import('./db')

function emailFor(label: string) {
  return `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
}

describe('Phase 1 authentication and authorization', () => {
  it('creates an account, protects profile routes, persists profile updates, and logs out', async () => {
    const email = emailFor('player')
    const agent = request.agent(app)
    const signup = await agent.post('/api/auth/signup').send({ email, password: 'Story1234' })
    expect(signup.status).toBe(201)
    expect(signup.body.user.wallet).toMatchObject({ balanceMinor: 500000, currency: 'Virtual QAR' })

    const me = await agent.get('/api/auth/me')
    expect(me.status).toBe(200)
    expect(me.body.user.email).toBe(email)

    const unauthenticated = await request(app).get('/api/profile')
    expect(unauthenticated.status).toBe(401)

    const updated = await agent.put('/api/profile').send({ displayName: 'Noor', bio: 'Finding my first chapter.' })
    expect(updated.status).toBe(200)
    expect(updated.body.user.profile).toMatchObject({ displayName: 'Noor', bio: 'Finding my first chapter.' })

    const logout = await agent.post('/api/auth/logout')
    expect(logout.status).toBe(200)
    expect((await agent.get('/api/auth/me')).status).toBe(401)
  })

  it('supports one-time password reset and revokes existing sessions', async () => {
    const email = emailFor('reset')
    const agent = request.agent(app)
    expect((await agent.post('/api/auth/signup').send({ email, password: 'Story1234' })).status).toBe(201)

    const resetRequest = await agent.post('/api/auth/password-reset/request').send({ email })
    expect(resetRequest.status).toBe(200)
    expect(resetRequest.body.devResetToken).toBeTypeOf('string')

    const reset = await agent.post('/api/auth/password-reset/confirm').send({ token: resetRequest.body.devResetToken, password: 'NewStory5678' })
    expect(reset.status).toBe(200)
    expect((await agent.get('/api/auth/me')).status).toBe(401)

    const oldPassword = await request(app).post('/api/auth/login').send({ email, password: 'Story1234' })
    expect(oldPassword.status).toBe(401)
    const newPassword = await request(app).post('/api/auth/login').send({ email, password: 'NewStory5678' })
    expect(newPassword.status).toBe(200)

    const replay = await request(app).post('/api/auth/password-reset/confirm').send({ token: resetRequest.body.devResetToken, password: 'Another9876' })
    expect(replay.status).toBe(400)
  })

  it('denies a normal player and allows an explicitly assigned admin role', async () => {
    const email = emailFor('rbac')
    const agent = request.agent(app)
    const signup = await agent.post('/api/auth/signup').send({ email, password: 'Story1234' })
    expect(signup.status).toBe(201)
    expect((await agent.get('/api/admin/me')).status).toBe(403)

    await store.setAdminRole(signup.body.user.id, 'moderator')
    const admin = await agent.get('/api/admin/me')
    expect(admin.status).toBe(200)
    expect(admin.body).toEqual({ admin: true, role: 'moderator' })
  })
})
