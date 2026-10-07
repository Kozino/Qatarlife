import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  Award,
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  Compass,
  Globe2,
  Home,
  LogOut,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  UsersRound,
  WalletCards,
  X,
  type LucideIcon,
} from 'lucide-react'
import { api } from './lib/api'
import type { RegionSlug, UserBundle } from './types'
import { AuthDialog } from './components/AuthDialog'
import { Brand } from './components/Brand'
import { Onboarding } from './components/Onboarding'
import { PassportPanel } from './components/PassportPanel'
import { LifeSystems, type LifeSection } from './components/LifeSystems'
import { PlayableWorld } from './components/PlayableWorld'
import { regionOptions, WorldMap } from './components/WorldMap'

const features = [
  { icon: Compass, eyebrow: 'Explore', title: 'A city with a pulse', body: 'Move from lantern-lit market lanes to coastlines, boulevards and open desert routes.' },
  { icon: BriefcaseBusiness, eyebrow: 'Build', title: 'Make your own way', body: 'Find work, earn Virtual QAR and shape a life that feels like yours.' },
  { icon: UsersRound, eyebrow: 'Connect', title: 'People make the place', body: 'Meet neighbours, make friends and create the stories you will come back to.' },
]

const lifeSteps = [
  { number: '01', title: 'Create your character', body: 'Choose a first look, a name and the energy you want to bring into the world.' },
  { number: '02', title: 'Choose your first district', body: 'Start in the city heart, by the marina, on a new boulevard or under open skies.' },
  { number: '03', title: 'Write what happens next', body: 'Explore, work, connect and collect the moments that become your Qatar Life Passport.' },
]

const previewLocations = [
  { region: 'doha' as RegionSlug, label: 'Souq-inspired market', meta: 'Culture · social · food', tone: 'rose' },
  { region: 'doha' as RegionSlug, label: 'Corniche waterfront', meta: 'Walking · photography', tone: 'blue' },
  { region: 'the-pearl' as RegionSlug, label: 'Porto marina', meta: 'Waterfront · dining', tone: 'gold' },
  { region: 'lusail' as RegionSlug, label: 'Boulevard lights', meta: 'Events · night life', tone: 'green' },
]

function formatQar(balanceMinor: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(balanceMinor / 100)
}

function initials(name: string | null, email: string) {
  if (name) return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return email.slice(0, 2).toUpperCase()
}

function styleLabel(style: UserBundle['character']['presentation']) {
  return {
    'modern-casual': 'Modern casual',
    'thobe-inspired': 'Thobe-inspired',
    'abaya-inspired': 'Abaya-inspired',
    activewear: 'Activewear',
  }[style]
}

export default function App() {
  const [user, setUser] = useState<UserBundle | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [booting, setBooting] = useState(true)
  const [bootError, setBootError] = useState('')

  useEffect(() => {
    api.me()
      .then((result) => setUser(result.user))
      .catch((error) => {
        if ((error as { status?: number }).status !== 401) setBootError('The world is taking a moment to wake up.')
      })
      .finally(() => setBooting(false))
  }, [])

  if (booting) return <LoadingScreen />
  if (user && !user.profile.onboardingComplete) return <Onboarding user={user} onComplete={setUser} />
  if (user) return <LifeHub user={user} onLogout={() => setUser(null)} onUserUpdated={setUser} />

  return <LandingPage onStart={() => setAuthOpen(true)} bootError={bootError} />
}

function LoadingScreen() {
  return <div className="app-loading"><div className="loading-mark">QL</div><span>Opening Qatar Life…</span></div>
}

