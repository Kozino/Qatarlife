import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'

process.env.NODE_ENV = 'test'

const { app, httpServer, worldRealtime } = await import('./index')

function emailFor(label: string) {
  return `${label.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
}

async function createPlayer(displayName: string) {
  const agent = request.agent(app)
  const signup = await agent.post('/api/auth/signup').send({ email: emailFor(displayName), password: 'Story1234' })
  expect(signup.status).toBe(201)
  const onboarding = await agent.put('/api/onboarding').send({ displayName, startingRegion: 'doha', presentation: 'modern-casual', skinTone: 'warm-sand', hairstyle: 'natural-short' })
  expect(onboarding.status).toBe(200)
  return agent
}

describe('Phase 3 life systems', () => {
  afterAll(async () => {
    worldRealtime.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('enforces job hiring, work sessions, server rewards and Virtual QAR ledger entries', async () => {
    const agent = await createPlayer('Job Player')
    const jobs = await agent.get('/api/jobs')
    expect(jobs.status).toBe(200)
    expect(jobs.body.jobs.length).toBeGreaterThanOrEqual(8)

    const job = jobs.body.jobs.find((candidate: { slug: string }) => candidate.slug === 'community-host')
    expect(job).toBeTruthy()
    const before = await agent.get('/api/life/overview')
    expect(before.body.overview.balanceMinor).toBe(500000)

    const rejected = await agent.post('/api/work/start').send({ jobId: job.slug, idempotencyKey: 'work-before-hire' })
    expect(rejected.status).toBe(400)
    expect(rejected.body.error.code).toBe('JOB_REQUIRED')

    const hired = await agent.post(`/api/jobs/${job.id}/hire`)
    expect(hired.status).toBe(200)
    const started = await agent.post('/api/work/start').send({ jobId: job.id, idempotencyKey: 'work-start-001' })
    expect(started.status).toBe(201)
    expect(started.body.session.status).toBe('active')

    const tooSoon = await agent.post(`/api/work/${started.body.session.id}/complete`).send({ idempotencyKey: 'work-complete-001' })
    expect(tooSoon.status).toBe(400)
    expect(tooSoon.body.error.code).toBe('WORK_NOT_READY')

    const ledger = await agent.get('/api/wallet/transactions')
    expect(ledger.status).toBe(200)
    expect(ledger.body.transactions.every((entry: { balanceAfterMinor: number }) => entry.balanceAfterMinor >= 0)).toBe(true)
  })

  it('purchases inventory idempotently and supports a real home arrangement', async () => {
    const agent = await createPlayer('Home Player')
    const products = await agent.get('/api/shops')
    expect(products.status).toBe(200)
    const product = products.body.products.find((candidate: { id: string }) => candidate.id.includes('woven-tote'))
    expect(product).toBeTruthy()

    const firstPurchase = await agent.post(`/api/shops/${encodeURIComponent(product.id)}/purchase`).send({ quantity: 2, idempotencyKey: 'purchase-001' })
    expect(firstPurchase.status).toBe(201)
    const secondPurchase = await agent.post(`/api/shops/${encodeURIComponent(product.id)}/purchase`).send({ quantity: 2, idempotencyKey: 'purchase-001' })
    expect(secondPurchase.status).toBe(201)
    expect(secondPurchase.body.purchase.balanceMinor).toBe(firstPurchase.body.purchase.balanceMinor)

    const inventory = await agent.get('/api/inventory')
    expect(inventory.body.inventory.find((item: { slug: string; quantity: number }) => item.slug === 'woven-tote')?.quantity).toBe(2)

    const homes = await agent.get('/api/homes')
    const home = homes.body.homes.find((candidate: { slug: string }) => candidate.slug === 'courtyard-room')
    const rented = await agent.post(`/api/homes/${home.id}/rent`).send({ idempotencyKey: 'home-rent-001' })
    expect(rented.status).toBe(201)
    expect(rented.body.home.activeOwnership).toBe('rented')
  })

  it('requires the right location for activities and rewards a completion', async () => {
    const agent = await createPlayer('Activity Player')
    const before = await agent.get('/api/activities')
    const activity = before.body.activities.find((candidate: { slug: string }) => candidate.slug === 'corniche-photo-walk')
    expect(activity.available).toBe(false)

    const wrongPlace = await agent.post('/api/activities/complete').send({ activityId: activity.id, idempotencyKey: 'activity-wrong-1' })
    expect(wrongPlace.status).toBe(400)
    expect(wrongPlace.body.error.code).toBe('WRONG_LOCATION')

    await agent.post('/api/world/enter').send({ locationId: 'corniche-waterfront' })
    const completed = await agent.post('/api/activities/complete').send({ activityId: activity.id, idempotencyKey: 'activity-right-1' })
    expect(completed.status).toBe(201)
    expect(completed.body.result.balanceMinor).toBeGreaterThan(500000)
    expect(completed.body.result.energy).toBeLessThan(100)
  })
})
