import { Award, Check, ChevronRight, Home, Lock, MapPin, Sparkles, Star, WalletCards, BriefcaseBusiness } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { PassportAchievement, UserBundle } from '../types'

type PassportPanelProps = { user: UserBundle; onClose: () => void }

function achievementIcon(iconKey: string | null) {
  if (iconKey === 'briefcase') return BriefcaseBusiness
  if (iconKey === 'home') return Home
  if (iconKey === 'map') return MapPin
  return iconKey === 'wallet' ? WalletCards : Sparkles
}

export function PassportPanel({ user, onClose }: PassportPanelProps) {
  const [achievements, setAchievements] = useState<PassportAchievement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api.passport()
      .then((result) => { if (!cancelled) setAchievements(result.achievements) })
      .catch((caught) => { if (!cancelled) setError((caught as Error).message || 'Passport progress is unavailable.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const unlocked = achievements.filter((achievement) => Boolean(achievement.unlockedAt)).length
  const total = achievements.length
  const percentage = total ? Math.round((unlocked / total) * 100) : 0

  return (
    <section className="passport-panel page-card">
      <div className="passport-cover">
        <div className="passport-cover-top"><span className="passport-seal"><Star size={16} fill="currentColor" /></span><span className="passport-overline">Qatar Life · fictional world</span></div>
        <div className="passport-cover-title"><span>QATAR</span><strong>LIFE</strong><em>PASSPORT</em></div>
        <div className="passport-cover-bottom"><span>PLAYER EDITION</span><span>{String(unlocked).padStart(2, '0')} / {String(total).padStart(2, '0')}</span></div>
      </div>
      <div className="passport-content">
        <div className="section-heading-row">
          <div><span className="eyebrow">Your progress</span><h2>{user.profile.displayName || 'Storyteller'}’s passport</h2></div>
          <button className="text-button" type="button" onClick={onClose}>Back to life <ChevronRight size={15} /></button>
        </div>
        {error && <div className="form-alert" role="alert">{error}</div>}
        <div className="passport-progress"><span><strong>{unlocked}</strong> of {total || '—'} stamps</span><div className="progress-track"><i style={{ width: `${percentage}%` }} /></div><span className="progress-percent">{percentage}%</span></div>
        {loading ? <div className="systems-loading"><span>Reading your server-backed progress…</span></div> : achievements.length ? <div className="passport-stamp-list">
          {achievements.map((achievement) => {
            const Icon = achievementIcon(achievement.iconKey)
            const state = achievement.unlockedAt ? 'unlocked' : achievement.progress > 0 ? 'next' : 'locked'
            return <div key={achievement.id} className={`passport-stamp stamp-${state}`}><span className={`stamp-icon stamp-icon-${achievement.category}`}><Icon size={17} /></span><span className="stamp-copy"><strong>{achievement.title}</strong><small>{achievement.description}</small></span><span className="stamp-status">{state === 'unlocked' ? <Check size={14} /> : state === 'next' ? <span className="next-tag">{achievement.slug === 'virtual-qar-100k' ? `${(achievement.progress / 100).toLocaleString()} / ${(achievement.target / 100).toLocaleString()} QAR` : `${achievement.progress} / ${achievement.target}`}</span> : <Lock size={13} />}</span></div>
          })}
        </div> : <div className="systems-empty"><Award size={20} /><p>No achievement catalog is available yet.</p></div>}
        <div className="passport-footer-note"><WalletCards size={17} /><span>Your passport tracks fictional achievements, not real-world credentials.</span></div>
      </div>
    </section>
  )
}
