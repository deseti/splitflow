import { useNavigate } from 'react-router-dom'
import { Users, ArrowRight, Clock } from 'lucide-react'
import { BillStateBadge } from './BillStateBadge'
import { formatUsdc, formatDate } from '@/lib/utils'
import { deriveBillState, BillState, type BillData } from '@/lib/splitflow'
import { useLiveNow } from '@/hooks/useLiveNow'

interface Props {
  billId: bigint
  bill: BillData
}

export function BillCard({ billId, bill }: Props) {
  const navigate = useNavigate()
  const nowSec = useLiveNow()
  const state = deriveBillState(bill, nowSec)
  const paidCount = Number(bill.depositCount)
  const pct = bill.payerCount > 0 ? Math.min(100, Math.round((paidCount / bill.payerCount) * 100)) : 0
  const isTerminal = state === BillState.SETTLED || state === BillState.CANCELLED

  const accentColor =
    state === BillState.FUNDED || state === BillState.SETTLED
      ? 'var(--success)'
      : state === BillState.REFUNDABLE
      ? 'var(--danger)'
      : state === BillState.CANCELLED
      ? 'var(--subtle)'
      : 'var(--accent)'

  return (
    <button
      onClick={() => void navigate(`/bill/${billId.toString()}`)}
      className="group w-full text-left rounded-2xl p-5 transition-all duration-200"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
      }}
      onMouseEnter={e => {
        (e.currentTarget).style.borderColor = 'var(--border-strong)'
        ;(e.currentTarget).style.background = 'var(--surface-hover)'
      }}
      onMouseLeave={e => {
        (e.currentTarget).style.borderColor = 'var(--border)'
        ;(e.currentTarget).style.background = 'var(--surface)'
      }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <h3
            className="display font-semibold text-base truncate"
            style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
          >
            {bill.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Clock className="size-3 shrink-0" style={{ color: 'var(--subtle)' }} />
            <p className="text-xs truncate" style={{ color: 'var(--subtle)' }}>
              {formatDate(bill.deadline)}
            </p>
          </div>
        </div>
        <BillStateBadge state={state} className="shrink-0" />
      </div>

      {/* Amount + payer count */}
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <span
            className="display text-2xl font-bold tabular-nums"
            style={{ color: 'var(--ink)' }}
          >
            {formatUsdc(bill.totalAmount)}
          </span>
          <span className="ml-1.5 text-sm font-medium" style={{ color: 'var(--subtle)' }}>
            USDC
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs pb-0.5" style={{ color: 'var(--muted)' }}>
          <Users className="size-3.5 shrink-0" />
          <span className="tabular-nums">{paidCount}/{bill.payerCount} paid</span>
        </div>
      </div>

      {/* Progress */}
      {!isTerminal && (
        <div className="mt-3">
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: accentColor }}
            />
          </div>
        </div>
      )}

      {/* Footer CTA */}
      <div
        className="mt-3.5 flex items-center justify-end gap-1 text-xs font-medium transition-opacity opacity-60 group-hover:opacity-100"
        style={{ color: 'var(--accent-hover)' }}
      >
        View details <ArrowRight className="size-3.5" />
      </div>
    </button>
  )
}
