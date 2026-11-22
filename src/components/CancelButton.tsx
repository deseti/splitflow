/**
 * Creator-only bill cancellation — only available before any deposit has ever been made.
 * Success fires after useWaitForTransactionReceipt confirms — never on wallet sign.
 */

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { SPLITFLOW_ABI, SPLITFLOW_ADDRESS, ARC_MAINNET_CHAIN_ID } from '@/lib/splitflow'
import { parseOnchainError } from '@/lib/utils'

interface Props {
  billId: bigint
  onSuccess?: () => void
}

export function CancelButton({ billId, onSuccess }: Props) {
  const { chainId } = useAccount()
  const wrongChain = chainId !== ARC_MAINNET_CHAIN_ID
  const [confirming, setConfirming] = useState(false)

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      toast.success('Bill cancelled.')
      onSuccess?.()
    }
  }, [isSuccess, onSuccess])

  if (!SPLITFLOW_ADDRESS || isSuccess) return null

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-2 text-xs font-medium transition-opacity hover:opacity-70"
        style={{ color: 'var(--subtle)' }}
      >
        <Trash2 className="size-3.5" />
        Cancel bill
      </button>
    )
  }

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-4"
      style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger-border)' }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
            Cancel this bill?
          </p>
          <p className="text-xs mt-1 text-pretty" style={{ color: 'var(--muted)' }}>
            This permanently cancels the bill. No deposits can be made after cancellation.
            This action cannot be undone.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
          style={{
            background: 'var(--surface-strong)',
            color: 'var(--ink-2)',
            border: '1px solid var(--border)',
          }}
        >
          Keep bill
        </button>
        <button
          disabled={wrongChain || isPending || isConfirming}
          onClick={() =>
            writeContract(
              {
                address: SPLITFLOW_ADDRESS!,
                abi: SPLITFLOW_ABI,
                functionName: 'cancelBill',
                args: [billId],
                chainId: ARC_MAINNET_CHAIN_ID,
              },
              {
                onError: (err) => {
                  setConfirming(false)
                  toast.error(parseOnchainError(err))
                },
              },
            )
          }
          className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--danger)', color: '#fff' }}
        >
          {isPending || isConfirming ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="size-4 animate-spin" />
            </span>
          ) : (
            'Yes, cancel'
          )}
        </button>
      </div>
    </div>
  )
}
