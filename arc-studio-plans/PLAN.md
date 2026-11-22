# SplitFlow — Implementation Plan

## Summary

SplitFlow is a no-backend Web3 app that lets 2–5 payers pool exact USDC shares into a per-bill escrow contract. When the bill is fully funded anyone can settle it to the recipient during a fixed settlement grace period; if the deadline passes while underfunded, or if a fully funded bill goes unsettled past the grace period, contributors can individually claim refunds. Bills can be cancelled by their creator before any deposit has ever been accepted.

---

## Architecture

### Blockchain
Arc Mainnet (chain ID 5042). USDC is the native gas token and the escrow asset — one contract, one token, no ETH. Sub-second finality makes status updates snappy.

### Contract: SplitFlow.sol

Single non-upgradeable contract. No owner, no admin, no privileged withdrawal path.

**State machine per bill:**
```
OPEN ──────────────────────────────────────────→ CANCELLED   (creator, depositCount == 0 only)
OPEN → (block.timestamp >= deadline, underfunded) → REFUNDABLE
OPEN → FUNDED → (block.timestamp <= settleDeadline) → SETTLED
OPEN → FUNDED → (block.timestamp > settleDeadline, unsettled) → REFUNDABLE
```

Transitions in plain terms:
- **OPEN**: bill exists, `block.timestamp < deadline`, not all slots filled, not cancelled.
- **FUNDED**: all slots deposited; settlement is open while `block.timestamp <= settleDeadline`.
- **SETTLED**: `settleBill()` succeeded; refunds permanently disabled.
- **REFUNDABLE**: entered from OPEN (underfunded at `block.timestamp >= deadline`) OR from FUNDED (all slots filled but `block.timestamp > settleDeadline` and not yet settled). Once REFUNDABLE, settlement is permanently disabled.
- **CANCELLED**: `cancelBill()` called by creator while `depositCount == 0`; deposits and settlement permanently disabled.

**Exact deadline and grace-period boundaries — applied identically in Solidity, `billState.ts`, and Foundry tests:**

| Condition | Operator |
|---|---|
| Deposit permitted | `block.timestamp < deadline` |
| Underfunded → REFUNDABLE | `block.timestamp >= deadline` |
| Settlement permitted (fully funded) | `block.timestamp <= settleDeadline` |
| Funded → REFUNDABLE | `block.timestamp > settleDeadline` |

`GRACE_PERIOD = 7 days` (contract constant, not configurable per bill).
`settleDeadline = deadline + GRACE_PERIOD` (computed and stored at creation).

**Settlement grace period — fixed constant:** `uint256 constant GRACE_PERIOD = 7 days`

---

### Storage

```solidity
uint256 constant GRACE_PERIOD = 7 days;

struct Bill {
    string   title;
    address  creator;
    address  recipient;
    uint256  totalAmount;      // explicit parameter; must equal sum(shares); 6-decimal USDC ERC-20 units
    uint256  deadline;         // funding deadline; deposit requires block.timestamp < deadline
    uint256  settleDeadline;   // deadline + GRACE_PERIOD; settle requires block.timestamp <= settleDeadline
    uint8    payerCount;
    bool     settled;
    bool     cancelled;
    uint256  depositCount;     // incremented on every successful deposit; NEVER decremented; cancel requires == 0
    address[5] payers;
    uint256[5] shares;         // assigned share per payer slot (6-decimal); shares[i] > 0 for i < payerCount
    uint256[5] deposited;      // 0 or exactly shares[i]; no partial fills
}

mapping(uint256 => Bill) public bills;
uint256 public billCount;
```

**`depositCount` — persistent cancel guard:**
`depositCount` is incremented exactly once per successful `deposit()` call. It is never decremented by refund, cancellation attempt, or any other path. `cancelBill()` requires `depositCount == 0`. A payer who deposits and then refunds leaves `depositCount = 1`, permanently revoking creator cancel rights. This is a single SLOAD + comparison, no slot iteration.

**Unknown bill ID guard:**
Every public function that accepts a `billId` parameter (write or view) checks `billId < billCount` as its first action. Violation reverts with `BillDoesNotExist(uint256 billId)`. Applies to: `cancelBill`, `deposit`, `settleBill`, `refund`, `getBill`, `getBillState`, `getMySlot`, `isRefundable`.

