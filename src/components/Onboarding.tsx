import { useState } from 'react'
import { ArrowRight, Check, Compass, LoaderCircle, MapPin } from 'lucide-react'
import { api } from '../lib/api'
import type { AvatarHairstyle, AvatarSkinTone, PresentationStyle, RegionSlug, UserBundle } from '../types'
import { regionOptions } from './WorldMap'

const presentationOptions: Array<{ id: PresentationStyle; label: string; caption: string; glyph: string }> = [
  { id: 'modern-casual', label: 'Modern casual', caption: 'Easy, everyday layers', glyph: 'MC' },
  { id: 'thobe-inspired', label: 'Thobe-inspired', caption: 'A timeless silhouette', glyph: 'TI' },
  { id: 'abaya-inspired', label: 'Abaya-inspired', caption: 'Elegant and expressive', glyph: 'AI' },
  { id: 'activewear', label: 'Activewear', caption: 'Ready for the next move', glyph: 'AW' },
]

type OnboardingProps = {
  user: UserBundle
  onComplete: (user: UserBundle) => void
}

export function Onboarding({ user, onComplete }: OnboardingProps) {
  const [displayName, setDisplayName] = useState(user.profile.displayName || '')
  const [startingRegion, setStartingRegion] = useState<RegionSlug>('doha')
  const [presentation, setPresentation] = useState<PresentationStyle>(user.character.presentation)
  const [skinTone, setSkinTone] = useState<AvatarSkinTone>(user.avatar.skinTone)
  const [hairstyle, setHairstyle] = useState<AvatarHairstyle>(user.avatar.hairstyle)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [fieldError, setFieldError] = useState('')

  const selectedRegion = regionOptions.find((region) => region.id === startingRegion)!

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setFieldError('')
    try {
      const result = await api.completeOnboarding({ displayName, startingRegion, presentation, skinTone, hairstyle })
      onComplete(result.user)
    } catch (caught) {
      const typed = caught as Error & { fields?: Record<string, string> }
      setError(typed.message || 'We could not save your story yet.')
      setFieldError(typed.fields?.displayName || '')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="onboarding-page">
      <div className="onboarding-noise" aria-hidden="true" />
      <header className="onboarding-header shell-width">
        <div className="brand onboarding-brand"><span className="brand-mark">QL</span><span className="brand-name">Qatar Life</span></div>
        <span className="fiction-pill"><span className="status-dot" /> Fictional world</span>
      </header>
      <div className="onboarding-shell shell-width">
        <div className="onboarding-progress">
          <span className="progress-step is-current"><b>01</b> Your character</span>
          <span className="progress-rule" />
          <span className="progress-step"><b>02</b> Your first district</span>
          <span className="progress-rule" />
          <span className="progress-step"><b>03</b> Enter the world</span>
        </div>
        <div className="onboarding-grid">
          <section className="onboarding-copy">
            <span className="eyebrow">A good story starts with a name</span>
            <h1>Who will you become here?</h1>
            <p className="onboarding-lede">Shape a first look, choose a district and step into a world built for small moments and big chapters.</p>
            <div className="fiction-note"><Compass size={17} /><span>Everything you choose is fictional and exists only inside Qatar Life.</span></div>

            <form onSubmit={submit} className="onboarding-form">
              <div>
                <label className="field-label" htmlFor="display-name">Your display name</label>
                <input id="display-name" className={`text-input onboarding-name-input ${fieldError ? 'has-error' : ''}`} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Noor" maxLength={24} required autoFocus />
                {fieldError && <span className="field-error">{fieldError}</span>}
              </div>

              <div>
                <div className="field-label-row"><span className="field-label">Choose a style</span><span className="field-hint">You can change this later</span></div>
                <div className="presentation-grid">
                  {presentationOptions.map((option) => (
                    <button key={option.id} type="button" className={`presentation-card ${presentation === option.id ? 'is-selected' : ''}`} onClick={() => setPresentation(option.id)} aria-pressed={presentation === option.id}>
                      <span className={`avatar-glyph avatar-${option.id}`}><span>{option.glyph}</span></span>
                      <span className="presentation-text"><strong>{option.label}</strong><small>{option.caption}</small></span>
                      {presentation === option.id && <span className="selected-check"><Check size={13} /></span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="avatar-customizer">
                <div className="field-label-row"><span className="field-label">Fine-tune your look</span><span className="field-hint">Basic avatar settings</span></div>
                <div className="avatar-pick-row"><span className="avatar-pick-label">Tone</span>{([['warm-sand', 'Sand'], ['desert-rose', 'Rose'], ['deep-umber', 'Umber'], ['pearl', 'Pearl']] as const).map(([value, label]) => <button key={value} type="button" className={`tone-swatch tone-${value} ${skinTone === value ? 'is-selected' : ''}`} onClick={() => setSkinTone(value)} aria-label={`Skin tone: ${label}`} aria-pressed={skinTone === value} />)}</div>
                <div className="avatar-pick-row"><span className="avatar-pick-label">Hair</span>{([['natural-short', 'Short'], ['soft-waves', 'Waves'], ['textured-crop', 'Crop'], ['covered', 'Covered']] as const).map(([value, label]) => <button key={value} type="button" className={`hair-choice ${hairstyle === value ? 'is-selected' : ''}`} onClick={() => setHairstyle(value)} aria-pressed={hairstyle === value}>{label}</button>)}</div>
              </div>

              <div>
                <div className="field-label-row"><span className="field-label">Pick a starting district</span><span className="field-hint">A first address, not a limit</span></div>
                <div className="district-list">
                  {regionOptions.map((region) => (
                    <button key={region.id} type="button" className={`district-row ${startingRegion === region.id ? 'is-selected' : ''}`} onClick={() => setStartingRegion(region.id)} aria-pressed={startingRegion === region.id}>
                      <span className="district-icon"><MapPin size={16} /></span>
                      <span><strong>{region.name}</strong><small>{region.eyebrow}</small></span>
                      <span className="district-check">{startingRegion === region.id ? <Check size={15} /> : <span />}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && <div className="form-alert" role="alert">{error}</div>}
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
                {busy ? 'Saving your story…' : 'Enter Qatar Life'}
              </button>
            </form>
          </section>

          <aside className="onboarding-preview">
            <div className="preview-orbit orbit-one" />
            <div className="preview-orbit orbit-two" />
            <div className="character-stage">
              <div className={`character-silhouette character-${presentation}`}>
                <div className="character-head" />
                <div className="character-body"><span className="character-scarf" /></div>
                <div className="character-shadow" />
              </div>
              <div className="character-label"><span className="status-dot" /> Your first look</div>
            </div>
            <div className="preview-region-card">
              <span className="eyebrow">Starting in</span>
              <strong>{selectedRegion.name}</strong>
              <p>{selectedRegion.description}</p>
              <div className="preview-region-meta"><MapPin size={14} /> First district · Chapter one</div>
            </div>
            <div className="preview-balance-card"><span>Starter balance</span><strong>5,000 <small>Virtual QAR</small></strong><em>Ready for your first move</em></div>
          </aside>
        </div>
      </div>
    </main>
  )
}
