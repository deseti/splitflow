/**
 * Reown AppKit provider for SplitFlow.
 *
 * Targets Arc Mainnet (chain ID 5042) exclusively.
 * WalletConnect Project ID is read from VITE_WALLETCONNECT_PROJECT_ID.
 * USDC address and RPC URLs are sourced from @/onchain-facts — never hardcoded.
 */

import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { defineChain } from 'viem'
import { requireChain } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID } from '@/lib/splitflow'
import type { ReactNode } from 'react'

// ── Arc Mainnet chain definition from onchain-facts ──────────────────────────
const arcFact = requireChain(ARC_MAINNET_CHAIN_ID)

export const arcMainnet = defineChain({
  id: arcFact.chainId,
  name: arcFact.name,
  nativeCurrency: {
    name: 'USD Coin',
    symbol: arcFact.nativeCurrency.symbol,
    decimals: arcFact.nativeCurrency.decimals,
  },
  rpcUrls: {
    default: { http: arcFact.rpcUrls as [string, ...string[]] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: arcFact.explorerBase },
  },
})

// ── WalletConnect Project ID ──────────────────────────────────────────────────
const projectId =
  (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ??
  'placeholder-set-VITE_WALLETCONNECT_PROJECT_ID'

// ── WagmiAdapter — single config used by both wagmi and AppKit ────────────────
export const wagmiAdapter = new WagmiAdapter({
  networks: [arcMainnet],
  projectId,
})

// ── AppKit singleton (call once at module load) ───────────────────────────────
// Use the current page origin as the metadata URL so Reown doesn't log a
// domain-mismatch warning in the preview environment.
const appUrl =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'https://splitflow.wizpay.xyz'

createAppKit({
  adapters: [wagmiAdapter],
  networks: [arcMainnet],
  projectId,
  metadata: {
    name: 'SplitFlow',
    description: 'Split bills. Fund together. Settle onchain.',
    url: appUrl,
    icons: [`${appUrl}/logo.png`],
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#8B5CF6',
    '--w3m-border-radius-master': '8px',
  },
})

// ── TanStack Query client ─────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 2 } },
})

// ── Provider component ────────────────────────────────────────────────────────
export function AppKitProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
