import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, SplitSquareVertical } from 'lucide-react'
import { useAccount } from 'wagmi'
import { ARC_MAINNET_CHAIN_ID } from '@/lib/splitflow'

export function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isConnected, chainId } = useAccount()
  const onCreatePage = location.pathname === '/create'
  const wrongChain = isConnected && chainId !== ARC_MAINNET_CHAIN_ID

  return (
    <header
      className="sticky top-0 z-40 w-full"
      style={{
        background: 'rgba(9,13,22,0.92)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4 sm:px-6">

        {/* Logo */}
        <button
          onClick={() => void navigate('/')}
          className="flex items-center gap-2 transition-opacity hover:opacity-75"
          aria-label="SplitFlow home"
        >
          <div
            className="flex size-7 items-center justify-center rounded-lg"
            style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}
          >
            <SplitSquareVertical className="size-3.5" style={{ color: 'var(--accent)' }} />
          </div>
          <span
            className="display text-sm font-bold"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            SplitFlow
          </span>
        </button>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {wrongChain && (
            <span
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{
                background: 'var(--danger-dim)',
                color: 'var(--danger)',
                border: '1px solid var(--danger-border)',
              }}
            >
              <span className="size-1.5 rounded-full shrink-0" style={{ background: 'var(--danger)' }} />
              Wrong network
            </span>
          )}

          {!onCreatePage && isConnected && (
            <button
              onClick={() => void navigate('/create')}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              <Plus className="size-3.5" />
              <span>New Bill</span>
            </button>
          )}

          <appkit-button balance="hide" />
        </div>
      </div>
    </header>
  )
}
