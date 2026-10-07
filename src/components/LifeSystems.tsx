import { useEffect, useState } from 'react'
import { BriefcaseBusiness, Building2, CalendarDays, Check, Home, MessageCircle, Package, RefreshCw, Send, ShoppingBag, Sparkles, WalletCards } from 'lucide-react'
import { api } from '../lib/api'
import type { ActivityOption, BusinessOption, ChatMessage, EventOption, FriendOption, HomeOption, InventoryEntry, JobOption, LifeOverview, MarketplaceListing, NotificationItem, ShopProduct, UserBundle, WorkSession } from '../types'

export type LifeSection = 'overview' | 'jobs' | 'shops' | 'homes' | 'activities' | 'events' | 'social' | 'businesses' | 'marketplace' | 'notifications'

type Props = { section: LifeSection; user: UserBundle; onUserUpdated: (user: UserBundle) => void; onNavigate: (section: LifeSection) => void }

const formatQar = (minor: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(minor / 100)
const key = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
const friendlyError = (error: unknown) => (error as Error)?.message || 'The world could not complete that action.'

export function LifeSystems({ section, user, onUserUpdated, onNavigate }: Props) {
  const [overview, setOverview] = useState<LifeOverview | null>(null)
  const [jobs, setJobs] = useState<JobOption[]>([])
  const [products, setProducts] = useState<ShopProduct[]>([])
  const [inventory, setInventory] = useState<InventoryEntry[]>([])
  const [homes, setHomes] = useState<HomeOption[]>([])
  const [activities, setActivities] = useState<ActivityOption[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [friends, setFriends] = useState<FriendOption[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [chatBody, setChatBody] = useState('')
  const [friendId, setFriendId] = useState('')
  const [businessForm, setBusinessForm] = useState({ name: '', slug: '', category: 'hospitality', description: '' })
  const [listingForm, setListingForm] = useState({ title: '', description: '', price: '500', quantity: '1' })

  useEffect(() => {
    setError('')
    setNotice('')
    void load(section)
  }, [section])

  async function load(target: LifeSection) {
    setBusy(true)
    try {
      if (target === 'overview') setOverview((await api.overview()).overview)
      if (target === 'jobs') { const [jobResult, overviewResult] = await Promise.all([api.jobs(), api.overview()]); setJobs(jobResult.jobs); setOverview(overviewResult.overview) }
      if (target === 'shops') { const result = await api.shops(); setProducts(result.products); setInventory((await api.inventory()).inventory) }
      if (target === 'homes') setHomes((await api.homes()).homes)
      if (target === 'activities') setActivities((await api.activities()).activities)
      if (target === 'events') setEvents((await api.events()).events)
      if (target === 'social') { setFriends((await api.friends()).friends); setMessages((await api.chatMessages()).messages) }
      if (target === 'businesses') setBusinesses((await api.businesses()).businesses)
      if (target === 'marketplace') setListings((await api.marketplace()).listings)
      if (target === 'notifications') setNotifications((await api.notifications()).notifications)
    } catch (caught) { setError(friendlyError(caught)) } finally { setBusy(false) }
  }

  async function refreshUser() {
    const result = await api.overview()
    setOverview(result.overview)
    onUserUpdated({ ...user, wallet: { ...user.wallet, balanceMinor: result.overview.balanceMinor }, character: { ...user.character, level: result.overview.level } })
  }

  async function act(action: () => Promise<void>, success: string) {
    setBusy(true); setError(''); setNotice('')
    try { await action(); await refreshUser(); setNotice(success); await load(section) } catch (caught) { setError(friendlyError(caught)) } finally { setBusy(false) }
  }

  const sectionHasData = section === 'overview' ? Boolean(overview) : section === 'jobs' ? jobs.length > 0 : section === 'shops' ? products.length > 0 : section === 'homes' ? homes.length > 0 : section === 'activities' ? activities.length > 0 : section === 'events' ? events.length > 0 : section === 'social' ? friends.length > 0 || messages.length > 0 : section === 'businesses' ? businesses.length > 0 : section === 'marketplace' ? listings.length > 0 : notifications.length > 0

  return <section className="systems-view">
    <div className="systems-heading"><div><span className="eyebrow">{sectionLabel(section)}</span><h1>{sectionTitle(section)}</h1><p>{sectionDescription(section)}</p></div><span className="fiction-pill"><span className="status-dot" /> Fictional systems · Virtual QAR only</span></div>
    {error && <div className="form-alert" role="alert">{error}</div>}
    {notice && <div className="form-success" role="status"><Check size={14} /> {notice}</div>}
    {busy && !sectionHasData ? <div className="systems-loading page-card"><RefreshCw size={17} className="spin" /> Loading this chapter…</div> : <>
      {section === 'overview' && <OverviewPanel overview={overview} onNavigate={onNavigate} />}
      {section === 'jobs' && <JobsPanel jobs={jobs} activeWork={overview?.activeWork ?? null} busy={busy} onAction={act} />}
      {section === 'shops' && <ShopsPanel products={products} inventory={inventory} onAction={act} />}
      {section === 'homes' && <HomesPanel homes={homes} onAction={act} />}
      {section === 'activities' && <ActivitiesPanel activities={activities} onAction={act} />}
      {section === 'events' && <EventsPanel events={events} onAction={act} />}
      {section === 'social' && <SocialPanel friends={friends} messages={messages} chatBody={chatBody} setChatBody={setChatBody} friendId={friendId} setFriendId={setFriendId} onAction={act} />}
      {section === 'businesses' && <BusinessesPanel businesses={businesses} form={businessForm} setForm={setBusinessForm} onAction={act} />}
      {section === 'marketplace' && <MarketplacePanel listings={listings} form={listingForm} setForm={setListingForm} onAction={act} />}
      {section === 'notifications' && <NotificationsPanel notifications={notifications} onAction={act} />}
    </>}
  </section>
}

function OverviewPanel({ overview, onNavigate }: { overview: LifeOverview | null; onNavigate: (section: LifeSection) => void }) {
  if (!overview) return <div className="systems-empty page-card">Your life overview is not available yet.</div>
  return <>
    <div className="systems-stat-grid"><Stat icon={<WalletCards size={17} />} label="Virtual QAR" value={formatQar(overview.balanceMinor)} detail="fictional balance" /><Stat icon={<Sparkles size={17} />} label="Energy" value={`${overview.energy}`} detail="server-tracked points" /><Stat icon={<BriefcaseBusiness size={17} />} label="Level" value={`${overview.level}`} detail={`${overview.experience} experience`} /><Stat icon={<Package size={17} />} label="Inventory" value={`${overview.inventory.length}`} detail="item types held" /></div>
    <div className="systems-card-grid"><article className="page-card system-card"><div className="system-card-head"><span className="eyebrow">Current chapter</span><BriefcaseBusiness size={17} /></div><h2>{overview.currentJob?.title || 'Choose your first job'}</h2><p>{overview.activeWork ? `Work session in progress. Completion unlocks at ${new Date(overview.activeWork.completeAfter).toLocaleTimeString()}.` : overview.currentJob ? 'Your next server-validated work session is ready.' : 'Start with a job that fits the way you want to play.'}</p><button className="primary-button" type="button" onClick={() => onNavigate('jobs')}>{overview.currentJob ? 'Open work board' : 'Browse jobs'}</button></article><article className="page-card system-card"><div className="system-card-head"><span className="eyebrow">Next small thing</span><Home size={17} /></div><h2>{overview.homes.find((home) => home.activeOwnership)?.name || 'Find a home base'}</h2><p>{overview.homes.some((home) => home.activeOwnership) ? 'Your current home arrangement is stored server-side.' : 'Rent or buy a fictional home with Virtual QAR.'}</p><button className="outline-button" type="button" onClick={() => onNavigate('homes')}>Explore homes</button></article></div>
    <div className="section-heading-row systems-subheading"><div><span className="eyebrow">Your passport</span><h2>Progress from real actions.</h2></div><button className="text-button" type="button" onClick={() => onNavigate('activities')}>Find an activity <span>→</span></button></div><div className="achievement-strip">{overview.achievements.map((achievement) => <div className="achievement-chip" key={achievement.id}><span>{achievement.unlockedAt ? '✓' : '○'}</span><strong>{achievement.title}</strong><small>{achievement.slug === 'virtual-qar-100k' ? `${(achievement.progress / 100).toLocaleString()} / ${(achievement.target / 100).toLocaleString()} QAR` : `${achievement.progress} / ${achievement.target}`}</small></div>)}</div>
  </>
}

function JobsPanel({ jobs, activeWork, busy, onAction }: { jobs: JobOption[]; activeWork: WorkSession | null; busy: boolean; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  const current = jobs.find((job) => job.current)
  const [session, setSession] = useState<WorkSession | null>(activeWork)
  useEffect(() => { setSession(activeWork) }, [activeWork])
  return <div className="systems-card-grid">{jobs.map((job) => <article className={`page-card system-card ${job.current ? 'is-selected' : ''}`} key={job.id}><div className="system-card-head"><span className="eyebrow">{job.category}</span>{job.current && <span className="inside-pill"><Check size={12} /> Current</span>}</div><h2>{job.title}</h2><p>{job.description}</p><div className="system-meta-row"><span>{formatQar(job.salaryMinor)} Virtual QAR</span><span>{Math.round(job.workDurationSeconds / 60)} min</span><span>{job.energyCost} energy</span></div><div className="system-actions"><button className={job.current ? 'outline-button' : 'primary-button'} type="button" disabled={busy} onClick={() => void onAction(async () => { await api.hireJob(job.id) }, `${job.title} is now your current job.`)}>{job.current ? 'Current job' : 'Choose this job'}</button>{job.current && <button className="text-button" type="button" disabled={busy} onClick={() => void onAction(async () => { const result = await api.startWork(job.id, `work-${job.id}-${Date.now()}`); setSession(result.session) }, 'Work session started on the server.')}>Start work</button>}</div>{session && session.jobId === job.id && <div className="system-inline-note">Session active · complete after {new Date(session.completeAfter).toLocaleTimeString()}<button className="text-button" type="button" onClick={() => void onAction(async () => { await api.completeWork(session.id, `complete-${session.id}`) }, 'Work reward is now in your Virtual QAR ledger.')}>Complete session</button></div>}</article>)}</div>
}

function ShopsPanel({ products, inventory, onAction }: { products: ShopProduct[]; inventory: InventoryEntry[]; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  return <><div className="section-heading-row systems-subheading"><div><span className="eyebrow">Your inventory</span><h2>{inventory.length ? `${inventory.length} item types` : 'A clear shelf'}</h2></div><span className="section-note">Server-owned items · no real-world value</span></div>{inventory.length > 0 && <div className="inventory-strip">{inventory.map((item) => <span key={item.itemId}><strong>{item.name}</strong> × {item.quantity}</span>)}</div>}<div className="systems-card-grid">{products.map((product) => <article className="page-card system-card" key={product.id}><div className="system-card-head"><span className="eyebrow">{product.shopName}</span><ShoppingBag size={16} /></div><h2>{product.name}</h2><p>{product.description}</p><div className="system-price">{formatQar(product.priceMinor)} <small>Virtual QAR</small></div><button className="primary-button" type="button" onClick={() => void onAction(async () => { await api.purchaseProduct(product.id, 1, key('purchase')) }, `${product.name} added to your inventory.`)}>Buy one</button></article>)}</div></>
}

function HomesPanel({ homes, onAction }: { homes: HomeOption[]; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  return <div className="systems-card-grid">{homes.map((home) => <article className="page-card system-card" key={home.id}><div className="system-card-head"><span className="eyebrow">{home.tier}</span>{home.activeOwnership && <span className="inside-pill"><Check size={12} /> {home.activeOwnership}</span>}</div><h2>{home.name}</h2><p>{home.description}</p><div className="system-meta-row"><span>{home.capacity} resident capacity</span><span>{home.furnitureSlots} furniture slots</span></div><div className="system-actions">{home.rentPriceMinor !== null && <button className="primary-button" type="button" disabled={Boolean(home.activeOwnership)} onClick={() => void onAction(async () => { await api.rentHome(home.id, key('rent')) }, `You now rent ${home.name}.`)}>{home.activeOwnership ? 'Current arrangement' : `Rent · ${formatQar(home.rentPriceMinor)}`}</button>}{home.purchasePriceMinor !== null && <button className="outline-button" type="button" disabled={Boolean(home.activeOwnership)} onClick={() => void onAction(async () => { await api.buyHome(home.id, key('buy')) }, `You now own ${home.name}.`)}>Buy · {formatQar(home.purchasePriceMinor)}</button>}</div></article>)}</div>
}

function ActivitiesPanel({ activities, onAction }: { activities: ActivityOption[]; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  return <div className="systems-card-grid">{activities.map((activity) => <article className="page-card system-card" key={activity.id}><div className="system-card-head"><span className="eyebrow">{activity.category}</span><Sparkles size={16} /></div><h2>{activity.title}</h2><p>{activity.description}</p><div className="system-meta-row"><span>+{formatQar(activity.rewardMinor)} Virtual QAR</span><span>+{activity.experienceReward} XP</span><span>{activity.energyCost} energy</span></div><button className="primary-button" type="button" disabled={!activity.available} onClick={() => void onAction(async () => { await api.completeActivity(activity.id, key('activity')) }, `${activity.title} completed.`)}>{activity.available ? 'Complete activity' : activity.nextAvailableAt ? `Available ${new Date(activity.nextAvailableAt).toLocaleTimeString()}` : `Go to ${activity.locationName || 'the location'} first`}</button></article>)}</div>
}

function EventsPanel({ events, onAction }: { events: EventOption[]; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  if (!events.length) return <div className="systems-empty page-card"><CalendarDays size={20} /><h2>No fictional events published yet.</h2><p>Events will appear here when the world team publishes a gathering.</p></div>
  return <div className="systems-card-grid">{events.map((event) => <article className="page-card system-card" key={event.id}><div className="system-card-head"><span className="eyebrow">{event.eventType}</span><CalendarDays size={16} /></div><h2>{event.title}</h2><p>{event.description}</p><div className="system-meta-row"><span>{event.locationName || 'World gathering'}</span><span>{new Date(event.startAt).toLocaleString()}</span><span>{event.registeredCount}{event.capacity ? ` / ${event.capacity}` : ''} registered</span></div><button className="primary-button" type="button" disabled={Boolean(event.attendeeStatus)} onClick={() => void onAction(async () => { await api.registerEvent(event.id, key('event')) }, 'Your event registration is recorded.')}>{event.attendeeStatus ? event.attendeeStatus : 'Register'}</button></article>)}</div>
}

function SocialPanel({ friends, messages, chatBody, setChatBody, friendId, setFriendId, onAction }: { friends: FriendOption[]; messages: ChatMessage[]; chatBody: string; setChatBody: (value: string) => void; friendId: string; setFriendId: (value: string) => void; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  return <div className="systems-two-column"><article className="page-card system-card"><div className="system-card-head"><span className="eyebrow"><UsersRoundIcon /> Friends</span><span>{friends.length}</span></div><div className="inline-form"><input className="text-input" placeholder="Resident ID" value={friendId} onChange={(event) => setFriendId(event.target.value)} /><button className="primary-button" type="button" disabled={!friendId} onClick={() => void onAction(async () => { await api.sendFriendRequest(friendId); setFriendId('') }, 'Friend request sent.')}>Invite</button></div><div className="system-list">{friends.length ? friends.map((friend) => <div className="system-list-row" key={friend.id}><span><strong>{friend.displayName}</strong><small>{friend.status.replace('_', ' ')}</small></span>{friend.status === 'pending_received' && friend.requestId && <button className="text-button" type="button" onClick={() => void onAction(async () => { await api.respondFriendRequest(friend.requestId!, 'accept') }, 'Friend request accepted.')}>Accept</button>}</div>) : <p className="empty-copy">No connections yet. Share a resident ID to begin.</p>}</div></article><article className="page-card system-card"><div className="system-card-head"><span className="eyebrow"><MessageCircle size={14} /> Location chat</span><span className="section-note">Room-scoped</span></div><div className="chat-log">{messages.length ? messages.map((message) => <div className={`chat-line ${message.moderationStatus === 'flagged' ? 'is-flagged' : ''}`} key={message.id}><strong>{message.senderName}</strong><span>{message.body}</span></div>) : <p className="empty-copy">No messages in this room yet.</p>}</div><form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (chatBody.trim()) void onAction(async () => { await api.sendChatMessage(chatBody); setChatBody('') }, 'Message sent to the current room.') }}><input className="text-input" value={chatBody} onChange={(event) => setChatBody(event.target.value)} placeholder="Say something kind" maxLength={500} /><button className="primary-button" type="submit"><Send size={14} /></button></form></article></div>
}

function BusinessesPanel({ businesses, form, setForm, onAction }: { businesses: BusinessOption[]; form: { name: string; slug: string; category: string; description: string }; setForm: (value: { name: string; slug: string; category: string; description: string }) => void; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  const [productDrafts, setProductDrafts] = useState<Record<string, { name: string; description: string; kind: 'product' | 'service'; price: string }>>({})
  const draftFor = (businessId: string) => productDrafts[businessId] || { name: '', description: '', kind: 'service' as const, price: '500' }
  const updateDraft = (businessId: string, draft: { name: string; description: string; kind: 'product' | 'service'; price: string }) => setProductDrafts({ ...productDrafts, [businessId]: draft })

  return <><article className="page-card system-card system-form-card"><div className="system-card-head"><span className="eyebrow"><Building2 size={14} /> Start a business</span><span className="section-note">Virtual world only</span></div><div className="form-grid"><input className="text-input" placeholder="Business name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /><input className="text-input" placeholder="short-slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /><input className="text-input" placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /><input className="text-input" placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></div><button className="primary-button" type="button" disabled={!form.name || !form.slug} onClick={() => void onAction(async () => { await api.createBusiness(form); setForm({ name: '', slug: '', category: 'hospitality', description: '' }) }, 'Your fictional business is open.')}>Create business</button></article><div className="systems-card-grid">{businesses.map((business) => { const draft = draftFor(business.id); return <article className="page-card system-card" key={business.id}><div className="system-card-head"><span className="eyebrow">{business.category}</span><span>★ {business.reputation.toFixed(1)}</span></div><h2>{business.name}</h2><p>{business.description}</p>{business.products.map((product) => <div className="system-list-row" key={product.id}><span><strong>{product.name}</strong><small>{product.kind} · {formatQar(product.priceMinor)} Virtual QAR</small></span><button className="text-button" type="button" onClick={() => void onAction(async () => { await api.orderBusinessProduct(product.id, 1, key('business-order')) }, 'Order placed in the fictional business system.')}>Order</button></div>)}<div className="product-compose"><span className="eyebrow">Add a fictional offer</span><input className="text-input" placeholder="Offer name" value={draft.name} onChange={(event) => updateDraft(business.id, { ...draft, name: event.target.value })} /><input className="text-input" placeholder="Short description" value={draft.description} onChange={(event) => updateDraft(business.id, { ...draft, description: event.target.value })} /><div className="form-grid"><select className="text-input" value={draft.kind} onChange={(event) => updateDraft(business.id, { ...draft, kind: event.target.value as 'product' | 'service' })}><option value="service">Service</option><option value="product">Product</option></select><input className="text-input" type="number" min="1" placeholder="Price in minor units" value={draft.price} onChange={(event) => updateDraft(business.id, { ...draft, price: event.target.value })} /></div><button className="outline-button" type="button" disabled={!draft.name} onClick={() => void onAction(async () => { await api.createBusinessProduct(business.id, { name: draft.name, description: draft.description, kind: draft.kind, priceMinor: Number(draft.price) }); setProductDrafts({ ...productDrafts, [business.id]: { name: '', description: '', kind: 'service', price: '500' } }) }, 'Offer added to your business.')}>Add offer</button></div></article> })}</div></>
}

function MarketplacePanel({ listings, form, setForm, onAction }: { listings: MarketplaceListing[]; form: { title: string; description: string; price: string; quantity: string }; setForm: (value: { title: string; description: string; price: string; quantity: string }) => void; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  return <><article className="page-card system-card system-form-card"><div className="system-card-head"><span className="eyebrow"><ShoppingBag size={14} /> List something</span><span className="section-note">Virtual QAR marketplace</span></div><div className="form-grid"><input className="text-input" placeholder="Listing title" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /><input className="text-input" placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /><input className="text-input" type="number" min="1" placeholder="Price in minor units" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /><input className="text-input" type="number" min="1" placeholder="Quantity" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></div><button className="primary-button" type="button" disabled={!form.title} onClick={() => void onAction(async () => { await api.createListing({ title: form.title, description: form.description, priceMinor: Number(form.price), quantity: Number(form.quantity) }); setForm({ title: '', description: '', price: '500', quantity: '1' }) }, 'Listing published.')}>Publish listing</button></article><div className="systems-card-grid">{listings.map((listing) => <article className="page-card system-card" key={listing.id}><div className="system-card-head"><span className="eyebrow">{listing.sellerName}</span><span>{listing.quantity} available</span></div><h2>{listing.title}</h2><p>{listing.description}</p><div className="system-price">{formatQar(listing.priceMinor)} <small>Virtual QAR</small></div><button className="primary-button" type="button" onClick={() => void onAction(async () => { await api.buyListing(listing.id, 1, key('market')) }, 'Marketplace purchase completed.')}>Buy one</button></article>)}</div></>
}

function NotificationsPanel({ notifications, onAction }: { notifications: NotificationItem[]; onAction: (action: () => Promise<void>, success: string) => Promise<void> }) {
  return <div className="systems-card-grid">{notifications.length ? notifications.map((notification) => <article className="page-card system-card" key={notification.id}><div className="system-card-head"><span className="eyebrow">{notification.kind}</span>{!notification.readAt && <span className="inside-pill">New</span>}</div><h2>{notification.title}</h2><p>{notification.body}</p>{!notification.readAt && <button className="text-button" type="button" onClick={() => void onAction(async () => { await api.markNotificationRead(notification.id) }, 'Notification marked read.')}>Mark read</button>}</article>) : <div className="systems-empty page-card"><BellIcon /><h2>Nothing new.</h2><p>Your world notifications will appear here.</p></div>}</div>
}

function Stat({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) { return <article className="page-card system-stat"><span className="system-stat-icon">{icon}</span><span className="eyebrow">{label}</span><strong>{value}</strong><small>{detail}</small></article> }
function sectionLabel(section: LifeSection) { return { overview: 'Your life', jobs: 'Work & growth', shops: 'Shops & inventory', homes: 'Home base', activities: 'Moments', events: 'Gatherings', social: 'People & chat', businesses: 'Resident businesses', marketplace: 'Player marketplace', notifications: 'World notices' }[section] }
function sectionTitle(section: LifeSection) { return { overview: 'A life made of small choices.', jobs: 'Find work that fits your chapter.', shops: 'Collect useful little things.', homes: 'Choose a place to return to.', activities: 'Make a moment of it.', events: 'Show up for the world.', social: 'People make the place.', businesses: 'Build something of your own.', marketplace: 'Trade inside the fiction.', notifications: 'Keep up with your world.' }[section] }
function sectionDescription(section: LifeSection) { return { overview: 'Every figure below comes from server-side state. Virtual QAR is fictional and has no real-world value.', jobs: 'Jobs, energy, cooldowns, experience and rewards are validated by the server.', shops: 'Prices, stock, purchases and inventory are controlled by the Virtual QAR ledger.', homes: 'Rentals and ownership are fictional records backed by the same server-authoritative economy.', activities: 'Move to the right location, spend energy and earn a server-recorded reward.', events: 'Register for fictional gatherings with capacity and attendance rules.', social: 'Chat and connection requests are room-scoped and designed for reporting and moderation.', businesses: 'Resident-run businesses use fictional products, services and Virtual QAR orders.', marketplace: 'A player-to-player marketplace kept separate from real-world commerce.', notifications: 'Updates, registrations and community moments stay in one place.' }[section] }
function UsersRoundIcon() { return <span>◎</span> }
function BellIcon() { return <span>◌</span> }
