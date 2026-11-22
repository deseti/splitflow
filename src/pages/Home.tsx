import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { useNavigate, Link } from 'react-router-dom'
import { Plus, Receipt, ArrowRight, ExternalLink, Copy, Check, CheckCircle2 } from 'lucide-react'
import { SPLITFLOW_ABI, SPLITFLOW_ADDRESS, ARC_MAINNET_CHAIN_ID, type BillData, BillState, deriveBillState } from '@/lib/splitflow'
import { formatUsdc } from '@/lib/utils'
import { BillCard } from '@/components/BillCard'
import { BillStateBadge } from '@/components/BillStateBadge'
import { ChainGuard } from '@/components/ChainGuard'
import { useLiveNow } from '@/hooks/useLiveNow'

const PAGE_SIZE = 20
const CONTRACT_ADDRESS = '0xf28Ee372004dfEb66e54a014E437fbd196d79bB6'
const EXPLORER_CONTRACT = `https://explorer.arc.io/address/${CONTRACT_ADDRESS}?tab=contract`

// ── How It Works steps ────────────────────────────────────────────────────────
const HOW_STEPS = [
  { n: '1', title: 'Create a bill', body: 'Set a title, recipient, total amount, up to 5 payer wallets with exact shares, and a funding deadline.' },
  { n: '2', title: 'Each payer deposits USDC', body: 'Payers approve and deposit their assigned share. Funds are held in the smart contract — no intermediary.' },
  { n: '3', title: 'Fully funded → settle', body: 'Once all shares are deposited, anyone can settle the bill. The full amount is transferred to the recipient in one transaction.' },
  { n: '4', title: 'Expired bill → refunds', body: 'If the bill expires underfunded, or a funded bill is not settled within the 7-day grace period, depositors can reclaim their contributions.' },
]

// ── Live demo card — reads Bill #0 from the contract ─────────────────────────
function LiveDemoCard() {
  const nowSec = useLiveNow()
  const { data: bill, isLoading } = useReadContract({
    address: SPLITFLOW_ADDRESS,
    abi: SPLITFLOW_ABI,
    functionName: 'getBill',
    args: [0n],
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!SPLITFLOW_ADDRESS },
  }) as { data: BillData | undefined; isLoading: boolean }

  const state = bill ? deriveBillState(bill, nowSec) : null
  const isSettled = state === BillState.SETTLED

  return (
    <Link
      to="/bill/0"
      className="flex items-start justify-between gap-4 rounded-xl p-4 transition-all"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        textDecoration: 'none',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase mb-1" style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}>
          Live demo · Bill #0
        </p>
        {isLoading ? (
          <div className="skeleton h-5 w-32 rounded mb-1" />
        ) : bill ? (
          <>
            <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
              {bill.title || 'Demo Bill'}
            </p>
            <p className="text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
              {formatUsdc(bill.totalAmount)} USDC · {Number(bill.depositCount)}/{bill.payerCount} payers
            </p>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Demo bill on Arc Mainnet</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 pt-0.5">
        {state !== null ? (
          <BillStateBadge state={state} />
        ) : isSettled ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={{ background: 'rgba(34,201,160,0.10)', color: 'var(--success)', border: '1px solid rgba(34,201,160,0.25)' }}>
            <CheckCircle2 className="size-3" /> SETTLED
          </span>
        ) : null}
        <ArrowRight className="size-4 opacity-40" style={{ color: 'var(--muted)' }} />
      </div>
    </Link>
  )
}

// ── Contract proof section ────────────────────────────────────────────────────
function ContractProof() {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(CONTRACT_ADDRESS).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  return (
    <section
      className="rounded-2xl p-5 mt-8"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <h2
          className="display text-base font-bold"
          style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
        >
          Contract &amp; Onchain Proof
        </h2>
        <a
          href={EXPLORER_CONTRACT}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-90"
          style={{ background: 'var(--accent-dim)', color: 'var(--accent-hover)', border: '1px solid var(--accent-border)' }}
        >
          <ExternalLink className="size-3" />
          Arc Explorer
        </a>
      </div>

      {/* Network info */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Network', value: 'Arc Mainnet' },
          { label: 'Chain ID', value: '5042' },
          { label: 'Token', value: 'USDC' },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-xl p-3 text-center"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
          >
            <p className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>{label}</p>
            <p className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Contract address */}
      <div
        className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 mb-5"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
      >
        <div className="min-w-0">
          <p className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>Contract address</p>
          <p className="mono text-xs tabular-nums truncate" style={{ color: 'var(--ink)' }}>
            {CONTRACT_ADDRESS}
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:opacity-80"
          style={{
            background: copied ? 'rgba(34,201,160,0.12)' : 'var(--surface-strong)',
            color: copied ? 'var(--success)' : 'var(--muted)',
            border: `1px solid ${copied ? 'rgba(34,201,160,0.25)' : 'var(--border)'}`,
          }}
          aria-label="Copy contract address"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Verification badge */}
      <div
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 mb-5"
        style={{ background: 'rgba(34,201,160,0.06)', border: '1px solid rgba(34,201,160,0.18)' }}
      >
        <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--success)' }}>Source verified — Exact Match</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Solidity 0.8.28 · EVM Paris · 200 runs optimizer</p>
        </div>
      </div>

      {/* Live demo card */}
      <p className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}>
        Mainnet demonstration
      </p>
      <LiveDemoCard />
    </section>
  )
}