function LandingPage({ onStart, bootError }: { onStart: () => void; bootError: string }) {
  const [selectedRegion, setSelectedRegion] = useState<RegionSlug>('doha')
  const selected = regionOptions.find((region) => region.id === selectedRegion)!

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="public-site">
      <div className="announcement-bar"><span className="status-dot" /> Original fictional world · inspired by the feeling of Qatar, not affiliated with any public service <button onClick={() => scrollTo('principles')} type="button">Learn more <ArrowRight size={13} /></button></div>
      <header className="public-header shell-width">
        <Brand />
        <nav className="desktop-nav" aria-label="Main navigation">
          <button onClick={() => scrollTo('world-preview')} type="button">Explore Qatar</button>
          <button onClick={() => scrollTo('how-it-works')} type="button">How it works</button>
          <button onClick={() => scrollTo('principles')} type="button">Our promise</button>
        </nav>
        <div className="header-actions"><button className="quiet-button desktop-only" type="button" onClick={onStart}>Sign in</button><button className="small-primary-button" type="button" onClick={onStart}>Start your life <ArrowRight size={15} /></button><button className="mobile-menu-button" aria-label="Open navigation" type="button" onClick={() => scrollTo('world-preview')}><Menu size={19} /></button></div>
      </header>

      <main>
        <section className="hero shell-width">
          <div className="hero-copy">
            <div className="eyebrow eyebrow-with-rule"><span /> A social world, made for your story</div>
            <h1>Live your<br /><em>Qatar story.</em></h1>
            <p className="hero-lede">Explore. Work. Connect. Build your life in a fictional Qatar-inspired world that keeps getting more alive with every chapter.</p>
            <div className="hero-actions"><button className="primary-button hero-primary" type="button" onClick={onStart}>Start your life <ArrowRight size={18} /></button><button className="outline-button" type="button" onClick={() => scrollTo('world-preview')}><Map size={17} /> Explore Qatar</button></div>
            <div className="hero-proof"><div className="proof-avatars"><span className="proof-avatar proof-avatar-one">SA</span><span className="proof-avatar proof-avatar-two">MR</span><span className="proof-avatar proof-avatar-three">LN</span><span className="proof-avatar proof-avatar-four">+</span></div><span>Build a life at your own pace.<br /><strong>Every story starts somewhere.</strong></span></div>
          </div>
          <div className="hero-art" aria-label="Original stylized preview of the Qatar Life world">
            <div className="hero-art-glow" />
            <div className="hero-art-label hero-art-label-top"><span className="live-pill"><span className="status-dot" /> World online</span><span>CHAPTER 01</span></div>
            <div className="hero-character-card"><div className="hero-character-image"><div className="hero-sun" /><div className="hero-avatar-shape"><span /></div><div className="hero-horizon horizon-one" /><div className="hero-horizon horizon-two" /></div><div className="hero-character-meta"><span><small>YOUR STORY</small><strong>Starts here</strong></span><span className="hero-arrow-circle"><ArrowDownRight size={17} /></span></div></div>
            <div className="hero-stat-card"><span className="stat-icon"><Sparkles size={15} /></span><span><small>THE WORLD IS YOURS TO SHAPE</small><strong>One life. Many directions.</strong></span></div>
            <div className="hero-location-card"><MapPin size={15} /><span><small>FIRST STOP</small><strong>Doha · the city heart</strong></span></div>
            <div className="hero-coordinates">25°17′ N<br />51°32′ E</div>
          </div>
        </section>

        <section className="feature-strip shell-width" id="how-it-works">
          {features.map((feature) => { const Icon = feature.icon; return <article key={feature.title} className="feature-item"><span className="feature-icon"><Icon size={19} /></span><div><span className="eyebrow">{feature.eyebrow}</span><h3>{feature.title}</h3><p>{feature.body}</p></div></article> })}
        </section>

        <section className="world-section shell-width" id="world-preview">
          <div className="section-heading split-heading"><div><span className="eyebrow">A world in chapters</span><h2>Start close to home.<br /><em>Go wherever the story takes you.</em></h2></div><p>Four regions. Dozens of places to discover. A world that feels familiar enough to find your way around, and open enough to make it your own.</p></div>
          <div className="world-preview-grid"><WorldMap selectedRegion={selectedRegion} onSelect={setSelectedRegion} /><div className="region-detail-card"><div className="region-detail-head"><span className="eyebrow">Selected region</span><span className="region-index">0{regionOptions.findIndex((region) => region.id === selectedRegion) + 1} / 04</span></div><div className="region-detail-title"><h3>{selected.name}</h3><span className="region-status"><span className="status-dot" /> Open to explore</span></div><p>{selected.description}</p><div className="region-detail-rule" /><div className="region-places"><span className="eyebrow">Places you could find</span><div className="place-pills">{previewLocations.filter((location) => location.region === selectedRegion).map((location) => <span key={location.label}><i className={`place-dot ${location.tone}`} /> {location.label}</span>)}{previewLocations.filter((location) => location.region === selectedRegion).length === 0 && <span><i className="place-dot green" /> Open roads & new discoveries</span>}</div></div><button className="text-button map-cta" type="button" onClick={onStart}>Choose your first district <ArrowRight size={15} /></button></div></div>
        </section>

        <section className="life-section" id="principles"><div className="shell-width life-layout"><div className="life-intro"><span className="eyebrow">Your first 30 seconds</span><h2>It starts small.<br /><em>Then it becomes yours.</em></h2><p>Qatar Life is designed around the tiny choices that make a virtual world feel personal: where you wake up, who you meet, and what you decide to do next.</p><button className="outline-button on-dark" type="button" onClick={onStart}>Begin your chapter <ArrowRight size={16} /></button></div><div className="life-steps">{lifeSteps.map((step) => <article className="life-step" key={step.number}><span className="step-number">{step.number}</span><div><h3>{step.title}</h3><p>{step.body}</p></div><ChevronRight size={17} /></article>)}</div></div></section>

        <section className="promise-section shell-width"><div className="promise-card"><div className="promise-ornament"><ShieldCheck size={20} /></div><div><span className="eyebrow">A clear promise</span><h2>Fictional by design.<br /><em>Respectful by default.</em></h2><p>Qatar Life is a fictional social simulation inspired by the region’s energy and variety. Virtual QAR, homes, jobs and businesses exist only inside the game and have no real-world monetary value. We use original maps, characters and assets.</p></div><div className="promise-tags"><span><Check size={14} /> No official affiliation</span><span><Check size={14} /> Original world & assets</span><span><Check size={14} /> Privacy-aware social play</span></div></div></section>

        <section className="final-cta shell-width"><div className="final-cta-stars"><Star size={15} /><Star size={10} /><Star size={13} /></div><span className="eyebrow eyebrow-light">Your story is not a template</span><h2>There is no right way<br />to live your Qatar story.</h2><button className="primary-button" type="button" onClick={onStart}>Start your life <ArrowRight size={17} /></button><span className="cta-note">Free to begin · Fictional world · Virtual QAR included</span></section>
      </main>

      <footer className="public-footer shell-width"><Brand compact /><span>© 2026 Qatar Life. An original fictional social world.</span><span className="footer-right">Built for curious people <Sparkles size={13} /></span></footer>
      {bootError && <div className="toast-note"><span className="status-dot" /> {bootError}</div>}
    </div>
  )
}

