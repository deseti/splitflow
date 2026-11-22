/**
 * Two-step payer deposit:
 *   Step 1 — ERC-20 approve(SplitFlow, share)
 *   Step 2 — SplitFlow.deposit(billId)
 *
 * Step is derived from wagmi confirmation booleans — no explicit step state.
 * ERC-20 approval is required for deposits only; settlement needs no approval.
 * Success fires from useWaitForTransactionReceipt — never from wallet sign.
 */

import { useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { toast } from 'sonner'
import { Loader2, ExternalLink, CheckCircle2, ChevronRight } from 'lucide-react'
import { SPLITFLOW_ABI, SPLITFLOW_ADDRESS, USDC_ADDRESS, ARC_MAINNET_CHAIN_ID } from '@/lib/splitflow'
import { formatUsdc, txUrl, parseOnchainError } from '@/lib/utils'

interface Props {
  billId: bigint
  share: bigint
  onSuccess?: () => void
}

export function DepositFlow({ billId, share, onSuccess }: Props) {
  const { address, chainId } = useAccount()
  const wrongChain = chainId !== ARC_MAINNET_CHAIN_ID

  // ── Allowance check ─────────────────────────────────────────────────────
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && SPLITFLOW_ADDRESS ? [address, SPLITFLOW_ADDRESS] : undefined,
    chainId: ARC_MAINNET_CHAIN_ID,
    query: { enabled: !!address && !!SPLITFLOW_ADDRESS },
  })
  const isApproved = (allowance ?? 0n) >= share

  // ── Step 1: Approve ────────────────────────────────────────────────────
  const { writeContract: doApprove, data: approveHash, isPending: isApprovePending } = useWriteContract()
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash })

  useEffect(() => {
    if (isApproveConfirmed) {
      void refetchAllowance()
      toast.success('USDC approved — confirm your deposit now.')
    }
  }, [isApproveConfirmed, refetchAllowance])

  // ── Step 2: Deposit ────────────────────────────────────────────────────
  const { writeContract: doDeposit, data: depositHash, isPending: isDepositPending } = useWriteContract()
  const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositHash })

  useEffect(() => {
    if (isDepositConfirmed) {
      toast.success('Deposit confirmed!')
      onSuccess?.()
    }
  }, [isDepositConfirmed, onSuccess])

  if (!SPLITFLOW_ADDRESS) {
    return (
      <p className="text-xs text-center py-2" style={{ color: 'var(--danger)' }}>
        Contract not yet deployed.
      </p>
    )
  }

  // Derive visual step from wagmi state
  const showDepositButton = isApproved || isApproveConfirmed
  const stepLabel = showDepositButton ? 'Step 2 of 2' : 'Step 1 of 2'

  if (isDepositConfirmed) {
    return (
      <div
        className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
        style={{ background: 'var(--success-dim)', border: '1px solid var(--success-border)' }}
      >
        <CheckCircle2 className="size-8" style={{ color: 'var(--success)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            Deposit confirmed!
          </p>
          {depositHash && (
            <a
              href={txUrl(depositHash)}
              target="_blank"
              rel="noreferrer"
              className="mt-1.5 inline-flex items-center gap-1 text-xs"
              style={{ color: 'var(--accent-hover)' }}
            >
              View on Arc Explorer <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Share info */}
      <div
        className="rounded-2xl px-4 py-3 flex items-center justify-between"
        style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}
      >
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Your share</span>
        <span className="display text-lg font-bold tabular-nums" style={{ color: 'var(--ink)' }}>
          {formatUsdc(share)}{' '}
          <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
        </span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2].map(n => {
          const done = (n === 1 && showDepositButton) || (n === 2 && isDepositConfirmed)
          const active = (n === 1 && !showDepositButton) || (n === 2 && showDepositButton)
          return (
            <div key={n} className="flex items-center gap-1.5">
              <div
                className="flex size-5 items-center justify-center rounded-full text-xs font-bold"
                style={{
                  background: done ? 'var(--success-dim)' : active ? 'var(--accent-dim)' : 'var(--surface-muted)',
                  color: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--subtle)',
                  border: `1px solid ${done ? 'var(--success-border)' : active ? 'var(--accent-border)' : 'var(--border)'}`,
                }}
              >
                {done ? <CheckCircle2 className="size-3" /> : n}
              </div>
              <span className="text-xs" style={{ color: active ? 'var(--ink-2)' : 'var(--subtle)' }}>
                {n === 1 ? 'Approve' : 'Deposit'}
              </span>
              {n === 1 && <ChevronRight className="size-3" style={{ color: 'var(--subtle)' }} />}
            </div>
          )
        })}
        <span className="ml-auto text-xs" style={{ color: 'var(--subtle)' }}>{stepLabel}</span>
      </div>

      {/* Approve button */}
      {!showDepositButton && (
        <button
          disabled={wrongChain || isApprovePending || isApproveConfirming}
          onClick={() =>
            doApprove(
              {
                address: USDC_ADDRESS,
                abi: erc20Abi,
                functionName: 'approve',
                args: [SPLITFLOW_ADDRESS!, share],
                chainId: ARC_MAINNET_CHAIN_ID,
              },
              { onError: (err) => toast.error(parseOnchainError(err)) },
            )
          }
          className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {isApprovePending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
            </span>
          ) : isApproveConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Approving USDC…
            </span>
          ) : (
            `Allow ${formatUsdc(share)} USDC spend`
          )}
        </button>
      )}

      {/* Deposit button */}
      {showDepositButton && (
        <button
          disabled={wrongChain || isDepositPending || isDepositConfirming}
          onClick={() =>
            doDeposit(
              {
                address: SPLITFLOW_ADDRESS!,
                abi: SPLITFLOW_ABI,
                functionName: 'deposit',
                args: [billId],
                chainId: ARC_MAINNET_CHAIN_ID,
              },
              { onError: (err) => toast.error(parseOnchainError(err)) },
            )
          }
          className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          {isDepositPending ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
            </span>
          ) : isDepositConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Confirming deposit…
            </span>
          ) : (
            `Deposit ${formatUsdc(share)} USDC`
          )}
        </button>
      )}
    </div>
  )
}