// ── How It Works section ──────────────────────────────────────────────────────
function HowItWorks() {
  return (
    <section className="mt-8">
      <h2
        className="display text-base font-bold mb-4"
        style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}
      >
        How It Works
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {HOW_STEPS.map(step => (
          <div
            key={step.n}
            className="rounded-xl p-4 flex gap-3"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span
              className="display flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
            >
              {step.n}
            </span>
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>{step.title}</p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
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
    query: { enabled: ids.length > 0 && !!SPLITFLOW_ADDRESS, refetchInterval: 15_000 },
  })

  const bills: Array<{ id: bigint; bill: BillData }> = (billResults ?? [])
    .map((r, i) => ({ id: ids[i], bill: r.result }))
    .filter((b): b is { id: bigint; bill: BillData } => b.bill !== undefined)

  const myBills = address
    ? bills.filter(({ bill }) => {
        if (bill.creator.toLowerCase() === address.toLowerCase()) return true
        return bill.payers.slice(0, bill.payerCount).some((p: `0x${string}`) => p.toLowerCase() === address.toLowerCase())
      })
    : bills

  const isLoading = countLoading || billsLoading

  // ── Contract not deployed ──────────────────────────────────────────────────
  if (!SPLITFLOW_ADDRESS) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Set <code className="mono text-xs">VITE_SPLITFLOW_CONTRACT_ADDRESS</code> in .env after deploying to Arc Mainnet.
        </p>
      </main>
    )
  }

  return (
    <ChainGuard>
      <main className="mx-auto max-w-2xl px-4 sm:px-6 pb-24">

        {/* ── Compact intro — always visible ──────────────────────────────── */}
        <section className="pt-10 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p
                className="text-xs font-semibold uppercase mb-2"
                style={{ color: 'var(--accent-hover)', letterSpacing: '0.08em' }}
              >
                Arc Mainnet · USDC
              </p>
              <h1
                className="display text-2xl sm:text-3xl font-bold text-balance"
                style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
              >
                Shared USDC Bills on Arc
              </h1>
              <p className="mt-1.5 text-sm text-pretty max-w-md" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                Create a shared bill, collect individual contributions, and settle securely onchain once everyone has paid.
              </p>
            </div>
            {!isConnected && (
              <div className="flex gap-2 shrink-0">
                <appkit-button />
              </div>
            )}
            {isConnected && (
              <button
                onClick={() => void navigate('/create')}
                className="shrink-0 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.97]"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                <Plus className="size-4" />
                Create New Bill
              </button>
            )}
          </div>

          {/* Quick action links */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => void navigate('/create')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent-hover)', border: '1px solid var(--accent-border)' }}
            >
              <Plus className="size-3" />
              Create New Bill
            </button>
            <Link
              to="/docs"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              View Documentation
              <ArrowRight className="size-3" />
            </Link>
            <a
              href={EXPLORER_CONTRACT}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}
            >
              Verified Contract
              <ExternalLink className="size-3" />
            </a>
          </div>
        </section>

        {/* ── Bill list ─────────────────────────────────────────────────────── */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2
              className="display text-sm font-semibold uppercase"
              style={{ color: 'var(--muted)', letterSpacing: '0.07em' }}
            >
              {isConnected ? 'Your Bills' : 'Recent Bills'}
            </h2>
            {isConnected && (
              <button
                onClick={() => void navigate('/create')}
                className="inline-flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
                style={{ color: 'var(--accent-hover)' }}
              >
                <Plus className="size-3.5" /> New Bill
              </button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {isLoading && [0, 1, 2].map(i => <div key={i} className="skeleton rounded-2xl h-36" />)}

            {!isLoading && myBills.length === 0 && (
              <div
                className="rounded-2xl px-6 py-12 text-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
              >
                <div
                  className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl"
                  style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.14)' }}
                >
                  <Receipt className="size-5" style={{ color: 'var(--accent)' }} />
                </div>
                <p className="display text-base font-semibold mb-1.5" style={{ color: 'var(--ink)' }}>
                  No bills yet
                </p>
                <p className="text-sm text-pretty max-w-xs mx-auto mb-6" style={{ color: 'var(--muted)' }}>
                  Create your first shared bill and invite participants to contribute.
                </p>
                {isConnected && (
                  <button
                    onClick={() => void navigate('/create')}
                    className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.97]"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    <Plus className="size-4" /> Create New Bill
                  </button>
                )}
              </div>
            )}

            {!isLoading && myBills.map(({ id, bill }) => (
              <BillCard key={id.toString()} billId={id} bill={bill} />
            ))}
          </div>

          {count > PAGE_SIZE && (
            <p className="mt-4 text-center text-xs" style={{ color: 'var(--subtle)' }}>
              Showing the {PAGE_SIZE} most recent bills.
            </p>
          )}
        </section>

        {/* ── Contract & Onchain Proof ──────────────────────────────────────── */}
        <ContractProof />

        {/* ── How It Works ─────────────────────────────────────────────────── */}
        <HowItWorks />

      </main>
    </ChainGuard>
  )
}
