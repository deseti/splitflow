# SplitFlow

**Split bills. Fund together. Settle onchain.**

SplitFlow is a non-custodial shared bill escrow built on Arc Mainnet. It lets 2–5 participants pool exact USDC shares into a smart contract, then settle the full amount to a designated recipient once everyone has paid — or reclaim individual contributions if the bill expires unfunded.

Live app: **[splitflow.wizpay.xyz](https://splitflow.wizpay.xyz)**  
Verified contract: [`0xf28Ee372004dfEb66e54a014E437fbd196d79bB6`](https://explorer.arc.io/address/0xf28Ee372004dfEb66e54a014E437fbd196d79bB6?tab=contract)

---

## The Problem

Splitting a shared expense — a group dinner, a shared subscription, a team purchase — typically requires trusting one person to collect money and pay the vendor. That person may forget, keep the funds, or find the recipient's payment method incompatible. There is no transparency and no enforcement.

SplitFlow replaces the trusted middleman with a smart contract. Each participant deposits their exact assigned share; the contract holds it in escrow and releases it to the recipient only when every share has been paid.

---

## How It Works

1. **Create a bill.** The creator sets a title, recipient address, total USDC amount, up to 5 payer addresses with exact share amounts, and a funding deadline.
2. **Each payer deposits their share.** Payers approve USDC spending for their assigned amount, then call `deposit()`. The contract validates the caller and accepts exactly the assigned amount.
3. **Automatic settlement on full funding.** When the final payer's deposit fills the last slot, the contract immediately transfers the full amount to the recipient in the same transaction — no separate settlement call needed. If that transfer fails (e.g., a blacklisted recipient), the final deposit reverts cleanly; no funds are stuck.
4. **Manual settlement fallback.** `settleBill()` remains available as a fallback for bills that were funded before this version deployed, or any edge case where auto-settlement did not complete. It reverts `AlreadySettled` if the bill was already auto-settled.
5. **Refunds.** If the bill expires underfunded (past the funding deadline), each depositor can individually reclaim their contribution via `refund()`.
6. **Cancellation.** The bill creator can cancel the bill before any deposit has ever been accepted.

---

## Key Features

| Feature | Detail |
|---|---|
| Non-custodial | No admin, no owner, no privileged withdrawal path |
| Exact share enforcement | Each payer deposits exactly their assigned amount — no partial fills |
| 5-state machine | OPEN → FUNDED → SETTLED or OPEN/FUNDED → REFUNDABLE; CANCELLED |
| Settlement grace period | 7 days after the funding deadline; prevents permanent lock-up |
| Persistent deposit tracking | `depositCount` never decreases; cancellation requires zero historical deposits |
| Permissionless settlement | Anyone can call `settleBill()` once the bill is fully funded |
| Arc Mainnet | USDC is the native gas token and the escrow asset; sub-second finality |

---

## Smart Contract Architecture

**Contract:** `SplitFlow.sol`  
**Network:** Arc Mainnet (chain ID 5042)  
**Address:** `0xf28Ee372004dfEb66e54a014E437fbd196d79bB6`  
**Verification:** Exact Match on Arc Explorer  
**Compiler:** Solidity 0.8.28, EVM Paris, optimizer 200 runs  
**Dependencies:** OpenZeppelin `SafeERC20`, `ReentrancyGuard`  
**Deployed via:** Remix IDE + MetaMask (user-controlled wallet; no private key in this repository)

### Bill Struct

```solidity
struct Bill {
    string  title;
    address creator;
    address recipient;
    uint256 totalAmount;      // 6-decimal USDC
    uint256 deadline;         // unix timestamp — funding must complete before this
    uint256 settleDeadline;   // deadline + GRACE_PERIOD (7 days)
    uint8   payerCount;       // 2–5
    bool    settled;
    bool    cancelled;
    uint256 depositCount;     // monotonically non-decreasing
    address[5] payers;
    uint256[5] shares;        // assigned share per slot
    uint256[5] deposited;     // 0 or exactly shares[i]
}
```

### State Machine

```
OPEN ──(creator, zero deposits)─────────────────────────────────→ CANCELLED
OPEN ──(all slots filled via deposit())─────────────────────────→ SETTLED  (auto-settle in same tx)
OPEN ──(timestamp >= deadline, underfunded)─────────────────────→ REFUNDABLE
SETTLED ←─ (also reachable via explicit settleBill() fallback if not auto-settled)
```

Note: the FUNDED state is transient — it exists only for the duration of the final `deposit()` call before auto-settlement fires. A bill observable externally is either OPEN (partially funded), SETTLED, REFUNDABLE, or CANCELLED.

### Function Reference

| Function | Caller | Guard |
|---|---|---|
| `createBill(title, recipient, totalAmount, payers[], shares[], deadline)` | Anyone | `sum(shares) == totalAmount`, 2–5 payers, future deadline |
| `deposit(billId)` | Assigned payer | `timestamp < deadline`, slot not filled, not cancelled/settled. Auto-settles if this is the last slot. |
| `settleBill(billId)` | Anyone | Fully funded, `timestamp <= settleDeadline`, not settled. Manual fallback — normally settlement is automatic. |
| `refund(billId)` | Depositor | `isRefundable()`, not settled, deposited[slot] > 0 |
| `cancelBill(billId)` | Creator | `depositCount == 0`, not already cancelled |
| `getBill(billId)` | View | — |
| `getBillState(billId)` | View | — |
| `getMySlot(billId, addr)` | View | — |
| `isRefundable(billId)` | View | — |

### Events

`BillCreated` · `Deposited` · `BillFunded` · `BillSettled` · `Refunded` · `BillCancelled`

### Security Properties

- `ReentrancyGuard` on all four mutating functions
- `SafeERC20` on all transfers
- Checks-effects-interactions throughout
- `deposited[slot]` zeroed before transfer in `refund()`
- `settled = true` set before `safeTransfer` in `settleBill()`
- No loop in `settleBill()` — single transfer to recipient
- `BillDoesNotExist` guard on all public bill-specific functions

### Known Limitations

- **No independent audit.** The contract was reviewed using automated static analysis (Slither) and a structured rule-corpus review at max depth, but has not undergone an independent professional security audit.
- **USDC blacklisting.** If the recipient address is blacklisted by Circle, `settleBill()` will revert. The 7-day grace period is the designed escape hatch: after `settleDeadline`, the bill becomes REFUNDABLE.
- **Blacklisted depositor.** If a depositor's address is blacklisted after depositing, their `refund()` will revert. Funds remain in escrow with no contract-level recovery path (no admin withdrawal exists by design).
- **Contract-level freeze.** If the contract address itself is frozen by Circle, all outgoing transfers fail for all bills.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Smart contract | Solidity 0.8.28, OpenZeppelin 5.1.0 |
| Testing | Foundry (forge test) |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| Wallet | Reown AppKit + Wagmi v2 + Viem |
| Network | Arc Mainnet (chain ID 5042) |
| Token | USDC (`0x3600000000000000000000000000000000000000`) |
| Hosting | Cloudflare Pages |
| Domain | splitflow.wizpay.xyz |

---

## Local Development

### Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- [Foundry](https://getfoundry.sh) (`forge`, `cast`)
- Node.js ≥ 18 (for tooling)

### Setup

```bash
git clone https://github.com/deseti/splitflow.git
cd splitflow
bun install
```

### Environment

Create a `.env` file at the project root:

```env
VITE_WALLETCONNECT_PROJECT_ID=<your_reown_project_id>
VITE_SPLITFLOW_CONTRACT_ADDRESS=0xf28Ee372004dfEb66e54a014E437fbd196d79bB6
```

Get a free WalletConnect / Reown project ID at [cloud.reown.com](https://cloud.reown.com).

### Run the dev server

```bash
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Run contract tests

```bash
cd contracts   # if running from repo root, foundry.toml is at root
forge test -vvv
```

All 43 tests should pass, including fuzz and stateful invariant tests.

### Production build

```bash
bun run build
```

Output goes to `dist/`.

---

## Deployment

The contract was deployed to Arc Mainnet using Remix IDE with a MetaMask-connected wallet. No private key was used inside this repository or Arc Studio.

**Deployed address:** `0xf28Ee372004dfEb66e54a014E437fbd196d79bB6`  
**Constructor argument:** `_usdc = 0x3600000000000000000000000000000000000000`  
**Explorer:** [View on Arc Explorer](https://explorer.arc.io/address/0xf28Ee372004dfEb66e54a014E437fbd196d79bB6?tab=contract)  
**Verification:** Exact Match (Solidity 0.8.28, paris EVM, optimizer 200 runs)

Full deployment details: [`docs/deploy/deployment-package.md`](docs/deploy/deployment-package.md)

---

## Testing

The contract test suite is at `contracts/test/SplitFlow.t.sol`.

| Test type | Count | Result |
|---|---|---|
| Unit tests | 44 | All pass |
| Fuzz tests | 2 (256 runs each) | All pass |
| Stateful invariant tests | 3 (128,000 calls each) | All pass |
| **Total** | **49** | **49/49 pass** |

Invariants verified:
- `USDC.balanceOf(contract) >= sum(active deposits)` — solvency never violated
- `depositCount` monotone — never decreased within any bill
- `deposited[slot] ∈ {0, shares[slot]}` — no partial fills ever observed

Security review report: [`docs/security-review.md`](docs/security-review.md)  
Deployment integrity report: [`docs/deploy/integrity-check-5b1.md`](docs/deploy/integrity-check-5b1.md)

---

## Mainnet Demonstration

Bill #0 was created, funded by two payers, and settled on Arc Mainnet as a public demonstration.

- **Bill ID:** 0
- **Total:** 0.20 USDC
- **Payers:** 2/2
- **Status:** SETTLED
- **Demo URL:** [splitflow.wizpay.xyz/bill/0](https://splitflow.wizpay.xyz/bill/0)

---

## Development Provenance

SplitFlow was built entirely through [Arc Studio](https://studio.arc.io) — Circle's onchain app builder. All contract code, tests, frontend, and documentation were authored and iterated inside Arc Studio. The actual mainnet deployment transaction was signed outside Arc Studio using Remix IDE and the developer's own MetaMask wallet.

---

## License

MIT © 2026 SplitFlow contributors

See [LICENSE](LICENSE) for full terms.
