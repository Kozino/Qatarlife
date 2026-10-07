import { afterAll, describe, expect, it } from 'vitest'
import request from 'supertest'

process.env.NODE_ENV = 'test'

const { app, httpServer, worldRealtime } = await import('./index')
const { store } = await import('./db')

function emailFor(label: string) {
  return `${label.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
}

async function createPlayer(displayName: string) {
  const agent = request.agent(app)
  const signup = await agent.post('/api/auth/signup').send({ email: emailFor(displayName), password: 'Story1234' })
  expect(signup.status).toBe(201)
  const onboarding = await agent.put('/api/onboarding').send({ displayName, startingRegion: 'doha', presentation: 'modern-casual', skinTone: 'warm-sand', hairstyle: 'natural-short' })
  expect(onboarding.status).toBe(200)
  return { agent, userId: signup.body.user.id }
}

describe('Phase 4–7 social, commerce and operations systems', () => {
  afterAll(async () => {
    worldRealtime.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('supports events, friends, room chat and moderation-safe reporting', async () => {
    const host = await createPlayer('Event Host')
    const guest = await createPlayer('Event Guest')
    await store.setAdminRole(host.userId, 'admin')

    const catalogEvents = await guest.agent.get('/api/events')
    expect(catalogEvents.status).toBe(200)
    expect(catalogEvents.body.events.some((item: { title: string }) => item.title === 'Lantern Souq Evening')).toBe(true)

    const event = await host.agent.post('/api/admin/events').send({
      title: 'Fictional evening gathering', description: 'A small community event inside the simulation.', eventType: 'community', locationId: 'doha-gateway',
      startAt: new Date(Date.now() + 60_000).toISOString(), endAt: new Date(Date.now() + 3_600_000).toISOString(), capacity: 10, rewards: [{ type: 'xp', amount: 20 }],
    })
    expect(event.status).toBe(201)
    const registered = await guest.agent.post(`/api/events/${event.body.event.id}/register`).send({ idempotencyKey: 'event-register-1' })
    expect(registered.status).toBe(201)

    const requestFriend = await host.agent.post('/api/friends/request').send({ userId: guest.userId })
    expect(requestFriend.status).toBe(201)
    const pendingFriends = await guest.agent.get('/api/friends')
    expect(pendingFriends.status).toBe(200)
    expect(pendingFriends.body.friends.find((friend: { status: string }) => friend.status === 'pending_received')?.requestId).toBe(requestFriend.body.request.id)
    expect((await guest.agent.post(`/api/friends/requests/${requestFriend.body.request.id}/respond`).send({ action: 'accept' })).status).toBe(200)
    expect((await host.agent.get('/api/friends')).body.friends.some((friend: { displayName: string; status: string }) => friend.displayName === 'Event Guest' && friend.status === 'friend')).toBe(true)

    const chat = await host.agent.post('/api/chat/location').send({ body: 'Welcome to the fictional world.' })
    expect(chat.status).toBe(201)
    expect((await guest.agent.get('/api/chat/location')).body.messages.some((message: { body: string }) => message.body === 'Welcome to the fictional world.')).toBe(true)

    const report = await guest.agent.post('/api/reports').send({ reportedUserId: host.userId, targetType: 'chat_message', reasonCode: 'spam', details: 'A test moderation report.' })
    expect(report.status).toBe(201)
    const queue = await host.agent.get('/api/admin/reports')
    expect(queue.status).toBe(200)
    expect(queue.body.reports.some((item: { id: string }) => item.id === report.body.report.id)).toBe(true)
    expect((await host.agent.post(`/api/admin/reports/${report.body.report.id}/moderate`).send({ actionType: 'resolve', reason: 'Reviewed by test moderator.' })).status).toBe(200)
  })

  it('supports player businesses, orders, marketplace transfer and ad telemetry', async () => {
    const seller = await createPlayer('Business Seller')
    const buyer = await createPlayer('Business Buyer')
    await store.setAdminRole(seller.userId, 'advertiser_manager')

    const business = await seller.agent.post('/api/businesses').send({ name: 'Fictional Tea Corner', slug: `tea-corner-${Date.now()}`, category: 'hospitality', description: 'A fictional resident-run business.' })
    expect(business.status).toBe(201)
    const product = await seller.agent.post(`/api/businesses/${business.body.business.id}/products`).send({ name: 'Virtual karak tasting', description: 'A simulated social service.', kind: 'service', priceMinor: 500 })
    expect(product.status).toBe(201)
    const businessProduct = product.body.business.products[0]
    const order = await buyer.agent.post(`/api/business-products/${businessProduct.id}/order`).send({ quantity: 2, idempotencyKey: 'business-order-1' })
    expect(order.status).toBe(201)
    expect(order.body.order.totalMinor).toBe(1000)
    const repeatedOrder = await buyer.agent.post(`/api/business-products/${businessProduct.id}/order`).send({ quantity: 2, idempotencyKey: 'business-order-1' })
    expect(repeatedOrder.status).toBe(201)
    expect(repeatedOrder.body.order.orderId).toBe(order.body.order.orderId)

    const listing = await seller.agent.post('/api/marketplace/listings').send({ title: 'A fictional resident service', description: 'A player-created marketplace listing.', priceMinor: 300, quantity: 3 })
    expect(listing.status).toBe(201)
    const marketOrder = await buyer.agent.post(`/api/marketplace/listings/${listing.body.listing.id}/buy`).send({ quantity: 1, idempotencyKey: 'market-order-1' })
    expect(marketOrder.status).toBe(201)
    expect(marketOrder.body.order.totalMinor).toBe(300)
    const repeatedMarketOrder = await buyer.agent.post(`/api/marketplace/listings/${listing.body.listing.id}/buy`).send({ quantity: 1, idempotencyKey: 'market-order-1' })
    expect(repeatedMarketOrder.status).toBe(201)
    expect(repeatedMarketOrder.body.order.orderId).toBe(marketOrder.body.order.orderId)

    const ad = await seller.agent.post('/api/admin/ads').send({ adType: 'business_promotion', title: 'Fictional tea corner', businessId: business.body.business.id, destination: { type: 'business', id: business.body.business.id }, startAt: new Date(Date.now() - 60_000).toISOString(), endAt: new Date(Date.now() + 3_600_000).toISOString(), budgetMinor: 5000 })
    expect(ad.status).toBe(201)
    expect((await buyer.agent.get('/api/ads')).body.advertisements.some((item: { id: string }) => item.id === ad.body.advertisement.id)).toBe(true)
    expect((await buyer.agent.post(`/api/ads/${ad.body.advertisement.id}/impression`)).status).toBe(200)
    expect((await buyer.agent.post(`/api/ads/${ad.body.advertisement.id}/click`)).status).toBe(200)
  })
})
