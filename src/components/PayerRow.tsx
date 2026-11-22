import { Check, Clock } from 'lucide-react'
import { formatUsdc, shortAddr } from '@/lib/utils'

interface Props {
  index: number
  address: `0x${string}`
  share: bigint
  deposited: bigint
  connectedAddress?: `0x${string}`
}

export function PayerRow({ index, address, share, deposited, connectedAddress }: Props) {
  const hasPaid = deposited > 0n
  const isMe = connectedAddress?.toLowerCase() === address.toLowerCase()

  return (
    <div className="flex items-center justify-between py-3 gap-3">
      {/* Left: status icon + address */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full"
          style={{
            background: hasPaid ? 'var(--success-dim)' : 'rgba(100,116,139,0.10)',
            border: `1px solid ${hasPaid ? 'var(--success-border)' : 'rgba(100,116,139,0.20)'}`,
          }}
        >
          {hasPaid
            ? <Check className="size-3.5" style={{ color: 'var(--success)' }} />
            : <Clock className="size-3.5" style={{ color: 'var(--subtle)' }} />
          }
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="mono text-xs font-medium truncate"
              style={{ color: hasPaid ? 'var(--ink)' : 'var(--muted)' }}
            >
              {shortAddr(address)}
            </span>
            {isMe && (
              <span
                className="rounded-full px-1.5 py-px text-xs font-semibold"
                style={{
                  background: 'var(--accent-dim)',
                  color: 'var(--accent-hover)',
                  border: '1px solid var(--accent-border)',
                  fontSize: '10px',
                }}
              >
                You
              </span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
            Payer {index + 1}
          </p>
        </div>
      </div>

      {/* Right: amount */}
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-2)' }}>
          {formatUsdc(share)} USDC
        </p>
        <p className="text-xs mt-0.5" style={{ color: hasPaid ? 'var(--success)' : 'var(--subtle)' }}>
          {hasPaid ? 'Paid' : 'Pending'}
        </p>
      </div>
    </div>
  )
}
