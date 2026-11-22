import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { Plus, Receipt, Layers } from 'lucide-react'
import { SPLITFLOW_ABI, SPLITFLOW_ADDRESS, ARC_MAINNET_CHAIN_ID, type BillData } from '@/lib/splitflow'
import { BillCard } from '@/components/BillCard'
import { ChainGuard } from '@/components/ChainGuard'
import { EscrowWarning } from '@/components/EscrowWarning'

const PAGE_SIZE = 20

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

  // ── No contract deployed ──────────────────────────────────────────────
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
      <main className="mx-auto max-w-2xl px-4 py-8 pb-16">

        {/* Page header */}
        <div className="mb-7">
          <h1
            className="display text-3xl font-bold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
          >
            {isConnected ? 'Your Bills' : 'Recent Bills'}
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Split bills. Fund together. Settle onchain.
          </p>
        </div>

        <EscrowWarning />

        {/* Connect CTA — unauthenticated */}
        {!isConnected && (
          <div
            className="mt-6 rounded-2xl p-6 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Connect your wallet to create or deposit into bills.
            </p>
            <div className="mt-4 flex justify-center">
              <appkit-button />
            </div>
          </div>
        )}

        {/* Bills list */}
        <div className="mt-6 flex flex-col gap-3">
          {/* Skeletons */}
          {isLoading && (
            <>
              {[0, 1, 2].map(i => (
                <div key={i} className="skeleton rounded-2xl h-36" />
              ))}
            </>
          )}

          {/* Empty */}
          {!isLoading && myBills.length === 0 && (
            <div
              className="rounded-2xl p-10 text-center"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div
                className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(100,116,139,0.10)', border: '1px solid rgba(100,116,139,0.18)' }}
              >
                <Receipt className="size-5" style={{ color: 'var(--subtle)' }} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--ink-2)' }}>
                {isConnected ? 'No bills for your wallet yet.' : 'No bills yet.'}
              </p>
              {isConnected && (
                <button
                  onClick={() => void navigate('/create')}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98]"
                  style={{ background: 'var(--accent)', color: '#fff' }}
                >
                  <Plus className="size-4" />
                  Create the first bill
                </button>
              )}
            </div>
          )}

          {/* Bill cards */}
          {!isLoading &&
            myBills.map(({ id, bill }) => (
              <BillCard key={id.toString()} billId={id} bill={bill} />
            ))}
        </div>

        {count > PAGE_SIZE && (
          <p className="mt-5 text-center text-xs" style={{ color: 'var(--subtle)' }}>
            Showing the {PAGE_SIZE} most recent bills.
          </p>
        )}
      </main>
    </ChainGuard>
  )
}