---

### USDC on Arc — two views, one asset

Arc USDC is a single asset with two interfaces:
- **ERC-20 view** (`0x3600000000000000000000000000000000000000`): 6 decimals. Used for all contract storage, transfers, approvals, and UI display.
- **Native view**: 18 decimals. Used only for gas (`msg.value`). Never used by SplitFlow.sol.

SplitFlow.sol exclusively uses the ERC-20 interface via `IERC20` / `SafeERC20`. No native balances, no `msg.value`, no callbacks.

**USDC transfer restriction failure modes (both settlement and refunds):**
- **Blacklisted recipient**: `safeTransfer` to recipient reverts (Circle USDC blacklist). `settleBill` reverts; bill stays FUNDED. Grace-period expiry converts bill to REFUNDABLE — depositors recover funds via `refund()`. Documented in design doc failure-scenarios and shown as a UI notice.
- **Blacklisted refund claimant**: `safeTransfer` back to a blacklisted payer reverts. Funds remain escrowed. No contract-level workaround exists without an admin withdrawal path (excluded by design). Disclosed in design doc and surfaced as a UI warning on RefundButton when detected.
- **Insufficient allowance (deposit)**: USDC contract reverts `safeTransferFrom`. Deposit fails; slot stays unfilled. Payer must approve and retry.

The frontend reads the USDC address exclusively from `@/onchain-facts` (`getUsdc(chainId)`). Amounts parsed/formatted exclusively via `@/onchain-money`. No hardcoded address or decimal literal.

---

### Functions

**`createBill(string title, address recipient, uint256 totalAmount, address[] payers, uint256[] shares, uint256 deadline)`**
- Caller: Anyone
- Validates: `payers.length` 2–5, `payers.length == shares.length`, all payers non-zero and unique, `recipient != address(0)`, `deadline > block.timestamp`, `sum(shares) == totalAmount`, `totalAmount > 0`, each `shares[i] > 0`
- Custom errors: `InvalidPayerCount`, `ZeroAddress`, `DuplicatePayer`, `InvalidDeadline`, `ShareSumMismatch(uint256 provided, uint256 expected)`, `ZeroAmount`
- Computes `settleDeadline = deadline + GRACE_PERIOD`
- Increments `billCount`, stores full Bill struct with `depositCount = 0`
- Emits `BillCreated`

**`cancelBill(uint256 billId)`**
- Caller: Creator only
- Guards: `billId < billCount`, `msg.sender == bill.creator`, `depositCount == 0`, `!cancelled`, `!settled`
- Custom errors: `BillDoesNotExist`, `NotCreator`, `DepositsAlreadyMade`, `AlreadyCancelled`, `AlreadySettled`
- CEI: validate → `cancelled = true` → (no transfer)
- Emits `BillCancelled`

**`deposit(uint256 billId)`**
- Caller: Assigned payer only
- Guards: `billId < billCount`, `!cancelled`, `!settled`, `block.timestamp < deadline`, caller is a payer, slot not yet deposited
- Custom errors: `BillDoesNotExist`, `BillCancelled`, `AlreadySettled`, `DeadlinePassed`, `NotAPayer`, `AlreadyDeposited`
- CEI: validate → `deposited[slot] = shares[slot]`, `depositCount++` → `safeTransferFrom(msg.sender, address(this), shares[slot])`
- If all slots now filled: emits `BillFunded`
- Emits `Deposited`

**`settleBill(uint256 billId)`**
- Caller: Anyone (permissionless)
- Guards: `billId < billCount`, all slots filled, `!settled`, `!cancelled`, `block.timestamp <= settleDeadline`
- Custom errors: `BillDoesNotExist`, `NotFullyFunded`, `AlreadySettled`, `BillCancelled`, `SettleDeadlinePassed`
- CEI: validate → `settled = true` → `safeTransfer(recipient, totalAmount)`
- Emits `BillSettled`

