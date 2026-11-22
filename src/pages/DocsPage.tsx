import { ExternalLink, FileText, Shield, Zap, Users, Clock, ArrowRight, CheckCircle2 } from 'lucide-react'
import { SPLITFLOW_ADDRESS, USDC_ADDRESS } from '@/lib/splitflow'
import { shortAddr } from '@/lib/utils'

const CONTRACT_ADDRESS = '0xf28Ee372004dfEb66e54a014E437fbd196d79bB6'
const EXPLORER_URL = `https://explorer.arc.io/address/${CONTRACT_ADDRESS}?tab=contract`
const DEMO_BILL_URL = '/bill/0'

// ── Reusable section heading ──────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="display text-xl font-bold mt-12 mb-4 first:mt-0"
      style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
    >
      {children}
    </h2>
  )
}

// ── Reusable info row ─────────────────────────────────────────────────────────
function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="flex items-center justify-between gap-4 py-2.5 text-sm"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span
        className={mono ? 'mono tabular-nums text-xs' : 'font-medium tabular-nums'}
        style={{ color: 'var(--ink)' }}
      >
        {value}
      </span>
    </div>
  )
}

// ── Bill state pill ───────────────────────────────────────────────────────────
function StatePill({
  label,
  color,
}: {
  label: string
  color: 'accent' | 'success' | 'danger' | 'muted' | 'warning'
}) {
  const palette: Record<string, { bg: string; text: string; border: string }> = {
    accent:  { bg: 'var(--accent-dim)',   text: 'var(--accent-hover)', border: 'var(--accent-border)' },
    success: { bg: 'rgba(34,201,160,0.10)', text: 'var(--success)',   border: 'rgba(34,201,160,0.25)' },
    danger:  { bg: 'rgba(248,113,113,0.10)', text: 'var(--danger)',   border: 'rgba(248,113,113,0.25)' },
    muted:   { bg: 'rgba(100,116,139,0.10)', text: 'var(--subtle)',   border: 'rgba(100,116,139,0.20)' },
    warning: { bg: 'rgba(251,191,36,0.10)',  text: '#D4A017',         border: 'rgba(251,191,36,0.20)' },
  }
  const c = palette[color]
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {label}
    </span>
  )
}

