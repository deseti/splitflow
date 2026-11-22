/**
 * Shared utility helpers for SplitFlow.
 *
 * USDC amounts are always handled as bigint (integer 6-decimal units).
 * Never use floating-point arithmetic on USDC amounts.
 */

import { formatUnits, parseUnits, isAddress, getAddress } from 'viem'
import { USDC_DECIMALS } from './splitflow'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_MAINNET_CHAIN_ID } from './splitflow'

// ─── USDC formatting ─────────────────────────────────────────────────────────

/**
 * Format a bigint USDC amount (6 decimals) to a human-readable string.
 * e.g. 50_000_000n → "50.00"
 */
export function formatUsdc(amount: bigint): string {
  return parseFloat(formatUnits(amount, USDC_DECIMALS)).toFixed(2)
}

/**
 * Parse a human-readable USDC string to bigint integer units.
 * e.g. "50.00" → 50_000_000n
 * Returns null if the input is not a valid USDC amount.
 */
export function parseUsdcInput(input: string): bigint | null {
  const trimmed = input.trim()
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return null
  if (trimmed === '' || trimmed === '.') return null
  try {
    const parsed = parseUnits(trimmed, USDC_DECIMALS)
    return parsed > 0n ? parsed : null
  } catch {
    return null
  }
}

// ─── Address formatting ───────────────────────────────────────────────────────

/** Shorten a hex address to "0x1234…abcd" format. */
export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

/** Return a checksummed address or null if invalid. */
export function parseAddress(input: string): `0x${string}` | null {
  const trimmed = input.trim()
  if (!isAddress(trimmed)) return null
  try {
    return getAddress(trimmed)
  } catch {
    return null
  }
}

// ─── Date / time ─────────────────────────────────────────────────────────────

/** Format a Unix timestamp (seconds) as a locale date string. */
export function formatDate(ts: bigint | number): string {
  const ms = typeof ts === 'bigint' ? Number(ts) * 1000 : ts * 1000
  return new Date(ms).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Format a countdown from a given nowMs to a future timestamp.
 * Callers must pass nowSec * 1000 from useLiveNow() — never call Date.now() here.
 */
export function formatCountdown(tsSec: bigint, nowMs: number): string {
  const diffMs = Number(tsSec) * 1000 - nowMs
  if (diffMs <= 0) return 'Expired'
  const days = Math.floor(diffMs / 86_400_000)
  const hours = Math.floor((diffMs % 86_400_000) / 3_600_000)
  if (days > 0) return `${days}d ${hours}h`
  const mins = Math.floor((diffMs % 3_600_000) / 60_000)
  return `${hours}h ${mins}m`
}

// ─── Explorer URLs ────────────────────────────────────────────────────────────

/** Arc Explorer transaction URL. */
export function txUrl(hash: `0x${string}`): string {
  return buildTxExplorerUrl(ARC_MAINNET_CHAIN_ID, hash)
}

// ─── Error parsing ────────────────────────────────────────────────────────────

const REVERT_MESSAGES: Record<string, string> = {
  AlreadyCancelled: 'This bill has already been cancelled.',
  AlreadyDeposited: 'You have already deposited your share.',
  AlreadySettled: 'This bill has already been settled.',
  BillIsCancelled: 'This bill has been cancelled.',
  DeadlinePassed: 'The deposit deadline has passed.',
  DepositsAlreadyMade: 'Deposits have been made — this bill cannot be cancelled.',
  DuplicatePayer: 'Duplicate payer address found.',
  InvalidDeadline: 'Deadline must be in the future.',
  InvalidPayerCount: 'A bill requires 2–5 unique payers.',
  NotAPayer: 'Your wallet is not assigned to this bill.',
  NotCreator: 'Only the creator can perform this action.',
  NotFullyFunded: 'Bill is not fully funded yet.',
  NotRefundable: 'Refunds are not available yet.',
  NothingToRefund: 'You have no funds to refund on this bill.',
  SettleDeadlinePassed: 'The settlement window has closed. Refunds are now available.',
  ShareSumMismatch: 'The sum of shares does not match the total amount.',
  ZeroAddress: 'An address cannot be the zero address.',
  ZeroAmount: 'Amount must be greater than zero.',
  BillDoesNotExist: 'Bill not found.',
}

export function parseOnchainError(error: unknown): string {
  const msg = (error as Error)?.message ?? ''
  if (msg.toLowerCase().includes('user rejected') || (error as { code?: number })?.code === 4001) {
    return 'Transaction cancelled.'
  }
  for (const [key, value] of Object.entries(REVERT_MESSAGES)) {
    if (msg.includes(key)) return value
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
    return 'Insufficient USDC balance. Make sure you have approved enough and have enough balance.'
  }
  if (msg.includes('network') || msg.includes('timeout')) {
    return 'Network error. Please check your connection and try again.'
  }
  if (msg.includes('reverted')) {
    return 'Transaction failed. Please try again.'
  }
  return 'Something went wrong. Please try again.'
}
