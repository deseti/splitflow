/**
 * Claim refund — available when bill is REFUNDABLE and caller has a deposit.
 * Success fires after useWaitForTransactionReceipt confirms — never on wallet sign.
 */

import { useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { Loader2, ExternalLink, CheckCircle2, CornerDownLeft } from 'lucide-react'
import { SPLITFLOW_ABI, SPLITFLOW_ADDRESS, ARC_MAINNET_CHAIN_ID } from '@/lib/splitflow'
import { formatUsdc, txUrl, parseOnchainError } from '@/lib/utils'

interface Props {
  billId: bigint
  depositedAmount: bigint
  onSuccess?: () => void
}

export function RefundButton({ billId, depositedAmount, onSuccess }: Props) {
  const { chainId } = useAccount()
  const wrongChain = chainId !== ARC_MAINNET_CHAIN_ID

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      toast.success(`${formatUsdc(depositedAmount)} USDC refunded!`)
      onSuccess?.()
    }
  }, [isSuccess, onSuccess, depositedAmount])

  if (!SPLITFLOW_ADDRESS) return null

  if (isSuccess) {
    return (
      <div
        className="rounded-2xl p-5 flex flex-col items-center gap-3 text-center"
        style={{ background: 'var(--success-dim)', border: '1px solid var(--success-border)' }}
      >
        <CheckCircle2 className="size-7" style={{ color: 'var(--success)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--success)' }}>
            {formatUsdc(depositedAmount)} USDC refunded!
          </p>
          {hash && (
            <a
              href={txUrl(hash)}
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
    <div className="flex flex-col gap-3">
      <div
        className="rounded-2xl px-4 py-3 flex items-center justify-between"
        style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger-border)' }}
      >
        <p className="text-xs text-pretty" style={{ color: 'var(--danger)' }}>
          You will receive{' '}
          <strong className="font-semibold tabular-nums">{formatUsdc(depositedAmount)} USDC</strong>{' '}
          back to your wallet. Note: refunds may fail if your address is restricted by Circle.
        </p>
      </div>
      <button
        disabled={wrongChain || isPending || isConfirming}
        onClick={() =>
          writeContract(
            {
              address: SPLITFLOW_ADDRESS!,
              abi: SPLITFLOW_ABI,
              functionName: 'refund',
              args: [billId],
              chainId: ARC_MAINNET_CHAIN_ID,
            },
            { onError: (err) => toast.error(parseOnchainError(err)) },
          )
        }
        className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        style={{
          background: 'transparent',
          color: 'var(--danger)',
          border: '1px solid var(--danger-border)',
        }}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
          </>
        ) : isConfirming ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Refunding…
          </>
        ) : (
          <>
            <CornerDownLeft className="size-4" />
            Claim Refund — {formatUsdc(depositedAmount)} USDC
          </>
        )}
      </button>
    </div>
  )
}