**`refund(uint256 billId)`**
- Caller: Depositor only (any payer whose `deposited[slot] > 0`)
- Guards: `billId < billCount`, caller is a payer with `deposited[slot] > 0`, `!settled`, `isRefundable(billId)` == true
- Custom errors: `BillDoesNotExist`, `NotAPayer`, `NothingToRefund`, `AlreadySettled`, `NotRefundable`
- CEI: validate → `amount = deposited[slot]`, `deposited[slot] = 0` → `safeTransfer(msg.sender, amount)`
- Emits `Refunded`

**View functions (all guard `billId < billCount`):**
- `getBill(uint256 billId) returns (Bill memory)` — full struct
- `getBillState(uint256 billId) returns (BillState)` — enum: OPEN / FUNDED / SETTLED / REFUNDABLE / CANCELLED
- `getMySlot(uint256 billId, address addr) returns (uint8 slot, bool deposited)` — slot index for addr, reverts `NotAPayer` if not found
- `isRefundable(uint256 billId) returns (bool)` — `(block.timestamp >= deadline && !allFunded) || (block.timestamp > settleDeadline && allFunded && !settled)`

---

### Events

```solidity
event BillCreated(
    uint256 indexed billId,
    address indexed creator,
    address recipient,
    uint256 totalAmount,
    uint256 deadline,
    uint256 settleDeadline
);
event BillCancelled(uint256 indexed billId, address indexed creator);
event Deposited(
    uint256 indexed billId,
    address indexed payer,
    uint256 amount,
    uint256 indexed slotIndex
);
event BillFunded(uint256 indexed billId);
event BillSettled(uint256 indexed billId, address indexed recipient, uint256 amount);
event Refunded(uint256 indexed billId, address indexed payer, uint256 amount);
```

---

### Security properties

- `ReentrancyGuard` (`nonReentrant`) on `deposit`, `settleBill`, `refund`; also on `cancelBill` (no external call, but added for belt-and-suspenders)
- `SafeERC20` (`safeTransfer`, `safeTransferFrom`) on all USDC transfers
- CEI applied strictly in every write function (see function specs above)
- Settlement / refund permanent mutual exclusion via `settled` and `isRefundable()` checks
- `cancelBill` zero-deposit guard via `depositCount == 0` (single SLOAD, never manipulable by refunds)
- `deposit` deadline guard: `block.timestamp < deadline` (strict less-than)
- `settleBill` deadline guard: `block.timestamp <= settleDeadline` (inclusive upper bound)
- Single-transfer `settleBill`: one `safeTransfer` to recipient — no per-payer loop
- No `approve` held by the contract — payers approve contract address then call `deposit`; no approval for `settleBill`
- No privileged owner, no admin `withdraw`, no fee extraction

### Accounting invariants (must hold at all times)

1. `USDC.balanceOf(address(this)) >= sum of deposited[i] across all bills where !settled && !cancelled`
2. For any bill: `sum(deposited[i]) <= totalAmount`
3. For any slot i: `deposited[i]` is either `0` or exactly `shares[i]`
4. `depositCount` is monotonically non-decreasing for any bill
5. A settled bill contributes 0 to invariant 1 (funds transferred out)
6. A cancelled bill contributes 0 to invariant 1 (depositCount == 0 means no funds ever entered)

---

### Frontend

React + TypeScript + Vite + Tailwind CSS + shadcn/ui + Reown AppKit + wagmi + viem.

**Pages:**

| Route | View | Description |
|---|---|---|
| `/` | Home / Dashboard | Bills where connected wallet is payer or creator. "Create Bill" CTA. |
| `/create` | Create Bill | Title, recipient, explicit totalAmount, deadline, up to 5 payer addresses + exact shares. Live share-sum == totalAmount validation. |
| `/bill/:id` | Bill Detail | State badge, payer progress, deposit/settle/refund/cancel actions. Explorer links. |