function LifeHub({ user, onLogout, onUserUpdated }: { user: UserBundle; onLogout: () => void; onUserUpdated: (user: UserBundle) => void }) {
  type ActiveView = LifeSection | 'world' | 'passport' | 'profile'
  const [activeView, setActiveView] = useState<ActiveView>('overview')
  const [selectedRegion, setSelectedRegion] = useState<RegionSlug>(user.profile.startingRegion || 'doha')
  const [loggingOut, setLoggingOut] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const region = regionOptions.find((item) => item.id === selectedRegion)!
  const displayName = user.profile.displayName || 'Storyteller'

  const navItems: Array<{ id: ActiveView; label: string; icon: LucideIcon }> = [
    { id: 'overview', label: 'Life', icon: Sparkles },
    { id: 'world', label: 'World', icon: Globe2 },
    { id: 'jobs', label: 'Jobs', icon: BriefcaseBusiness },
    { id: 'shops', label: 'Shops', icon: ShoppingBag },
    { id: 'homes', label: 'Homes', icon: Home },
    { id: 'activities', label: 'Activities', icon: Sparkles },
    { id: 'events', label: 'Events', icon: CalendarDays },
    { id: 'social', label: 'Social', icon: MessageCircle },
    { id: 'businesses', label: 'Businesses', icon: Building2 },
    { id: 'marketplace', label: 'Marketplace', icon: WalletCards },
    { id: 'passport', label: 'Passport', icon: Award },
    { id: 'notifications', label: 'Notices', icon: Bell },
    { id: 'profile', label: 'Profile', icon: CircleUserRound },
  ]

  const navigate = (view: ActiveView) => { setActiveView(view); setMobileNav(false) }
  const logout = async () => {
    setLoggingOut(true)
    await api.logout().catch(() => undefined)
    onLogout()
  }
  const isSystemView = !['world', 'passport', 'profile'].includes(activeView)

  useEffect(() => {
    let active = true
    api.overview().then(({ overview }) => {
      if (!active) return
      onUserUpdated({ ...user, wallet: { ...user.wallet, balanceMinor: overview.balanceMinor }, character: { ...user.character, level: overview.level } })
    }).catch(() => undefined)
    return () => { active = false }
  }, [])

  return <div className="life-app">
    <aside className={`life-sidebar ${mobileNav ? 'is-open' : ''}`}>
      <div className="life-sidebar-top"><Brand compact onClick={() => navigate('overview')} /><button className="sidebar-close mobile-only" type="button" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button></div>
      <div className="sidebar-world-pill"><span className="status-dot" /> <span><small>WORLD STATUS</small><strong>All systems ready</strong></span></div>
      <nav className="life-nav" aria-label="Player navigation">{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeView === item.id ? 'is-active' : ''} onClick={() => navigate(item.id)} type="button"><Icon size={18} /><span>{item.label}</span></button> })}</nav>
      <div className="sidebar-chapter"><div className="chapter-orb"><Sparkles size={17} /></div><span className="eyebrow">Chapter one</span><strong>The first move</strong><p>Your story begins in {region.name}.</p></div>
      <div className="sidebar-bottom"><div className="sidebar-player"><span className="mini-avatar">{initials(user.profile.displayName, user.email)}</span><span><strong>{displayName}</strong><small>Level {user.character.level} · Resident</small></span><MoreHorizontal size={16} /></div><button className="sidebar-logout" type="button" onClick={logout} disabled={loggingOut}><LogOut size={16} /> {loggingOut ? 'Leaving…' : 'Sign out'}</button></div>
    </aside>
    <div className="life-main">
      <header className="life-topbar"><button className="mobile-menu-button life-menu mobile-only" type="button" onClick={() => setMobileNav(true)} aria-label="Open player navigation"><Menu size={19} /></button><div className="life-breadcrumb"><span className="breadcrumb-kicker">QATAR LIFE</span><ChevronRight size={14} /><span>{activeView === 'world' ? region.name : activeView === 'passport' ? 'Qatar Life Passport' : activeView === 'profile' ? 'Your profile' : systemBreadcrumb(activeView)}</span></div><div className="life-top-actions"><span className="top-status"><span className="status-dot" /> fictional world</span><button className="icon-button" aria-label="Notifications" type="button" onClick={() => navigate('notifications')}><Bell size={18} /></button><div className="top-wallet"><WalletCards size={16} /><span><small>Virtual QAR</small><strong>{formatQar(user.wallet.balanceMinor)}</strong></span></div><span className="top-avatar">{initials(user.profile.displayName, user.email)}</span></div></header>
      <main className="life-content shell-width">
        {activeView === 'passport' && <PassportPanel user={user} onClose={() => navigate('overview')} />}
        {activeView === 'profile' && <ProfileView user={user} regionName={region.name} onBack={() => navigate('overview')} onUserUpdated={onUserUpdated} />}
        {activeView === 'world' && <WorldView user={user} onOpenPassport={() => navigate('passport')} />}
        {isSystemView && <LifeSystems section={activeView as LifeSection} user={user} onUserUpdated={onUserUpdated} onNavigate={(view) => navigate(view)} />}
      </main>
      <nav className="mobile-bottom-nav mobile-only" aria-label="Mobile player navigation">{navItems.slice(0, 5).map((item) => { const Icon = item.icon; return <button key={item.id} className={activeView === item.id ? 'is-active' : ''} onClick={() => navigate(item.id)} type="button"><Icon size={18} /><span>{item.label}</span></button> })}</nav>
    </div>
  </div>
}

