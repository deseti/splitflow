import { BillState } from '@/lib/splitflow'

interface Props {
  state: BillState
  className?: string
}

const CONFIG: Record<BillState, { label: string; bg: string; color: string; border: string }> = {
  [BillState.OPEN]: {
    label: 'Open',
    bg: 'rgba(100,116,139,0.12)',
    color: '#94A3B8',
    border: 'rgba(100,116,139,0.25)',
  },
  [BillState.FUNDED]: {
    label: 'Funded',
    bg: 'var(--success-dim)',
    color: 'var(--success)',
    border: 'var(--success-border)',
  },
  [BillState.SETTLED]: {
    label: 'Settled',
    bg: 'rgba(34,201,160,0.18)',
    color: 'var(--success)',
    border: 'var(--success-border)',
  },
  [BillState.REFUNDABLE]: {
    label: 'Refundable',
    bg: 'var(--danger-dim)',
    color: 'var(--danger)',
    border: 'var(--danger-border)',
  },
  [BillState.CANCELLED]: {
    label: 'Cancelled',
    bg: 'rgba(100,116,139,0.08)',
    color: 'var(--subtle)',
    border: 'rgba(100,116,139,0.15)',
  },
}

export function BillStateBadge({ state, className = '' }: Props) {
  const { label, bg, color, border } = CONFIG[state]
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-widest uppercase ${className}`}
      style={{ background: bg, color, border: `1px solid ${border}` }}
    >
      {label}
    </span>
  )
}