**Key components:**
- `AppKitProvider` — wagmi + AppKit wrapping Arc Mainnet (chain ID 5042)
- `BillCard` — compact summary for dashboard
- `PayerRow` — address, assigned share, deposit status; approve + deposit buttons if applicable
- `DepositFlow` — two-step UX: (1) ERC-20 approve contract for exact share amount, (2) `deposit(billId)`. No approval for settlement.
- `SettleButton` — permissionless; single transaction; visible only in FUNDED state while `block.timestamp <= settleDeadline`
- `RefundButton` — per-payer; visible only in REFUNDABLE state for connected wallet's slot; includes blacklist-restriction warning
- `CancelButton` — creator-only; visible only when `depositCount == 0` and state is OPEN
- `BillStateBadge` — OPEN / FUNDED / SETTLED / REFUNDABLE / CANCELLED
- `GracePeriodNotice` — shown on FUNDED bills: "Settlement closes [settleDeadline date]. After that, deposits become refundable."
- `AmountInput` — 6-decimal ERC-20 USDC only; validates against totalAmount
- `AddressInput` — checksummed EVM address validation
- `ChainGuard` — Arc Mainnet (5042) only; blocks all write actions until correct network

**USDC amounts:** `getUsdc(chainId)` from `@/onchain-facts`; `parseAmount` / `Amount.fromRaw` from `@/onchain-money`. No hardcoded address or decimal.

**Approval flow:** Payer deposit = Approve then Deposit (two transactions). Settlement = single permissionless call, no approval.

**Bill discovery:** Read `billCount`, batch `getBill(i)`. MVP-sufficient; subgraph is v2.

**`src/lib/billState.ts`** — single source of BillState derivation from Bill struct + current timestamp. Uses exact boundary operators. All components consume this; no duplicated logic.

---

## Files to Create / Modify

**Contract**
1. `contracts/SplitFlow.sol` — main escrow contract (new)
2. `contracts/SplitFlow-design.md` — Circle-style design doc (new)
3. `contracts/test/SplitFlow.t.sol` — Foundry unit, fuzz, and invariant tests (new, Phase 3)

**Frontend — providers and config**
4. `src/main.tsx` — replace ConnectKit with AppKit provider (modify)
5. `src/config.ts` — AppKit wagmi config targeting Arc Mainnet (modify)
6. `src/providers/AppKitProvider.tsx` — Reown AppKit setup (new)

**Frontend — pages**
7. `src/pages/Home.tsx` — dashboard (new)
8. `src/pages/CreateBill.tsx` — creation form with explicit totalAmount (new)
9. `src/pages/BillDetail.tsx` — per-bill view (new)

**Frontend — components**
10. `src/components/BillCard.tsx` (new)
11. `src/components/PayerRow.tsx` (new)
12. `src/components/DepositFlow.tsx` (new)
13. `src/components/BillStateBadge.tsx` (new)
14. `src/components/GracePeriodNotice.tsx` (new)
15. `src/components/CancelButton.tsx` (new)
16. `src/components/AmountInput.tsx` (new)
17. `src/components/AddressInput.tsx` (new)
18. `src/components/ChainGuard.tsx` (new)

**Frontend — contract wiring**
19. `src/lib/splitflow.ts` — ABI + typed hook wrappers (new)
20. `src/lib/usdc.ts` — USDC approve helper (new)
21. `src/lib/billState.ts` — pure BillState derivation, exact boundary operators (new)

**App entry**
22. `src/App.tsx` — router + AppKit provider (modify)

**Env**
23. `.env` — `VITE_WALLETCONNECT_PROJECT_ID`, `VITE_SPLITFLOW_CONTRACT_ADDRESS` (add post-deploy)

---

## Build Sequence

1. **Update PLAN.md** with five final plan-mode corrections (this step).
2. **Write `contracts/SplitFlow-design.md`** — full Circle-style design doc.
3. **Write `contracts/SplitFlow.sol`** — full contract per this spec.
4. **Compile** (`forge build`) — report results, resolve any errors.
5. **Security review (max depth)** — Critical + High + Medium + Low, Slither, fix loop up to 3 rounds. *(Phase 3)*
6. **Write Foundry tests** — `contracts/test/SplitFlow.t.sol`. *(Phase 3)*
7. **Install Reown AppKit** — `bun add @reown/appkit @reown/appkit-adapter-wagmi`.
8. **Build frontend scaffold** — AppKit provider, ChainGuard, App router, Home/BillDetail shells.
9. **Build Create Bill page** — explicit totalAmount, share-sum validation, settleDeadline preview.
10. **Build Deposit flow** — approve then deposit UX; single-tx settle; GracePeriodNotice; RefundButton with blacklist warning.
11. **Wire `src/lib/billState.ts`**.
12. **Prepare mainnet deployment artifact** — `forge build` export; you self-deploy outside Arc Studio.
13. **Set contract address** — `VITE_SPLITFLOW_CONTRACT_ADDRESS` in `.env`; switch to `arc` viem chain.
14. **Cloudflare Pages deploy** — GitHub push, env vars, verify at `splitflow.wizpay.xyz`.

