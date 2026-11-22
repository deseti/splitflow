/**
 * SplitFlow contract ABI and typed hook wrappers.
 *
 * ABI is copied verbatim from the compiled Foundry artifact:
 *   contracts/out/SplitFlow.sol/SplitFlow.json
 *
 * USDC address and decimals are always read from @/onchain-facts, never hardcoded.
 * Contract address is read from the VITE_SPLITFLOW_CONTRACT_ADDRESS env var.
 */

import { getAddress } from 'viem'
import { getUsdc } from '@/onchain-facts'

// ─── Chain / token facts ────────────────────────────────────────────────────

export const ARC_MAINNET_CHAIN_ID = 5042 as const

const usdcFact = getUsdc(ARC_MAINNET_CHAIN_ID)
if (!usdcFact) throw new Error('USDC not found for Arc Mainnet (chain 5042) in onchain-facts')

/** ERC-20 USDC address on Arc Mainnet (6 decimals). */
export const USDC_ADDRESS = getAddress(usdcFact.address)

/** ERC-20 USDC decimal count on Arc Mainnet (always 6). */
export const USDC_DECIMALS = usdcFact.decimals

/**
 * SplitFlow contract address — set VITE_SPLITFLOW_CONTRACT_ADDRESS after deploy.
 * The UI renders a "contract not yet deployed" warning when this is absent.
 */
export const SPLITFLOW_ADDRESS: `0x${string}` | undefined = (() => {
  const raw: unknown = import.meta.env.VITE_SPLITFLOW_CONTRACT_ADDRESS
  if (typeof raw !== 'string' || !raw) return undefined
  return getAddress(raw)
})()

// ─── BillState enum (mirrors Solidity BillState) ────────────────────────────

export enum BillState {
  OPEN = 0,
  FUNDED = 1,
  SETTLED = 2,
  REFUNDABLE = 3,
  CANCELLED = 4,
}

// ─── Bill struct (mirrors Solidity Bill) ────────────────────────────────────

export interface BillData {
  title: string
  creator: `0x${string}`
  recipient: `0x${string}`
  totalAmount: bigint
  deadline: bigint
  settleDeadline: bigint
  payerCount: number
  settled: boolean
  cancelled: boolean
  depositCount: bigint
  payers: readonly [`0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`, `0x${string}`]
  shares: readonly [bigint, bigint, bigint, bigint, bigint]
  deposited: readonly [bigint, bigint, bigint, bigint, bigint]
}

// ─── State derivation (mirrors _isRefundable + getBillState in Solidity) ────

/**
 * Derive the current BillState from a BillData struct and the current timestamp.
 * Must use the exact same boundary operators as the Solidity contract:
 *   deposit < deadline
 *   underfunded REFUNDABLE >= deadline
 *   settle <= settleDeadline
 *   funded REFUNDABLE > settleDeadline
 */
export function deriveBillState(bill: BillData, nowSec: number): BillState {
  if (bill.cancelled) return BillState.CANCELLED
  if (bill.settled) return BillState.SETTLED

  const fullyFunded = bill.depositCount >= BigInt(bill.payerCount)
  const now = BigInt(Math.floor(nowSec))

  // Case A: underfunded past funding deadline
  if (!fullyFunded && now >= bill.deadline) return BillState.REFUNDABLE
  // Case B: funded but settlement grace period expired
  if (fullyFunded && now > bill.settleDeadline) return BillState.REFUNDABLE
  if (fullyFunded) return BillState.FUNDED
  return BillState.OPEN
}

/** True when deposits are permitted (block.timestamp < deadline). */
export function canDeposit(bill: BillData, nowSec: number): boolean {
  if (bill.cancelled || bill.settled) return false
  return BigInt(Math.floor(nowSec)) < bill.deadline
}

/** True when settlement is permitted (fully funded AND now <= settleDeadline). */
export function canSettle(bill: BillData, nowSec: number): boolean {
  if (bill.settled || bill.cancelled) return false
  const fullyFunded = bill.depositCount >= BigInt(bill.payerCount)
  return fullyFunded && BigInt(Math.floor(nowSec)) <= bill.settleDeadline
}

/** True when refunds are available. */
export function canRefund(bill: BillData, nowSec: number): boolean {
  if (bill.settled || bill.cancelled) return false
  return deriveBillState(bill, nowSec) === BillState.REFUNDABLE
}

// ─── ABI ─────────────────────────────────────────────────────────────────────

