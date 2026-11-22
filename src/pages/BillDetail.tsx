import { useParams, useNavigate } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { useCallback, useState } from 'react'
import { useLiveNow } from '@/hooks/useLiveNow'
import { ArrowLeft, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react'
import {
  SPLITFLOW_ABI, SPLITFLOW_ADDRESS, ARC_MAINNET_CHAIN_ID,
  deriveBillState, canDeposit, canSettle, canRefund,
  BillState, type BillData,
} from '@/lib/splitflow'
import { formatUsdc, formatDate, shortAddr } from '@/lib/utils'
import { BillStateBadge } from '@/components/BillStateBadge'
import { PayerRow } from '@/components/PayerRow'
import { GracePeriodNotice } from '@/components/GracePeriodNotice'
import { DepositFlow } from '@/components/DepositFlow'
import { SettleButton } from '@/components/SettleButton'
import { RefundButton } from '@/components/RefundButton'
import { CancelButton } from '@/components/CancelButton'
import { EscrowWarning } from '@/components/EscrowWarning'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID as ARC_ID } from '@/lib/splitflow'

export function BillDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const [copied, setCopied] = useState(false)
  const nowSec = useLiveNow()

  const billId = id !== undefined ? BigInt(id) : undefined

  const { data: bill, isLoading, isError, refetch } = useReadContract({
    address: SPLITFLOW_ADDRESS,
    abi: SPLITFLOW_ABI,
    functionName: 'getBill',
    args: billId !== undefined ? [billId] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: {
      enabled: billId !== undefined && !!SPLITFLOW_ADDRESS,
      refetchInterval: 12_000,
    },
  }) as { data: BillData | undefined; isLoading: boolean; isError: boolean; refetch: () => void }

  const handleCopyUrl = useCallback(() => {
    void navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  // ── Contract not configured ────────────────────────────────────────────
  if (!SPLITFLOW_ADDRESS) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Contract not deployed yet.</p>
      </div>
    )
  }

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-3">
        <div className="skeleton h-52 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    )
  }

  // ── Error / not found ──────────────────────────────────────────────────
  if (isError || !bill || billId === undefined) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 text-center">
        <p className="text-sm" style={{ color: 'var(--danger)' }}>Bill not found.</p>
        <button
          onClick={() => void navigate('/')}
          className="mt-4 text-xs font-semibold"
          style={{ color: 'var(--accent-hover)' }}
        >
          Back to dashboard
        </button>
      </div>
    )
  }

  const state = deriveBillState(bill, nowSec)
  const isCreator = address?.toLowerCase() === bill.creator.toLowerCase()
  const canDepositable = canDeposit(bill, nowSec)
  const canSettleable = canSettle(bill, nowSec)
  const canRefundable = canRefund(bill, nowSec)

  const mySlot = address
    ? Array.from({ length: bill.payerCount }, (_, i) => i).find(
        i => bill.payers[i].toLowerCase() === address.toLowerCase(),
      )
    : undefined
  const myDeposited = mySlot !== undefined ? bill.deposited[mySlot] : 0n
  const myShare = mySlot !== undefined ? bill.shares[mySlot] : 0n
  const iAmPayer = mySlot !== undefined
  const iHaveDeposited = myDeposited > 0n
  const noDepositsEver = bill.depositCount === 0n

  const paidCount = Number(bill.depositCount)
  const pct = bill.payerCount > 0 ? Math.min(100, Math.round((paidCount / bill.payerCount) * 100)) : 0
  const progressColor =
    state === BillState.FUNDED || state === BillState.SETTLED
      ? 'var(--success)'
      : state === BillState.REFUNDABLE
      ? 'var(--danger)'
      : 'var(--accent)'

  const hasActions = (iAmPayer && !iHaveDeposited && canDepositable) ||
    canSettleable ||
    (canRefundable && iAmPayer && iHaveDeposited) ||
    (isCreator && state === BillState.OPEN && noDepositsEver)

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 pb-16">

      {/* Back */}
      <button
        onClick={() => void navigate('/')}
        className="flex items-center gap-1.5 text-sm mb-6 transition-opacity hover:opacity-70"
        style={{ color: 'var(--muted)' }}
      >
        <ArrowLeft className="size-4" />
        All bills
      </button>

      {/* ── Header card ──────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl p-5 sm:p-6 mb-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Title row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1
              className="display text-2xl font-bold"
              style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
            >
              {bill.title}
            </h1>
            <p className="text-xs mt-0.5 mono" style={{ color: 'var(--subtle)' }}>
              Bill #{id}
            </p>
          </div>
          <BillStateBadge state={state} />
        </div>

        {/* Amount hero */}
        <div className="mt-5 flex items-baseline gap-2">
          <span
            className="display text-4xl font-bold tabular-nums"
            style={{ color: 'var(--ink)' }}
          >
            {formatUsdc(bill.totalAmount)}
          </span>
          <span className="text-xl font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </div>

        {/* Progress */}
        <div className="mt-4">
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: progressColor }}
            />
          </div>
          <p className="mt-1.5 text-xs tabular-nums" style={{ color: 'var(--muted)' }}>
            {paidCount}/{bill.payerCount} payers funded
          </p>
        </div>

        {/* Meta grid */}
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4">
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: 'var(--subtle)' }}
            >
              Recipient
            </p>
            <a
              href={buildAddressExplorerUrl(ARC_ID, bill.recipient)}
              target="_blank"
              rel="noreferrer"
              className="mono text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
              style={{ color: 'var(--ink-2)' }}
            >
              {shortAddr(bill.recipient)}
              <ExternalLink className="size-2.5 shrink-0" />
            </a>
          </div>
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: 'var(--subtle)' }}
            >
              Creator
            </p>
            <span className="mono text-xs flex items-center gap-1.5" style={{ color: 'var(--ink-2)' }}>
              {shortAddr(bill.creator)}
              {isCreator && (
                <span
                  className="rounded-full px-1.5 py-px not-mono"
                  style={{
                    background: 'var(--accent-dim)',
                    color: 'var(--accent-hover)',
                    border: '1px solid var(--accent-border)',
                    fontSize: '10px',
                    fontWeight: 600,
                  }}
                >
                  You
                </span>
              )}
            </span>
          </div>
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: 'var(--subtle)' }}
            >
              Deposit deadline
            </p>
            <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
              {formatDate(bill.deadline)}
            </span>
          </div>
          <div>
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-1"
              style={{ color: 'var(--subtle)' }}
            >
              Settle by
            </p>
            <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
              {formatDate(bill.settleDeadline)}
            </span>
          </div>
        </div>

        {/* Share + refresh */}
        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={handleCopyUrl}
            className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: 'var(--muted)' }}
          >
            {copied
              ? <><Check className="size-3.5" style={{ color: 'var(--success)' }} /> Copied!</>
              : <><Copy className="size-3.5" /> Copy bill link</>
            }
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
            style={{ color: 'var(--subtle)' }}
            title="Refresh bill data"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      {/* ── Grace period / state notice ───────────────────────────────────── */}
      <div className="mb-4">
        <GracePeriodNotice state={state} settleDeadline={bill.settleDeadline} deadline={bill.deadline} />
      </div>

      {/* ── Payers ───────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl px-5 mb-4"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <h2
          className="text-xs font-semibold uppercase tracking-widest pt-5 pb-1"
          style={{ color: 'var(--subtle)' }}
        >
          Payers
        </h2>
        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
          {Array.from({ length: bill.payerCount }, (_, i) => (
            <PayerRow
              key={i}
              index={i}
              address={bill.payers[i]}
              share={bill.shares[i]}
              deposited={bill.deposited[i]}
              connectedAddress={address}
            />
          ))}
        </div>
        {/* Explorer link for contract */}
        {SPLITFLOW_ADDRESS && (
          <a
            href={`${buildAddressExplorerUrl(ARC_ID, SPLITFLOW_ADDRESS)}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs py-3 transition-opacity hover:opacity-70"
            style={{ color: 'var(--subtle)' }}
          >
            <ExternalLink className="size-3" />
            View escrow contract on Arc Explorer
          </a>
        )}
      </div>

      {/* ── Actions ──────────────────────────────────────────────────────── */}
      {isConnected ? (
        hasActions ? (
          <div
            className="rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <h2
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: 'var(--subtle)' }}
            >
              Actions
            </h2>

            {/* Deposit */}
            {iAmPayer && !iHaveDeposited && canDepositable && (
              <DepositFlow billId={billId} share={myShare} onSuccess={() => refetch()} />
            )}

            {/* Already deposited notice */}
            {iAmPayer && iHaveDeposited && state !== BillState.REFUNDABLE && (
              <div
                className="flex items-center gap-2 rounded-xl px-4 py-3"
                style={{ background: 'var(--success-dim)', border: '1px solid var(--success-border)' }}
              >
                <Check className="size-4" style={{ color: 'var(--success)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>
                  You have deposited your share.
                </p>
              </div>
            )}

            {/* Settle — permissionless */}
            {canSettleable && (
              <SettleButton billId={billId} onSuccess={() => refetch()} />
            )}

            {/* Refund */}
            {canRefundable && iAmPayer && iHaveDeposited && (
              <RefundButton billId={billId} depositedAmount={myDeposited} onSuccess={() => refetch()} />
            )}

            {/* Cancel */}
            {isCreator && state === BillState.OPEN && noDepositsEver && (
              <CancelButton billId={billId} onSuccess={() => refetch()} />
            )}
          </div>
        ) : (
          <div
            className="rounded-2xl p-5 text-center"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <p className="text-sm" style={{ color: 'var(--subtle)' }}>
              {state === BillState.SETTLED
                ? 'This bill has been settled.'
                : state === BillState.CANCELLED
                ? 'This bill has been cancelled.'
                : 'No actions available for your wallet on this bill.'}
            </p>
            {state === BillState.SETTLED && bill.totalAmount > 0n && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <span
                  className="display text-2xl font-bold tabular-nums"
                  style={{ color: 'var(--success)' }}
                >
                  {formatUsdc(bill.totalAmount)}
                </span>
                <span className="font-medium" style={{ color: 'var(--subtle)' }}>USDC sent</span>
              </div>
            )}
          </div>
        )
      ) : (
        <div
          className="rounded-2xl p-5 text-center"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            Connect your wallet to deposit, settle, or refund.
          </p>
          <div className="flex justify-center">
            <appkit-button />
          </div>
        </div>
      )}

      {/* Escrow warning — bottom */}
      <div className="mt-4">
        <EscrowWarning />
      </div>

      {/* Contract reference */}
      <div
        className="mt-6 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <span style={{ color: 'var(--muted)' }}>
          Contract{' '}
          <span className="mono" style={{ color: 'var(--ink)' }}>
            {shortAddr('0xf28Ee372004dfEb66e54a014E437fbd196d79bB6')}
          </span>
          {' '}· Arc Mainnet · USDC
        </span>
        <a
          href="https://explorer.arc.io/address/0xf28Ee372004dfEb66e54a014E437fbd196d79bB6?tab=contract"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium transition-opacity hover:opacity-70 shrink-0"
          style={{ color: 'var(--accent-hover)' }}
        >
          Explorer <ExternalLink className="size-3" />
        </a>
      </div>
    </main>
  )
}
