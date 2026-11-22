import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { Plus, Receipt, Layers, ArrowRight, Zap, Shield, Users } from 'lucide-react'
import { SPLITFLOW_ABI, SPLITFLOW_ADDRESS, ARC_MAINNET_CHAIN_ID, type BillData } from '@/lib/splitflow'
import { BillCard } from '@/components/BillCard'
import { ChainGuard } from '@/components/ChainGuard'

const PAGE_SIZE = 20

// ── Feature pills shown in hero when wallet not connected ─────────────────────
const FEATURES = [
  { icon: Zap,    label: 'Sub-second finality' },
  { icon: Shield, label: 'Non-custodial escrow' },
  { icon: Users,  label: 'Up to 5 participants'  },
]

export function Home() {
  const { address, isConnected } = useAccount()
  const navigate = useNavigate()

  const { data: billCount, isLoading: countLoading } = useReadContract({
    address: SPLITFLOW_ADDRESS,
    abi: SPLITFLOW_ABI,
    functionName: 'billCount',
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!SPLITFLOW_ADDRESS, refetchInterval: 10_000 },
  })

  const count = Number(billCount ?? 0n)
  const start = Math.max(0, count - PAGE_SIZE)
  const ids = Array.from({ length: count - start }, (_, i) => BigInt(start + i)).reverse()

  const billContracts = ids.map(id => ({
    address: SPLITFLOW_ADDRESS as `0x${string}`,
    abi: SPLITFLOW_ABI,
    functionName: 'getBill' as const,
    args: [id] as const,
    chainId: ARC_MAINNET_CHAIN_ID,
  }))

  const { data: billResults, isLoading: billsLoading } = useReadContracts({
    contracts: billContracts,
    query: {
      enabled: ids.length > 0 && !!SPLITFLOW_ADDRESS,
      refetchInterval: 15_000,
    },
  })

  const bills: Array<{ id: bigint; bill: BillData }> = (billResults ?? [])
    .map((r, i) => ({ id: ids[i], bill: r.result }))
    .filter((b): b is { id: bigint; bill: BillData } => b.bill !== undefined)

  const myBills = address
    ? bills.filter(({ bill }) => {
        if (bill.creator.toLowerCase() === address.toLowerCase()) return true
        return bill.payers
          .slice(0, bill.payerCount)
          .some((p: `0x${string}`) => p.toLowerCase() === address.toLowerCase())
      })
    : bills

  const isLoading = countLoading || billsLoading

  // ── Contract not deployed ─────────────────────────────────────────────────
  if (!SPLITFLOW_ADDRESS) {
    return (
      <div className="min-h-dvh flex items-center justify-center px-4">
        <div
          className="rounded-3xl p-8 text-center max-w-sm w-full"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <div
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
          >
            <Layers className="size-6" style={{ color: 'var(--accent)' }} />
          </div>
          <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
            Contract Not Deployed
          </h2>
          <p className="mt-2 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
            Set{' '}
            <code
              className="mono text-xs rounded px-1.5 py-0.5"
              style={{ background: 'var(--surface-muted)', color: 'var(--accent-hover)' }}
            >
              VITE_SPLITFLOW_CONTRACT_ADDRESS
            </code>{' '}
            in <code className="mono text-xs">.env</code> after deploying to Arc Mainnet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <ChainGuard>
      <main className="mx-auto max-w-2xl px-4 pb-24">

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        {!isConnected ? (
          <section className="pt-16 pb-12 text-center">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-6 text-xs font-semibold uppercase tracking-widest"
              style={{
                background: 'var(--accent-dim)',
                color: 'var(--accent-hover)',
                border: '1px solid var(--accent-border)',
                letterSpacing: '0.08em',
              }}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
              Arc Mainnet · USDC
            </div>

            <h1
              className="display text-4xl sm:text-5xl font-bold text-balance mb-4"
              style={{ color: 'var(--ink)', letterSpacing: '-0.03em', lineHeight: 1.1 }}
            >
              Split shared bills onchain
            </h1>
            <p
              className="text-base sm:text-lg text-pretty max-w-md mx-auto mb-8"
              style={{ color: 'var(--muted)', lineHeight: 1.6 }}
            >
              Create group expenses, collect contributions, and settle transparently with USDC on Arc.
            </p>

            {/* Feature pills */}
            <div className="flex flex-wrap justify-center gap-2 mb-10">
              {FEATURES.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: 'var(--surface)',
                    color: 'var(--muted)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <Icon className="size-3 shrink-0" style={{ color: 'var(--accent)' }} />
                  {label}
                </span>
              ))}
            </div>

            {/* Connect CTA */}
            <div
              className="rounded-2xl p-6"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <p className="text-sm mb-4 font-medium" style={{ color: 'var(--muted)' }}>
                Connect your wallet to get started
              </p>
              <div className="flex justify-center">
                <appkit-button />
              </div>
            </div>
          </section>
        ) : (
          /* ── Authenticated header ───────────────────────────────────── */
          <section className="pt-10 pb-8 flex items-end justify-between gap-4">
            <div>
              <h1
                className="display text-2xl sm:text-3xl font-bold"
                style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
              >
                Your Bills
              </h1>
              <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
                Split bills. Fund together. Settle onchain.
              </p>
            </div>
            <button
              onClick={() => void navigate('/create')}
              className="shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.97]"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <Plus className="size-4" />
              <span>Create New Bill</span>
            </button>
          </section>
        )}

        {/* ── Bill list ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Skeletons */}
          {isLoading && (
            <>
              {[0, 1, 2].map(i => (
                <div key={i} className="skeleton rounded-2xl h-36" />
              ))}
            </>
          )}

          {/* Empty state */}
          {!isLoading && myBills.length === 0 && (
            <div
              className="rounded-2xl px-6 py-14 text-center"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div
                className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.14)' }}
              >
                <Receipt className="size-6" style={{ color: 'var(--accent)' }} />
              </div>
              <p
                className="display text-base font-semibold mb-1.5"
                style={{ color: 'var(--ink)' }}
              >
                No bills yet
              </p>
              <p className="text-sm text-pretty max-w-xs mx-auto mb-7" style={{ color: 'var(--muted)' }}>
                Create your first shared bill and invite participants to contribute.
              </p>
              {isConnected && (
                <button
                  onClick={() => void navigate('/create')}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.97]"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  <Plus className="size-4" />
                  Create New Bill
                </button>
              )}
            </div>
          )}

          {/* Cards */}
          {!isLoading &&
            myBills.map(({ id, bill }) => (
              <BillCard key={id.toString()} billId={id} bill={bill} />
            ))}
        </div>

        {count > PAGE_SIZE && (
          <p className="mt-6 text-center text-xs" style={{ color: 'var(--subtle)' }}>
            Showing the {PAGE_SIZE} most recent bills.
          </p>
        )}

        {/* ── Learn more row (unauthenticated) ──────────────────────────── */}
        {!isConnected && (
          <div className="mt-10 flex justify-center">
            <a
              href="https://github.com/deseti/splitflow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--muted)' }}
            >
              View source on GitHub <ArrowRight className="size-3.5" />
            </a>
          </div>
        )}
      </main>
    </ChainGuard>
  )
}