export const SPLITFLOW_ABI = [
  {
    "type": "constructor",
    "inputs": [{ "name": "_usdc", "type": "address", "internalType": "address" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "GRACE_PERIOD",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_PAYERS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint8", "internalType": "uint8" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MIN_PAYERS",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint8", "internalType": "uint8" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "billCount",
    "inputs": [],
    "outputs": [{ "name": "", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelBill",
    "inputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "createBill",
    "inputs": [
      { "name": "title", "type": "string", "internalType": "string" },
      { "name": "recipient", "type": "address", "internalType": "address" },
      { "name": "totalAmount", "type": "uint256", "internalType": "uint256" },
      { "name": "payers", "type": "address[]", "internalType": "address[]" },
      { "name": "shares", "type": "uint256[]", "internalType": "uint256[]" },
      { "name": "deadline", "type": "uint256", "internalType": "uint256" }
    ],
    "outputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "deposit",
    "inputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "getBill",
    "inputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "internalType": "struct SplitFlow.Bill",
        "components": [
          { "name": "title", "type": "string", "internalType": "string" },
          { "name": "creator", "type": "address", "internalType": "address" },
          { "name": "recipient", "type": "address", "internalType": "address" },
          { "name": "totalAmount", "type": "uint256", "internalType": "uint256" },
          { "name": "deadline", "type": "uint256", "internalType": "uint256" },
          { "name": "settleDeadline", "type": "uint256", "internalType": "uint256" },
          { "name": "payerCount", "type": "uint8", "internalType": "uint8" },
          { "name": "settled", "type": "bool", "internalType": "bool" },
          { "name": "cancelled", "type": "bool", "internalType": "bool" },
          { "name": "depositCount", "type": "uint256", "internalType": "uint256" },
          { "name": "payers", "type": "address[5]", "internalType": "address[5]" },
          { "name": "shares", "type": "uint256[5]", "internalType": "uint256[5]" },
          { "name": "deposited", "type": "uint256[5]", "internalType": "uint256[5]" }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getBillState",
    "inputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "uint8", "internalType": "enum SplitFlow.BillState" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getMySlot",
    "inputs": [
      { "name": "billId", "type": "uint256", "internalType": "uint256" },
      { "name": "addr", "type": "address", "internalType": "address" }
    ],
    "outputs": [
      { "name": "slot", "type": "uint8", "internalType": "uint8" },
      { "name": "hasDeposited", "type": "bool", "internalType": "bool" }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isRefundable",
    "inputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [{ "name": "", "type": "bool", "internalType": "bool" }],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "refund",
    "inputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "settleBill",
    "inputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "usdc",
    "inputs": [],
    "outputs": [{ "name": "", "type": "address", "internalType": "contract IERC20" }],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "BillCancelled",
    "inputs": [
      { "name": "billId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "creator", "type": "address", "indexed": true, "internalType": "address" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BillCreated",
    "inputs": [
      { "name": "billId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "creator", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "recipient", "type": "address", "indexed": false, "internalType": "address" },
      { "name": "totalAmount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "deadline", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "settleDeadline", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BillFunded",
    "inputs": [
      { "name": "billId", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "BillSettled",
    "inputs": [
      { "name": "billId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "recipient", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Deposited",
    "inputs": [
      { "name": "billId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "payer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" },
      { "name": "slotIndex", "type": "uint256", "indexed": true, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Refunded",
    "inputs": [
      { "name": "billId", "type": "uint256", "indexed": true, "internalType": "uint256" },
      { "name": "payer", "type": "address", "indexed": true, "internalType": "address" },
      { "name": "amount", "type": "uint256", "indexed": false, "internalType": "uint256" }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AlreadyCancelled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadyDeposited",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AlreadySettled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "BillDoesNotExist",
    "inputs": [{ "name": "billId", "type": "uint256", "internalType": "uint256" }]
  },
  {
    "type": "error",
    "name": "BillIsCancelled",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DeadlinePassed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DepositsAlreadyMade",
    "inputs": []
  },
  {
    "type": "error",
    "name": "DuplicatePayer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidDeadline",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidPayerCount",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotAPayer",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotCreator",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotFullyFunded",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotRefundable",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NothingToRefund",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SettleDeadlinePassed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ShareSumMismatch",
    "inputs": [
      { "name": "provided", "type": "uint256", "internalType": "uint256" },
      { "name": "expected", "type": "uint256", "internalType": "uint256" }
    ]
  },
  {
    "type": "error",
    "name": "ZeroAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ZeroAmount",
    "inputs": []
  }
] as const