export function DocsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 sm:px-6 py-10 pb-20">

      {/* ── Page title ──────────────────────────────────────────────────────── */}
      <div className="mb-10">
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 mb-4 text-xs font-semibold uppercase"
          style={{
            background: 'var(--accent-dim)',
            color: 'var(--accent-hover)',
            border: '1px solid var(--accent-border)',
            letterSpacing: '0.07em',
          }}
        >
          <FileText className="size-3" />
          Documentation
        </div>
        <h1
          className="display text-3xl sm:text-4xl font-bold text-balance mb-3"
          style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}
        >
          SplitFlow Docs
        </h1>
        <p className="text-base text-pretty" style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
          Everything you need to create, fund, and settle shared USDC bills onchain.
        </p>
      </div>

      {/* ── What is SplitFlow ────────────────────────────────────────────────── */}
      <SectionHeading>What is SplitFlow?</SectionHeading>
      <p className="text-sm leading-relaxed text-pretty mb-4" style={{ color: 'var(--muted)' }}>
        SplitFlow is a non-custodial shared bill escrow on Arc Mainnet. It lets a group of 2–5
        participants pool exact USDC contributions into a smart contract, then release the total
        to a designated recipient once every participant has paid — or reclaim individual
        contributions if the bill expires unfunded.
      </p>
      <p className="text-sm leading-relaxed text-pretty" style={{ color: 'var(--muted)' }}>
        There is no trusted intermediary. No one holds your funds except the smart contract,
        and the contract can only move funds to the pre-specified recipient or back to depositors.
        No administrator can withdraw funds.
      </p>

      {/* ── Use cases ────────────────────────────────────────────────────────── */}
      <SectionHeading>Real-World Use Cases</SectionHeading>
      <ul className="space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
        {[
          'Group dinners — split the total and let each person pay their share directly to the restaurant',
          'Shared subscriptions — pool contributions before the renewal date',
          'Team purchases — collect exact amounts from each contributor before buying',
          'Freelance group projects — pay a contractor once all clients have contributed',
          'Event expenses — escrow contributions until the event vendor is paid',
        ].map(item => (
          <li key={item} className="flex items-start gap-2 leading-relaxed">
            <CheckCircle2 className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
            {item}
          </li>
        ))}
      </ul>

      {/* ── How to create a bill ─────────────────────────────────────────────── */}
      <SectionHeading>How to Create a Shared Bill</SectionHeading>
      <ol className="space-y-4 text-sm" style={{ color: 'var(--muted)' }}>
        {[
          {
            n: '1',
            title: 'Connect your wallet',
            body: 'Connect a wallet on Arc Mainnet (chain ID 5042) using the button in the top navigation. SplitFlow uses Reown AppKit and supports MetaMask, WalletConnect-compatible wallets, and Coinbase Wallet.',
          },
          {
            n: '2',
            title: 'Fill in the bill details',
            body: 'Enter a title, the recipient wallet address, the total USDC amount, and a funding deadline. The deadline is when payers must complete deposits — not when the bill is settled.',
          },
          {
            n: '3',
            title: 'Add payers and assign shares',
            body: 'Add 2–5 payer wallet addresses. Assign each payer an exact USDC share. The sum of all shares must equal the total amount exactly. Use the "Equal split" button to distribute evenly.',
          },
          {
            n: '4',
            title: 'Confirm the transaction',
            body: 'Click "Create Bill" and confirm the transaction in your wallet. The bill is immediately live onchain. Share the bill URL with participants.',
          },
        ].map(step => (
          <li key={step.n} className="flex gap-3">
            <span
              className="display flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: 'var(--accent-dim)', color: 'var(--accent)', border: '1px solid var(--accent-border)' }}
            >
              {step.n}
            </span>
            <div>
              <p className="font-semibold mb-0.5" style={{ color: 'var(--ink)' }}>{step.title}</p>
              <p className="leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* ── USDC approval + deposit ──────────────────────────────────────────── */}
      <SectionHeading>USDC Approval and Deposits</SectionHeading>
      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--muted)' }}>
        Before depositing, each payer must approve the SplitFlow contract to spend their USDC.
        This is a standard ERC-20 approval — it authorises the contract to pull exactly the payer's
        assigned share. The approval does not transfer funds; only the subsequent <code
          className="mono text-xs rounded px-1.5 py-0.5"
          style={{ background: 'var(--surface-muted)', color: 'var(--accent-hover)' }}
        >deposit()</code> call does.
      </p>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        The Bill Detail page guides each payer through this two-step flow: approve, then deposit.
        Once a payer's slot is filled, it cannot be changed or overridden.
      </p>

      {/* ── Why escrow ───────────────────────────────────────────────────────── */}
      <SectionHeading>Why Are Funds Held in Escrow?</SectionHeading>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        The smart contract holds all deposits until either (a) all payers have deposited and
        anyone calls <code className="mono text-xs rounded px-1 py-0.5" style={{ background: 'var(--surface-muted)', color: 'var(--accent-hover)' }}>settleBill()</code>,
        or (b) the bill becomes refundable. This escrow model means:
      </p>
      <ul className="mt-3 space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
        <li className="flex items-start gap-2">
          <Zap className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          No participant can receive the funds early or divert them to a different address.
        </li>
        <li className="flex items-start gap-2">
          <Shield className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
          No administrator can withdraw on behalf of participants.
        </li>
        <li className="flex items-start gap-2">
          <Users className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--muted)' }} />
          If one payer never pays, no one is stuck — depositors can reclaim funds after the deadline.
        </li>
      </ul>

      {/* ── Settlement ───────────────────────────────────────────────────────── */}
      <SectionHeading>Settlement</SectionHeading>
      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--muted)' }}>
        Settlement transfers the full bill amount from the contract to the designated recipient.
        It can be triggered by <strong style={{ color: 'var(--ink)' }}>anyone</strong> — not just the
        creator — once both conditions are met:
      </p>
      <ul className="space-y-1.5 text-sm mb-3" style={{ color: 'var(--muted)' }}>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 shrink-0" style={{ color: 'var(--success)' }} />
          All assigned payers have deposited their full shares.
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="size-3.5 shrink-0" style={{ color: 'var(--success)' }} />
          The current time is at or before the settlement grace period deadline.
        </li>
      </ul>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        Settlement is a single transaction. No ERC-20 approval is required from the settler.
      </p>

      {/* ── Seven-day grace period ───────────────────────────────────────────── */}
      <SectionHeading>Seven-Day Settlement Grace Period</SectionHeading>
      <div
        className="rounded-xl p-4 mb-4 flex gap-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <Clock className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
        <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--ink)' }}>Settlement deadline = funding deadline + 7 days.</strong>
          {' '}A fully funded bill can be settled at any point up to and including this deadline.
          After the settlement deadline passes, settlement is permanently disabled and the bill
          becomes refundable — protecting depositors from a permanently locked state.
        </p>
      </div>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        This separation matters: the funding deadline controls when deposits close; the settlement
        deadline gives the group a 7-day window to finalise payment after everyone has deposited.
      </p>

      {/* ── Refunds ──────────────────────────────────────────────────────────── */}
      <SectionHeading>Refunds</SectionHeading>
      <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--muted)' }}>
        Depositors can reclaim their individual contributions when a bill is in the
        <strong style={{ color: 'var(--ink)' }}> REFUNDABLE</strong> state. This state is reached in two ways:
      </p>
      <ul className="space-y-2 text-sm mb-3" style={{ color: 'var(--muted)' }}>
        <li className="flex items-start gap-2">
          <ArrowRight className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
          <span><strong style={{ color: 'var(--ink)' }}>Underfunded expiry:</strong> the funding deadline has passed and the bill was not fully funded.</span>
        </li>
        <li className="flex items-start gap-2">
          <ArrowRight className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
          <span><strong style={{ color: 'var(--ink)' }}>Settlement expiry:</strong> the bill was fully funded but was not settled before the settlement grace period deadline.</span>
        </li>
      </ul>
      <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
        Each depositor claims their own refund individually. Only payers who actually deposited can
        refund. Non-depositors have nothing to claim. Once a payer has refunded, they cannot refund again.
        If a bill is already settled, refunds are permanently disabled.
      </p>

      {/* ── Bill states ──────────────────────────────────────────────────────── */}
      <SectionHeading>Bill States</SectionHeading>
      <div className="space-y-3">
        {[
          {
            pill: <StatePill label="OPEN" color="accent" />,
            desc: 'The bill has been created. Deposits are accepted until the funding deadline. The bill can be cancelled by the creator if no deposits have ever occurred.',
          },
          {
            pill: <StatePill label="FUNDED" color="success" />,
            desc: 'All assigned payers have deposited their full shares. Settlement is available until the settlement grace period deadline (funding deadline + 7 days).',
          },
          {
            pill: <StatePill label="SETTLED" color="success" />,
            desc: 'The full amount has been transferred to the recipient. This is a terminal state — no further deposits, refunds, or settlements are possible.',
          },
          {
            pill: <StatePill label="REFUNDABLE" color="danger" />,
            desc: 'Either the bill expired underfunded (timestamp ≥ funding deadline), or it was fully funded but not settled within the grace period (timestamp > settlement deadline). Depositors can reclaim their contributions. Settlement is permanently disabled.',
          },
          {
            pill: <StatePill label="CANCELLED" color="muted" />,
            desc: 'The creator cancelled the bill before any deposit was ever made. Deposits and settlement are permanently disabled.',
          },
        ].map(({ pill, desc }, i) => (
          <div
            key={i}
            className="rounded-xl p-4 flex gap-3 items-start"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div className="shrink-0 pt-0.5">{pill}</div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* ── Constraints ──────────────────────────────────────────────────────── */}
      <SectionHeading>Payer Limit and Constraints</SectionHeading>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div style={{ background: 'var(--surface)' }}>
          <InfoRow label="Minimum payers" value="2" />
          <InfoRow label="Maximum payers" value="5" />
          <InfoRow label="Payer shares" value="Exact — no partial fills" />
          <InfoRow label="Deposit deadline" value="Must complete before funding deadline" />
          <InfoRow label="Settlement window" value="From full funding until settlement deadline" />
          <InfoRow label="Grace period" value="7 days after the funding deadline" />
          <InfoRow label="Cancellation" value="Creator only, before any deposit has ever occurred" />
          <InfoRow label="Bill immutability" value="Configuration is fixed after creation" />
        </div>
      </div>

      {/* ── Network + USDC ───────────────────────────────────────────────────── */}
      <SectionHeading>Arc Mainnet and USDC</SectionHeading>
      <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--muted)' }}>
        SplitFlow operates exclusively on Arc Mainnet. All deposits, settlements, and refunds use
        USDC — the same asset that serves as Arc's native gas token. There is no ETH or other
        gas token involved.
      </p>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: '1px solid var(--border)' }}
      >
        <div style={{ background: 'var(--surface)' }}>
          <InfoRow label="Network" value="Arc Mainnet" />
          <InfoRow label="Chain ID" value="5042" />
          <InfoRow label="RPC" value="https://rpc.mainnet.arc.io" />
          <InfoRow label="USDC address" value={shortAddr(USDC_ADDRESS)} mono />
          <InfoRow label="USDC decimals" value="6" />
          <InfoRow label="Explorer" value="explorer.arc.io" />
        </div>
      </div>

      {/* ── Contract + verification ──────────────────────────────────────────── */}
      <SectionHeading>Contract Address and Verification</SectionHeading>
      <div
        className="rounded-xl overflow-hidden mb-4"
        style={{ border: '1px solid var(--border)' }}
      >
        <div style={{ background: 'var(--surface)' }}>
          <InfoRow label="Contract address" value={shortAddr(SPLITFLOW_ADDRESS ?? CONTRACT_ADDRESS)} mono />
          <InfoRow label="Verification" value="Exact Match" />
          <InfoRow label="Compiler" value="Solidity 0.8.28, paris EVM" />
          <InfoRow label="Optimizer" value="Enabled — 200 runs" />
          <InfoRow label="Deployment tool" value="Remix IDE + MetaMask" />
        </div>
      </div>
      <a
        href={EXPLORER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-90"
        style={{ background: 'var(--accent)', color: '#fff' }}
      >
        <ExternalLink className="size-4" />
        View verified contract on Arc Explorer
      </a>

      {/* ── Security + limitations ───────────────────────────────────────────── */}
      <SectionHeading>Security Testing and Known Limitations</SectionHeading>
      <p className="text-sm leading-relaxed mb-4" style={{ color: 'var(--muted)' }}>
        The contract was reviewed using automated static analysis (Slither) and a structured
        rule-corpus security review. Two Medium-severity findings were identified and fixed
        before deployment. The contract was then tested with 43 Foundry tests — unit, fuzz
        (256 runs each), and stateful invariant (128,000 calls each) — all passing.
      </p>
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.18)' }}
      >
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--danger)' }}>
          Important limitations
        </p>
        <ul className="space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
          <li className="flex items-start gap-2 leading-relaxed">
            <ArrowRight className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <span><strong style={{ color: 'var(--ink)' }}>No independent audit.</strong> Automated review only. Do not use for high-value transactions without professional review.</span>
          </li>
          <li className="flex items-start gap-2 leading-relaxed">
            <ArrowRight className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <span><strong style={{ color: 'var(--ink)' }}>USDC blacklisting.</strong> If the recipient is blacklisted by Circle, settlement reverts. The grace period expiry opens the REFUNDABLE escape hatch.</span>
          </li>
          <li className="flex items-start gap-2 leading-relaxed">
            <ArrowRight className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <span><strong style={{ color: 'var(--ink)' }}>Blacklisted depositor.</strong> If a depositor is blacklisted after depositing, their refund transaction will revert. No recovery path exists without an admin function (excluded by design).</span>
          </li>
          <li className="flex items-start gap-2 leading-relaxed">
            <ArrowRight className="size-3.5 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            <span><strong style={{ color: 'var(--ink)' }}>Immutable bill configuration.</strong> Payers, shares, recipient, and deadline cannot be changed after creation.</span>
          </li>
        </ul>
      </div>

      {/* ── Live demo ────────────────────────────────────────────────────────── */}
      <SectionHeading>Live Mainnet Demo</SectionHeading>
      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <CheckCircle2 className="size-5 shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
        <div className="min-w-0">
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>
            Bill #0 — 0.20 USDC, 2 payers, SETTLED
          </p>
          <p className="text-sm mb-3" style={{ color: 'var(--muted)' }}>
            A real USDC shared-bill payment was completed on Arc Mainnet as a public demonstration.
            Both payers deposited their shares; the bill was then settled to the recipient in a
            single transaction.
          </p>
          <a
            href={DEMO_BILL_URL}
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--accent-hover)' }}
          >
            View Bill #0 <ArrowRight className="size-3.5" />
          </a>
        </div>
      </div>

      {/* ── Links ────────────────────────────────────────────────────────────── */}
      <SectionHeading>Links</SectionHeading>
      <div className="space-y-2 text-sm">
        {[
          { label: 'Live app', href: 'https://splitflow.wizpay.xyz', external: true },
          { label: 'Verified contract', href: EXPLORER_URL, external: true },
          { label: 'GitHub repository', href: 'https://github.com/deseti/splitflow', external: true },
          { label: 'Create a bill', href: '/create', external: false },
          { label: 'Live demo bill', href: '/bill/0', external: false },
        ].map(({ label, href, external }) => (
          <a
            key={label}
            href={href}
            target={external ? '_blank' : undefined}
            rel={external ? 'noopener noreferrer' : undefined}
            className="flex items-center justify-between rounded-xl px-4 py-3 transition-all"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
          >
            <span className="font-medium">{label}</span>
            <ExternalLink className="size-3.5 opacity-40" />
          </a>
        ))}
      </div>
    </main>
  )
}