---

## Resolved Decisions

**Option B grace period:** `settleDeadline = deadline + GRACE_PERIOD (7 days)`. Blacklisted recipient → `settleBill` reverts → grace period expiry opens REFUNDABLE.

**Creator cancellation:** `depositCount == 0` guard. Refunds do not restore cancel eligibility. Permanent.

**Explicit `totalAmount`:** Passed as a parameter to `createBill`. Contract enforces `sum(shares) == totalAmount` with `ShareSumMismatch` error.

**Deadline boundaries:** Strict `<` for deposits, inclusive `<=` for settlement, `>=` / `>` for REFUNDABLE. Consistent across Solidity, `billState.ts`, and tests.

**BillDoesNotExist:** First check in every public bill-specific function; applies to view and write functions.

**USDC restrictions:** Blacklisted recipient blocks settlement (grace-period escape). Blacklisted payer blocks their own refund (no contract-level escape; documented and disclosed in UI).

**Deployment target:** Arc Mainnet only (chain ID 5042). No testnet broadcast. Local Foundry tests + optional local fork simulation.

---

## Technical Blockers

1. **WalletConnect project ID** — obtain from cloud.walletconnect.com; store as `VITE_WALLETCONNECT_PROJECT_ID`.
2. **AppKit + wagmi v2 compatibility** — confirm version match at install; pin if needed.
3. **OZ 5.1.0 Paris constraint** — do not upgrade; `ReentrancyGuard` and `SafeERC20` are available at 5.1.0.
4. **Arc Mainnet self-deploy** — own wallet + Arc USDC for gas; private key never enters Arc Studio.
5. **`getUsdc(5042)` in `@/onchain-facts`** — verify before frontend finalization; request addition if missing.
6. **Bill discovery scalability** — batch read is MVP-sufficient; subgraph is v2.

---

## Done When

- [ ] `SplitFlow.sol` compiles under Solidity 0.8.28 / Paris EVM with no errors or warnings
- [ ] `contracts/SplitFlow-design.md` complete: all 5 states, exact boundaries, CEI pseudocode, blacklist failure scenarios, accounting invariants
- [ ] All Foundry tests pass: happy path, grace-period boundary (warp to `deadline-1` / `deadline` / `settleDeadline` / `settleDeadline+1`), funded-expiry refund, underfunded-expiry refund, cancel pre-deposit, cancel blocked post-deposit, cancel blocked post-refund, all revert cases, fuzz shares, solvency invariant
- [ ] Max-depth security review: no unresolved Critical or High findings
- [ ] Slither: no unresolved High findings
- [ ] No testnet broadcast at any step
- [ ] Frontend on Arc Mainnet (5042) only; ChainGuard blocks writes on wrong network
- [ ] Create Bill form: explicit `totalAmount`, live share-sum validation, settleDeadline preview
- [ ] DepositFlow: Approve then Deposit (two txs); settlement is one permissionless tx
- [ ] `GracePeriodNotice` on all FUNDED bills
- [ ] `CancelButton` gated to `depositCount == 0`
- [ ] `RefundButton` includes blacklist-restriction warning
- [ ] All five state chips render: OPEN / FUNDED / SETTLED / REFUNDABLE / CANCELLED
- [ ] USDC address and decimals from `@/onchain-facts` / `@/onchain-money` only
- [ ] Contract address from env var only
- [ ] `billState.ts` is single source of state derivation; exact boundary operators
- [ ] Builds and deploys to Cloudflare Pages at `splitflow.wizpay.xyz`
- [ ] No backend, database, VPS, platform fees, or admin withdrawal path
