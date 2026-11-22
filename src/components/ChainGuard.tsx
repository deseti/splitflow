import type { ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { AlertTriangle } from 'lucide-react'
import { ARC_MAINNET_CHAIN_ID } from '@/lib/splitflow'

interface Props {
  children: ReactNode
}

export function ChainGuard({ children }: Props) {
  const { isConnected, chainId } = useAccount()

  if (isConnected && chainId !== ARC_MAINNET_CHAIN_ID) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 flex flex-col items-center text-center gap-5">
        <div
          className="flex size-14 items-center justify-center rounded-2xl"
          style={{ background: 'var(--danger-dim)', border: '1px solid var(--danger-border)' }}
        >
          <AlertTriangle className="size-6" style={{ color: 'var(--danger)' }} />
        </div>
        <div>
          <h2 className="display text-lg font-bold" style={{ color: 'var(--ink)' }}>
            Wrong Network
          </h2>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--muted)' }}>
            SplitFlow runs on Arc Mainnet (chain ID 5042). Switch networks in your wallet to continue.
          </p>
        </div>
        <appkit-button />
      </div>
    )
  }

  return <>{children}</>
}
