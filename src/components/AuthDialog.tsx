import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, X } from 'lucide-react'
import { api } from '../lib/api'
import type { UserBundle } from '../types'

type AuthMode = 'signup' | 'login' | 'reset-request' | 'reset-confirm'

type AuthDialogProps = {
  open: boolean
  initialMode?: 'signup' | 'login'
  onClose: () => void
  onSuccess: (user: UserBundle) => void
}

export function AuthDialog({ open, initialMode = 'signup', onClose, onSuccess }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setMode(initialMode)
    setError('')
    setMessage('')
    setFieldErrors({})
  }, [open, initialMode])

  const passwordChecks = useMemo(
    () => [
      { label: '8 characters', ok: password.length >= 8 },
      { label: 'a letter', ok: /[A-Za-z]/.test(password) },
      { label: 'a number', ok: /[0-9]/.test(password) },
    ],
    [password],
  )

  if (!open) return null

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    setFieldErrors({})
    try {
      if (mode === 'reset-request') {
        const result = await api.requestPasswordReset(email)
        if (result.devResetToken) {
          setResetToken(result.devResetToken)
          setMode('reset-confirm')
          setMessage('Preview mode: a reset token was generated for this local account.')
        } else {
          setMessage(result.message)
        }
        return
      }
      if (mode === 'reset-confirm') {
        const result = await api.confirmPasswordReset(resetToken, password)
        setMode('login')
        setPassword('')
        setMessage(result.message)
        return
      }
      const cleanEmail = email.trim().toLowerCase()
      const result = mode === 'signup' ? await api.signup(cleanEmail, password) : await api.login(cleanEmail, password)
      onSuccess(result.user)
    } catch (caught) {
      const typed = caught as Error & { fields?: Record<string, string> }
      setError(typed.message || 'We could not complete that request.')
      setFieldErrors(typed.fields || {})
    } finally {
      setBusy(false)
    }
  }

  // FIX: login mode must also show the password field.
  const isPasswordMode = mode === 'signup' || mode === 'login' || mode === 'reset-confirm'
  const showChecklist = mode === 'signup' || mode === 'reset-confirm'
  const title = mode === 'signup' ? 'Make a life of it.' : mode === 'login' ? 'Welcome back, storyteller.' : mode === 'reset-request' ? 'Find your way back.' : 'Choose a new password.'
  const intro = mode === 'signup' ? 'Create a free player account and start with 5,000 Virtual QAR.' : mode === 'login' ? 'Your city is waiting exactly where you left it.' : mode === 'reset-request' ? 'Enter your email and we will send a secure reset link.' : 'Your reset link is ready. Set a password you will remember.'

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="icon-button dialog-close" onClick={onClose} type="button" aria-label="Close"><X size={18} /></button>
        <div className="auth-dialog-intro">
          <div className="auth-lock">{mode === 'reset-request' ? <Mail size={18} /> : <LockKeyhole size={18} />}</div>
          <span className="eyebrow">{mode.startsWith('reset') ? 'Account recovery' : 'Your next chapter'}</span>
          <h2 id="auth-title">{title}</h2>
          <p>{intro}</p>
        </div>

        {(mode === 'signup' || mode === 'login') && (
          <div className="auth-tabs" role="tablist" aria-label="Account action">
            <button className={mode === 'signup' ? 'is-active' : ''} onClick={() => { setMode('signup'); setError(''); setMessage(''); setFieldErrors({}) }} type="button" role="tab" aria-selected={mode === 'signup'}>Create account</button>
            <button className={mode === 'login' ? 'is-active' : ''} onClick={() => { setMode('login'); setError(''); setMessage(''); setFieldErrors({}) }} type="button" role="tab" aria-selected={mode === 'login'}>Sign in</button>
          </div>
        )}

        <form className="auth-form" onSubmit={submit}>
          {mode === 'reset-confirm' && (
            <>
              <label className="field-label" htmlFor="reset-token">Reset token</label>
              <input id="reset-token" className="text-input" value={resetToken} onChange={(event) => setResetToken(event.target.value)} placeholder="Paste your reset token" required />
            </>
          )}
          {mode !== 'reset-confirm' && (
            <>
              <label className="field-label" htmlFor="auth-email">Email address</label>
              <input id="auth-email" className={`text-input ${fieldErrors.email ? 'has-error' : ''}`} type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
              {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
            </>
          )}

          {isPasswordMode && (
            <>
              <div className="field-label-row"><label className="field-label" htmlFor="auth-password">Password</label><span className="field-hint">{mode === 'login' ? 'Your password' : 'Secure password'}</span></div>
              <div className="password-wrap">
                <input
                  id="auth-password"
                  className={`text-input ${fieldErrors.password ? 'has-error' : ''}`}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={mode === 'signup' ? 'At least 8 characters' : mode === 'login' ? 'Your password' : 'Your new password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
                <button className="password-toggle" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
              {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
              {showChecklist && (
                <div className="password-checks" aria-label="Password requirements">{passwordChecks.map((check) => <span key={check.label} className={check.ok ? 'is-met' : ''}><Check size={13} /> {check.label}</span>)}</div>
              )}
            </>
          )}

          {error && <div className="form-alert" role="alert">{error}</div>}
          {message && <div className="form-success" role="status">{message}</div>}
          <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}{busy ? 'Working…' : mode === 'signup' ? 'Start your life' : mode === 'login' ? 'Enter Qatar Life' : mode === 'reset-request' ? 'Send reset instructions' : 'Update password'}</button>
          {mode === 'login' && <button className="auth-link-button" type="button" onClick={() => { setMode('reset-request'); setError(''); setMessage('') }}>Forgot your password?</button>}
          {mode.startsWith('reset') && <button className="auth-link-button back-link" type="button" onClick={() => { setMode('login'); setError(''); setMessage('') }}><ArrowLeft size={13} /> Back to sign in</button>}
          <p className="form-footnote">Fictional world. Virtual QAR has no real-world monetary value.</p>
        </form>
      </section>
    </div>
  )
}