function systemBreadcrumb(view: LifeSection | 'world' | 'passport' | 'profile') {
  return { overview: 'Your life', jobs: 'Jobs & growth', shops: 'Shops & inventory', homes: 'Home base', activities: 'Activities', events: 'Events', social: 'People & chat', businesses: 'Businesses', marketplace: 'Marketplace', notifications: 'Notifications', world: 'World', passport: 'Passport', profile: 'Profile' }[view]
}

function WorldView({ user, onOpenPassport }: { user: UserBundle; onOpenPassport: () => void }) {
  return <PlayableWorld user={user} onOpenPassport={onOpenPassport} />
}

function ProfileView({ user, regionName, onBack, onUserUpdated }: { user: UserBundle; regionName: string; onBack: () => void; onUserUpdated: (user: UserBundle) => void }) {
  const [displayName, setDisplayName] = useState(user.profile.displayName || '')
  const [bio, setBio] = useState(user.profile.bio)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const result = await api.updateProfile({ displayName, bio })
      onUserUpdated({ ...result.user, wallet: user.wallet, character: user.character })
      setSaved(true)
    } catch (caught) {
      setError((caught as Error).message || 'We could not save your profile.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="profile-view page-card"><div className="profile-cover"><div className="profile-cover-orbit orbit-one" /><div className="profile-cover-orbit orbit-two" /><span className="profile-cover-label"><span className="status-dot" /> Resident profile</span></div><div className="profile-body"><div className="profile-avatar-large">{initials(user.profile.displayName, user.email)}</div><div className="profile-heading"><div><span className="eyebrow">Player profile</span><h1>{user.profile.displayName}</h1><p>Resident of {regionName} · Level {user.character.level}</p></div><button className="outline-button" type="button" onClick={onBack}><ArrowRight size={15} /> Back to world</button></div><form className="profile-edit-form" onSubmit={saveProfile}><div className="profile-edit-fields"><label><span className="detail-label">Display name</span><input className="text-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={24} required /></label><label><span className="detail-label">Short bio</span><textarea className="textarea-input" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} rows={3} placeholder="A little about your story" /></label></div>{error && <div className="form-alert" role="alert">{error}</div>}{saved && <div className="form-success" role="status">Profile saved.</div>}<button className="primary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</button></form><div className="profile-detail-grid"><div><span className="detail-label">Account</span><strong>{user.email}</strong><small>Private · only visible to you</small><small>Resident ID · {user.id}</small></div><div><span className="detail-label">Character style</span><strong>{styleLabel(user.character.presentation)}</strong><small>Original avatar presentation</small></div><div><span className="detail-label">Virtual QAR</span><strong>{formatQar(user.wallet.balanceMinor)}</strong><small>Fictional starting balance</small></div><div><span className="detail-label">Passport progress</span><strong>Server tracked</strong><small>Open Passport to see your achievements</small></div></div><div className="profile-safety"><ShieldCheck size={18} /><div><strong>Your profile stays yours.</strong><p>Qatar Life does not expose your email or private account information to other players. Social spaces are room-scoped and moderation-aware.</p></div></div></div></section>
}
