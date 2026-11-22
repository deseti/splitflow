/**
 * Permissionless settlement — no ERC-20 approval required.
 * Any connected wallet on Arc Mainnet can call settleBill().
 * Success fires after useWaitForTransactionReceipt confirms — never on wallet sign.
 */

import { useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { Loader2, ExternalLink, CheckCircle2, Send } from 'lucide-react'
import { SPLITFLOW_ABI, SPLITFLOW_ADDRESS, ARC_MAINNET_CHAIN_ID } from '@/lib/splitflow'
import { txUrl, parseOnchainError } from '@/lib/utils'

interface Props {
  billId: bigint
  onSuccess?: () => void
}

export function SettleButton({ billId, onSuccess }: Props) {
  const { chainId } = useAccount()
  const wrongChain = chainId !== ARC_MAINNET_CHAIN_ID

  const { writeContract, data: hash, isPending } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (isSuccess) {
      toast.success('Bill settled — funds sent to recipient!')
      onSuccess?.()
    }
  }, [isSuccess, onSuccess])

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
            Bill settled!
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
    <button
      disabled={wrongChain || isPending || isConfirming}
      onClick={() =>
        writeContract(
          {
            address: SPLITFLOW_ADDRESS!,
            abi: SPLITFLOW_ABI,
            functionName: 'settleBill',
            args: [billId],
            chainId: ARC_MAINNET_CHAIN_ID,
          },
          { onError: (err) => toast.error(parseOnchainError(err)) },
        )
      }
      className="w-full rounded-2xl py-3.5 text-sm font-semibold transition-all active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      style={{ background: 'var(--success)', color: '#fff' }}
    >
      {isPending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
        </>
      ) : isConfirming ? (
        <>
          <Loader2 className="size-4 animate-spin" /> Settling…
        </>
      ) : (
        <>
          <Send className="size-4" /> Settle Bill
        </>
      )}
    </button>
  )
}
