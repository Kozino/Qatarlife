import { Sparkles } from 'lucide-react'

type BrandProps = {
  compact?: boolean
  onClick?: () => void
}

export function Brand({ compact = false, onClick }: BrandProps) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        QL
      </span>
      <span className="brand-copy">
        <span className="brand-name">Qatar Life</span>
        {!compact && <span className="brand-tagline">Live your Qatar story</span>}
      </span>
      {!compact && <Sparkles size={13} strokeWidth={2.4} className="brand-spark" aria-hidden="true" />}
    </>
  )

  return onClick ? (
    <button className="brand lockup-button" onClick={onClick} aria-label="Back to Qatar Life home">
      {content}
    </button>
  ) : (
    <div className="brand">{content}</div>
  )
}
