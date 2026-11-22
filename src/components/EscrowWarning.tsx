import { ShieldAlert } from 'lucide-react'

export function EscrowWarning() {
  return (
    <div
      className="flex gap-3 rounded-2xl px-4 py-3"
      style={{
        background: 'var(--warning-dim)',
        border: '1px solid rgba(251,191,36,0.18)',
      }}
    >
      <ShieldAlert className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
      <p className="text-xs leading-relaxed" style={{ color: '#D4A017' }}>
        SplitFlow is an unaudited smart contract. Only use funds you can afford to lose.
        USDC transfers may be restricted or permanently blocked by Circle if addresses are sanctioned.
      </p>
    </div>
  )
}
