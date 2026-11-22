import { Info, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { BillState } from '@/lib/splitflow'
import { formatDate, formatCountdown } from '@/lib/utils'
import { useLiveNow } from '@/hooks/useLiveNow'

interface Props {
  state: BillState
  settleDeadline: bigint
  deadline: bigint
}

export function GracePeriodNotice({ state, settleDeadline, deadline }: Props) {
  const nowSec = useLiveNow()
  const nowBig = BigInt(Math.floor(nowSec))
  const nowMs = nowSec * 1000

  if (state === BillState.SETTLED || state === BillState.CANCELLED) return null

  if (state === BillState.FUNDED) {
    return (
      <div
        className="flex gap-3 rounded-2xl p-4"
        style={{
          background: 'var(--success-dim)',
          border: '1px solid var(--success-border)',
        }}
      >
        <CheckCircle2 className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            Fully funded — settle before {formatDate(settleDeadline)}
          </p>
          <p className="text-xs mt-0.5 text-pretty" style={{ color: 'var(--muted)' }}>
            {formatCountdown(settleDeadline, nowMs)} remaining in the 7-day settlement window.
            After that, settlement is permanently disabled and depositors may claim refunds.
          </p>
        </div>
      </div>
    )
  }

  if (state === BillState.REFUNDABLE) {
    const underfunded = nowBig >= deadline
    return (
      <div
        className="flex gap-3 rounded-2xl p-4"
        style={{
          background: 'var(--danger-dim)',
          border: '1px solid var(--danger-border)',
        }}
      >
        <XCircle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
            Refunds available
          </p>
          <p className="text-xs mt-0.5 text-pretty" style={{ color: 'var(--muted)' }}>
            {underfunded
              ? 'Deposit deadline passed — bill was underfunded.'
              : 'Settlement grace period expired — funded but not settled.'}
            {' '}Each payer can now reclaim their deposited share. Settlement is permanently disabled.
          </p>
        </div>
      </div>
    )
  }

  if (state === BillState.OPEN) {
    return (
      <div
        className="flex gap-3 rounded-2xl p-4"
        style={{
          background: 'rgba(139,92,246,0.07)',
          border: '1px solid var(--accent-border)',
        }}
      >
        <Clock className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
            Deposit deadline: {formatDate(deadline)}
          </p>
          <p className="text-xs mt-0.5 text-pretty" style={{ color: 'var(--muted)' }}>
            Once fully funded, a 7-day settlement window opens (until {formatDate(settleDeadline)}).
            If the bill expires underfunded, or is funded but not settled within that window,
            depositors may claim refunds.
          </p>
        </div>
      </div>
    )
  }

  if (state === BillState.FUNDED) return null

  return (
    <div
      className="flex gap-3 rounded-2xl p-4"
      style={{ background: 'rgba(100,116,139,0.07)', border: '1px solid rgba(100,116,139,0.15)' }}
    >
      <Info className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--subtle)' }} />
      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        Settle by {formatDate(settleDeadline)} (7-day window after deposit deadline).
      </p>
    </div>
  )
}
