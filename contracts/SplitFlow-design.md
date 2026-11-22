# SplitFlow Smart Contract — Design Document

**Status:** Draft  
**Authors:** SplitFlow / Arc Studio  
**Target chain:** Arc Mainnet (chain ID 5042)  
**Language / toolchain:** Solidity 0.8.28, Foundry, OpenZeppelin 5.1.0  
**Milestone:** MVP — Phase 2 (contract implementation)

**Review tracker:**
- [ ] Design review
- [ ] Security review
- [ ] Ops review

**Action Items (living):** _(empty at first draft; fill after each review round)_

---

## 1. Goals / Non-Goals

### Goals
- Allow 2–5 named payers to pool exact USDC shares into a single on-chain escrow per bill.
- Release pooled funds to a designated recipient when all payers have deposited.
- Automatically protect depositors via a settlement grace period: if a fully funded bill goes unsettled past the grace period, each depositor can individually reclaim their share.
- Allow creators to cancel a bill that has never received any deposit.
- Prevent every class of double-withdrawal (double-settle, double-refund, settle-then-refund, refund-then-settle).
- Operate with zero protocol fees, zero admin keys, and zero privileged withdrawal paths.

### Non-Goals
- Crowdfunding, open contributions, or arbitrary contributor sets.
- Payroll, recurring payments, revenue sharing, or streaming.
- Partial deposits (each payer either pays in full or not at all).
- Cross-chain or multi-token support.
- Upgradeability.
- Any off-chain component, backend, or oracle dependency.

---

## 2. Requirements

### Functional
- Creator specifies: title, recipient, explicit `totalAmount`, up to 5 payer addresses with exact shares, and a funding deadline.
- `sum(shares) == totalAmount` must hold at creation; the contract enforces this.
- Each payer deposits exactly their assigned share in one transaction.
- A fully funded bill may be settled (funds sent to recipient) by anyone until `settleDeadline = deadline + GRACE_PERIOD`.
- An underfunded bill becomes refundable when `block.timestamp >= deadline`.
- A fully funded but unsettled bill becomes refundable when `block.timestamp > settleDeadline`.
- Once refundable, each depositor can reclaim exactly their deposited amount individually.
- Creator may cancel before any deposit has ever been accepted (`depositCount == 0`).
- Cancellation is permanent and irreversible.
- All bill IDs outside `[0, billCount)` are rejected.

### Security (testable assertions)
- No path exists for a non-payer to deposit.
- No path exists for a payer to deposit more than their assigned share.
- No path exists for a payer to deposit twice.
- No path exists for a bill to be settled twice.
- No path exists for a payer to refund twice.
- No path exists for settlement and refund to both succeed on the same bill.
- No path exists for the creator to cancel after any deposit has ever been accepted, including after that deposit is refunded.
- `USDC.balanceOf(contract) >= sum(active escrow)` holds at all times.
- No privileged withdrawal path exists under any account.

---

## 3. Terminology & Actors

| Term | Definition |
|---|---|
| **Bill** | An escrow agreement with a fixed set of payers, shares, recipient, and deadline. |
| **Creator** | The address that called `createBill`. Has no special fund access; may only cancel before deposits. |
| **Payer** | One of up to 5 named addresses assigned an exact USDC share. |
| **Recipient** | The address that receives the total amount when the bill is fully funded and settled. |
| **Slot** | Array index (0–4) uniquely assigned to a payer within a bill. |
| **depositCount** | A monotonically non-decreasing counter incremented on every successful deposit. Never decremented. |
| **settleDeadline** | `deadline + GRACE_PERIOD`; the last timestamp at which settlement is permitted. |
| **GRACE_PERIOD** | Contract constant: 7 days. |
| **REFUNDABLE** | A derived state: underfunded past `deadline`, or fully funded past `settleDeadline`. |

**Actors table:**

| Actor | On/Off-chain | Trust level | What they can do |
|---|---|---|---|
| Creator | On-chain | Semi-trusted | Create bills; cancel before any deposit |
| Payer | On-chain | Untrusted | Deposit their assigned share |
| Settler | On-chain | Untrusted (permissionless) | Call `settleBill` on any fully funded bill within grace period |
| Depositor (refund claimant) | On-chain | Untrusted | Reclaim their own deposit when REFUNDABLE |
| Recipient | On-chain | Untrusted | Receives funds on settlement; no contract interaction required |

---

## 4. Language / Runtime

- **Solidity 0.8.28** — built-in overflow/underflow protection; `unchecked` not used anywhere in this contract.
- **EVM target:** Paris (Foundry `evm_version = "paris"`). No Cancun opcodes.
- **Compiler:** `solc 0.8.28`, `optimizer_runs = 200`.
- **Base contracts:** OpenZeppelin 5.1.0 — `ReentrancyGuard`, `SafeERC20`. No UUPS, no Ownable.
- **No upgradeable proxy.** Storage layout compatibility is N/A.

---

## 5. Transaction & Execution Model

Every function call is atomic (all state committed or all reverted). Re-entry surface exists in `deposit` (pulls from caller), `settleBill` (pushes to recipient), and `refund` (pushes to caller). All three are guarded with `nonReentrant`. CEI (Checks-Effects-Interactions) is applied strictly in every write function — state is fully committed before any external call.

---

## 6. Architecture Overview

```
Creator ──createBill()──────────────────────────────────────→ SplitFlow.sol
                                                                   │
Payer  ──approve(contract, share)──→ USDC ERC-20 ←─safeTransferFrom─┤ deposit()
                                                                   │
Settler ──settleBill()──────────────────────────────────────→ safeTransfer → Recipient
                                                                   │
Depositor ──refund()────────────────────────────────────────→ safeTransfer → Payer
```

**Flow of funds:**

| Step | Who moves what | Invariant that must hold |
|---|---|---|
| `deposit()` | Payer → SplitFlow (via `safeTransferFrom`) | `deposited[slot]` flips from 0 to `shares[slot]`; contract balance increases by `shares[slot]` |
| `settleBill()` | SplitFlow → Recipient (via `safeTransfer`) | `settled = true` before transfer; contract balance decreases by `totalAmount` |
| `refund()` | SplitFlow → Payer (via `safeTransfer`) | `deposited[slot] = 0` before transfer; contract balance decreases by refunded amount |
| `cancelBill()` | No funds moved | `depositCount == 0` guarantees no balance to account for |

**Resting-state invariant:** Contract holds no funds except those corresponding to active (unsettled, uncancelled) bill escrow balances.

**Dependencies:** Only the Arc USDC ERC-20 at `0x3600000000000000000000000000000000000000`. No oracle, no router, no external protocol.

---

## 7. Contract Design

### Roles

| Role | Count | Permissions | Why it exists |
|---|---|---|---|
| Creator | 1 per bill | Cancel before first deposit | Allows correcting a configuration error before any funds are at risk |
| Payer | 2–5 per bill | Deposit assigned share; reclaim on refund | The parties splitting the bill |
| Settler | Any EOA/contract | Call `settleBill` when funded within grace period | Permissionless to avoid hold-up |
| (No contract owner) | — | None | Prevents privileged fund extraction |

### Storage layout

```solidity
// Contract-level constants
uint256 constant GRACE_PERIOD = 7 days;
address public immutable usdc;             // set in constructor

// Contract-level state
uint256 public billCount;                  // slot 1 (after ReentrancyGuard _status at slot 0)
mapping(uint256 => Bill) public bills;     // slot 2

// Bill struct (packed where possible)
struct Bill {
    string   title;           // dynamic
    address  creator;         // 20 bytes
    address  recipient;       // 20 bytes
    uint256  totalAmount;     // 32 bytes
    uint256  deadline;        // 32 bytes
    uint256  settleDeadline;  // 32 bytes
    uint8    payerCount;      // 1 byte
    bool     settled;         // 1 byte
    bool     cancelled;       // 1 byte
    uint256  depositCount;    // 32 bytes (monotonically non-decreasing)
    address[5] payers;        // 5 × 20 bytes
    uint256[5] shares;        // 5 × 32 bytes
    uint256[5] deposited;     // 5 × 32 bytes
}
```

### State enum

```solidity
enum BillState { OPEN, FUNDED, SETTLED, REFUNDABLE, CANCELLED }
```

### Custom errors

```solidity
error BillDoesNotExist(uint256 billId);
error InvalidPayerCount();
error ZeroAddress();
error DuplicatePayer();
error InvalidDeadline();
error ShareSumMismatch(uint256 provided, uint256 expected);
error ZeroAmount();
error NotCreator();
error DepositsAlreadyMade();
error AlreadyCancelled();
error AlreadySettled();
error BillIsCancelled();
error DeadlinePassed();
error NotAPayer();
error AlreadyDeposited();
error NotFullyFunded();
error SettleDeadlinePassed();
error NotRefundable();
error NothingToRefund();
```

### Modifiers / internal helpers

- `_requireExists(uint256 billId)` — reverts `BillDoesNotExist` if `billId >= billCount`
- `_isFullyFunded(Bill storage b) returns (bool)` — returns `b.depositCount == b.payerCount`
- `_isRefundable(Bill storage b) returns (bool)` — `(block.timestamp >= b.deadline && !_isFullyFunded(b)) || (block.timestamp > b.settleDeadline && _isFullyFunded(b) && !b.settled)`
- `_findSlot(Bill storage b, address addr) returns (uint8)` — returns slot index or reverts `NotAPayer`

### Functions — write (detailed)

#### `createBill`
```
Signature: createBill(string calldata title, address recipient, uint256 totalAmount,
                       address[] calldata payers, uint256[] calldata shares, uint256 deadline)
Access: anyone
Preconditions:
  payers.length >= 2 && payers.length <= 5
  payers.length == shares.length
  recipient != address(0)
  deadline > block.timestamp
  totalAmount > 0
  for each i: shares[i] > 0, payers[i] != address(0)
  all payers[i] unique
  sum(shares) == totalAmount   → revert ShareSumMismatch(sum, totalAmount) on mismatch
State mutations:
  billCount++
  bills[id] = Bill { ..., settleDeadline = deadline + GRACE_PERIOD, depositCount = 0, settled = false, cancelled = false }
Events: BillCreated(billId, creator, recipient, totalAmount, deadline, settleDeadline)
```

#### `cancelBill`
```
Signature: cancelBill(uint256 billId)
Access: creator only
Preconditions (in order):
  billId < billCount
  msg.sender == bill.creator
  bill.depositCount == 0
  !bill.cancelled
  !bill.settled
State mutations (CEI):
  bill.cancelled = true
Events: BillCancelled(billId, creator)
External calls: none
```

#### `deposit`
```
Signature: deposit(uint256 billId)
Access: assigned payer only
Preconditions (in order):
  billId < billCount
  !bill.cancelled
  !bill.settled
  block.timestamp < bill.deadline   ← strict less-than
  caller is a payer (find slot)
  bill.deposited[slot] == 0
State mutations (CEI):
  bill.deposited[slot] = bill.shares[slot]
  bill.depositCount++
External call:
  USDC.safeTransferFrom(msg.sender, address(this), bill.shares[slot])
Post-call check:
  if depositCount == payerCount: emit BillFunded(billId)
Events: Deposited(billId, payer, amount, slotIndex) [+ BillFunded if last slot]
```

#### `settleBill`
```
Signature: settleBill(uint256 billId)
Access: anyone (permissionless)
Preconditions (in order):
  billId < billCount
  _isFullyFunded(bill)
  !bill.settled
  !bill.cancelled
  block.timestamp <= bill.settleDeadline   ← inclusive
State mutations (CEI):
  bill.settled = true
External call:
  USDC.safeTransfer(bill.recipient, bill.totalAmount)
Events: BillSettled(billId, recipient, totalAmount)
```

#### `refund`
```
Signature: refund(uint256 billId)
Access: depositor (payer with deposited[slot] > 0)
Preconditions (in order):
  billId < billCount
  caller is a payer (find slot)
  bill.deposited[slot] > 0
  !bill.settled
  _isRefundable(bill) == true
State mutations (CEI):
  amount = bill.deposited[slot]
  bill.deposited[slot] = 0
External call:
  USDC.safeTransfer(msg.sender, amount)
Events: Refunded(billId, payer, amount)
```

### Functions — view

```
getBill(uint256 billId) → Bill memory
  Guard: _requireExists(billId)

getBillState(uint256 billId) → BillState
  Guard: _requireExists(billId)
  Logic:
    if cancelled → CANCELLED
    if settled → SETTLED
    if _isRefundable → REFUNDABLE
    if _isFullyFunded → FUNDED
    → OPEN

getMySlot(uint256 billId, address addr) → (uint8 slot, bool hasDeposited)
  Guard: _requireExists(billId)
  Logic: _findSlot(bill, addr); return (slot, bill.deposited[slot] > 0)

isRefundable(uint256 billId) → bool
  Guard: _requireExists(billId)
  Logic: _isRefundable(bills[billId])
```

---

## 8. Specification — Feature Areas

### 8.1 Bill Creation

**Invariants:**
1. `sum(shares) == totalAmount` always holds for any stored bill.
2. All payer addresses are unique and non-zero.
3. `settleDeadline == deadline + GRACE_PERIOD` always.
4. `depositCount == 0` at creation.

**Functionalities:**

| Functionality | Restriction | Event |
|---|---|---|
| Create bill | Anyone; all validations must pass | `BillCreated` |
| Reject mismatched totalAmount | Automatic; `ShareSumMismatch` | — |
| Reject duplicate payers | Automatic; `DuplicatePayer` | — |
| Reject past deadline | Automatic; `InvalidDeadline` | — |

### 8.2 Deposits

**Invariants:**
1. `deposited[i]` is 0 or exactly `shares[i]` — no other value is ever stored.
2. `depositCount` is monotonically non-decreasing.
3. A deposit is only accepted while `block.timestamp < deadline`.

**Functionalities:**

| Functionality | Restriction | Event |
|---|---|---|
| Deposit exact share | Assigned payer; deadline not passed; slot empty; bill not cancelled/settled | `Deposited` [+ `BillFunded`] |
| Reject late deposit | `block.timestamp >= deadline` → `DeadlinePassed` | — |
| Reject unauthorized deposit | Non-payer → `NotAPayer` | — |
| Reject duplicate deposit | Slot already filled → `AlreadyDeposited` | — |

### 8.3 Settlement

**Invariants:**
1. Settlement transfers exactly `totalAmount` to recipient in one call.
2. Settlement is only possible while `block.timestamp <= settleDeadline`.
3. Once `settled = true`, no further settlement or refund is possible.

**Functionalities:**

| Functionality | Restriction | Event |
|---|---|---|
| Settle fully funded bill | Anyone; all slots filled; `block.timestamp <= settleDeadline`; not already settled/cancelled | `BillSettled` |
| Reject settlement of unfunded bill | `NotFullyFunded` | — |
| Reject settlement past grace period | `SettleDeadlinePassed` | — |
| Reject double settlement | `AlreadySettled` | — |

### 8.4 Refunds

**Invariants:**
1. Refund transfers exactly `deposited[slot]` and zeros it before the transfer (CEI).
2. Refund is only possible when `_isRefundable` is true.
3. Once `deposited[slot] == 0`, no further refund for that slot.

**Failure mode — blacklisted payer:**
If Circle's USDC contract has blacklisted the payer's address, `safeTransfer` to the payer will revert. The payer's escrowed funds remain in the contract. There is no contract-level workaround — a privileged rescue path was explicitly excluded. This limitation is disclosed in the UI.

**Functionalities:**

| Functionality | Restriction | Event |
|---|---|---|
| Refund deposited share | Payer with `deposited[slot] > 0`; bill REFUNDABLE; not settled | `Refunded` |
| Reject refund on settled bill | `AlreadySettled` | — |
| Reject refund when not refundable | `NotRefundable` | — |
| Reject double refund | `NothingToRefund` (deposited[slot] == 0 after first refund) | — |

### 8.5 Cancellation

**Invariants:**
1. Cancellation is only possible when `depositCount == 0`.
2. A refund cannot restore `depositCount` to 0; once any deposit occurs, cancel is permanently blocked.

**Failure mode — blacklisted recipient (settlement path):**
If the recipient is blacklisted by Circle, `settleBill` reverts. The bill stays FUNDED. After `settleDeadline` passes, the bill becomes REFUNDABLE and depositors can recover their funds. This is the designed mitigation.

**Functionalities:**

| Functionality | Restriction | Event |
|---|---|---|
| Cancel bill | Creator; `depositCount == 0`; not already cancelled/settled | `BillCancelled` |
| Reject cancel after any deposit | `DepositsAlreadyMade` | — |
| Reject cancel by non-creator | `NotCreator` | — |

---

## 9. Deployment & Initialization

- No `initialize()` — not upgradeable. Constructor sets `usdc` immutable.
- Constructor: `constructor(address _usdc)` — validates `_usdc != address(0)`.
- On Arc Mainnet, `_usdc = 0x3600000000000000000000000000000000000000` (the canonical Arc USDC ERC-20).
- Deployer has no special powers after deployment. No roles held by deployer address.
- Deployment is a single `CREATE` transaction from the deployer's wallet. No proxy, no init runbook.

---

## 10. Upgradeability

Not upgradeable. No proxy pattern. Migration story: if a bug is found post-deploy, a new contract is deployed at a new address. The frontend `VITE_SPLITFLOW_CONTRACT_ADDRESS` env var is updated. Old bills remain claimable on the original contract indefinitely — no funds are ever migrated by the contract itself.

---

## 11. Key Management & Signing

No off-chain signatures. No EIP-712 typed data. No Permit2. All interactions are direct on-chain calls from wallet-connected users. Deployer key is used once for deployment and has no ongoing role.

---

## 12. Security Considerations

| Vulnerability | Applicable? | Mitigation |
|---|---|---|
| Reentrancy | Yes — `deposit`, `settleBill`, `refund` all make external USDC calls | `nonReentrant` on all three + CEI ordering: state finalized before every external call |
| Access control | Yes — creator-only cancel, payer-only deposit/refund | Explicit `msg.sender` checks; `NotCreator`, `NotAPayer` errors |
| Integer overflow/underflow | Solidity 0.8 checked arithmetic | No `unchecked` blocks in this contract |
| Unchecked ERC-20 return value | Yes | `SafeERC20` wraps all transfers; reverts on false return |
| Fee-on-transfer / rebasing tokens | N/A — only Arc USDC, a fixed-supply non-rebasing token | Not applicable |
| Share-sum mismatch | Yes — explicit `totalAmount` parameter | `sum(shares) == totalAmount` enforced at creation with `ShareSumMismatch` |
| Duplicate payer | Yes — same address in two slots could allow double-deposit | `DuplicatePayer` check at creation |
| Cancel-after-refund attack | Yes — creator could cancel after depositor refunds to strand no funds but manipulate state | `depositCount` never decrements; cancel requires `depositCount == 0` |
| Race condition: settle vs refund | Yes — both could be attempted simultaneously | Mutual exclusion: `refund` checks `!settled`; `settleBill` checks `!_isRefundable` |
| Timestamp manipulation | Yes — miners can adjust by ±15s on most chains; Arc sub-second finality reduces window | GRACE_PERIOD is 7 days; ±15s is negligible against 7-day windows |
| Front-running | Yes — anyone could call `settleBill` before the intended settler | Settlement is permissionless by design; no value is extractable by the settler |
| Denial of service on refund | Yes — blacklisted payer address | Documented limitation; no contract-level escape without admin path |
| Denial of service on settlement | Yes — blacklisted recipient | Grace-period expiry → REFUNDABLE escape for depositors |
| Cross-bill accounting | Yes — multiple bills share one contract | Per-bill `deposited` arrays; contract balance invariant holds across all bills |
| Unknown bill ID | Yes — callers could pass arbitrary IDs | `BillDoesNotExist` guard as first check in all public functions |
| Zero-amount shares | Yes | `shares[i] > 0` enforced at creation |
| Approval persistence | N/A — contract never holds approvals; payers approve then deposit | Not applicable |
| Centralization risk | Minimal — no owner, no admin; deployer has no post-deploy powers | Documented; no timelock needed |
| Delegatecall / proxy | N/A — not upgradeable | Not applicable |

---

## 13. Trust Model & Threat Analysis

| Actor | Max damage if compromised | Mitigation | Detection |
|---|---|---|---|
| Creator | Cancel an unfunded bill (no funds at risk by definition); cannot touch funded bills | `depositCount == 0` guard; no financial damage possible | BillCancelled event |
| Payer | Fail to deposit (bill stays underfunded → depositors refund); no access to other payers' funds | Slot isolation; per-slot deposit tracking | Deposited events |
| Settler (permissionless) | None — `settleBill` only sends funds to the pre-specified recipient | Recipient is immutable; settler gains nothing | BillSettled event |
| Deployer (post-deploy) | None — no owner role, no privileged function | No admin path in contract | N/A |
| USDC contract (Circle) | Blacklist recipient (blocks settlement) or payer (blocks their refund) | Grace-period REFUNDABLE escape for recipient blacklist; UI warning for payer blacklist | Settlement revert / Refund revert |

---

## 14. Emergency Response & Circuit Breakers

No pause mechanism. No Rescuer role. By design: no privileged fund access of any kind. Emergency response for a critical bug is:

1. Deploy a fixed contract at a new address.
2. Update `VITE_SPLITFLOW_CONTRACT_ADDRESS` in the frontend.
3. Communicate the new address to users.
4. Existing bills on the old contract remain claimable indefinitely via the old address.

There is no mechanism to migrate funds from old to new contract — this is intentional (no admin withdrawal path).

---

## 15. Failure Scenarios

**Scenario 1 — Blacklisted recipient**
> Bill is fully funded. Creator specified a recipient that Circle has since blacklisted. `settleBill` is called; USDC `transfer` to recipient reverts. `settleBill` reverts; `settled` remains false. After `settleDeadline` passes, `_isRefundable` returns true. Each depositor calls `refund()` and recovers their share. ✓ No funds lost.

**Scenario 2 — Blacklisted payer (refund path)**
> Bill is underfunded past `deadline`. One payer's address has been blacklisted by Circle. They call `refund()`; USDC `transfer` to them reverts. Their `deposited[slot]` was already zeroed by CEI — wait, CEI zeros it before the transfer. The transfer reverts, which causes the entire transaction to revert. `deposited[slot]` is restored by the EVM revert. The payer's funds remain escrowed; they cannot withdraw. Other payers are unaffected and can refund their own slots independently. ✗ Blacklisted payer loses access to their escrowed funds. No contract-level escape. Disclosed in UI.

**Scenario 3 — Partial funding at deadline**
> 3 of 5 payers deposit. Deadline passes. The 2 unfunded payers never deposited. `block.timestamp >= deadline` and not fully funded → REFUNDABLE. The 3 depositors each call `refund()` and recover their shares. The 2 non-depositors have nothing to refund. ✓ All deposited funds returned.

**Scenario 4 — Full funding, late settlement attempt**
> All 5 payers deposit. No one calls `settleBill`. `settleDeadline` passes. `block.timestamp > settleDeadline` → REFUNDABLE. Settlement is now permanently disabled. Each of the 5 depositors calls `refund()` and recovers their share. ✓ No funds lost; settlement missed.

**Scenario 5 — Concurrent settle and refund attempt**
> Bill is REFUNDABLE. Settler calls `settleBill` in the same block as a depositor calling `refund`. `settleBill` checks `_isRefundable` → true → reverts `SettleDeadlinePassed` (or equivalent). `refund` succeeds. Or if `settleBill` somehow landed first (impossible in REFUNDABLE state since `_isRefundable` implies the grace period has passed and `settleBill` requires `block.timestamp <= settleDeadline`), `settleBill` would succeed and `refund` would revert `AlreadySettled`. The check sequence ensures both cannot succeed. ✓ Mutual exclusion maintained.

---

## 16. Priorities & Tradeoffs

| Decision | Tradeoff | Rationale |
|---|---|---|
| Fixed 7-day GRACE_PERIOD | Simple, predictable; creators cannot optimize per bill | Reduces complexity and attack surface; configurable grace period was considered and rejected for MVP |
| Permissionless `settleBill` | Any address can settle; no settler role | Prevents hold-up; settler gains nothing (funds go to recipient) |
| `depositCount` never decrements | Creator cannot cancel after any deposit, even if refunded | Prevents a race-condition attack where creator cancels between a refund and a retry; adds storage cost (one uint256) |
| Explicit `totalAmount` parameter | Must match `sum(shares)`; redundant but explicit | Keeps the Create Bill UI and contract interface aligned; `ShareSumMismatch` gives a clear error |
| No pause mechanism | Cannot halt in emergency | Removes admin attack surface; emergency response is redeploy-and-redirect |
| No partial deposit | Payer deposits full share in one tx | Simplifies accounting; no partial-deposit ambiguity; standard for bill-splitting |
| No Rescuer role | Blacklisted payer loses access to escrowed funds | Any Rescuer role creates a privileged withdrawal path, which was explicitly ruled out |

---

## 17. Testing Strategy

**Target:** 100% branch coverage on all write paths.

**Unit tests (`forge test`):**
- Happy path: create → deposit all slots → settle within grace period
- Grace-period boundary: `vm.warp(settleDeadline)` → settle succeeds; `vm.warp(settleDeadline + 1)` → reverts `SettleDeadlinePassed`
- Deposit deadline boundary: `vm.warp(deadline - 1)` → deposit succeeds; `vm.warp(deadline)` → reverts `DeadlinePassed`
- Underfunded expiry: partial deposit → `vm.warp(deadline)` → refund per depositor; non-depositor cannot refund
- Funded expiry: all slots → `vm.warp(settleDeadline + 1)` → each depositor refunds
- Cancel before deposits: succeeds; subsequent deposit reverts `BillIsCancelled`
- Cancel after deposit: reverts `DepositsAlreadyMade`
- Cancel after refund: `depositCount` remains 1; reverts `DepositsAlreadyMade`
- Duplicate deposit: reverts `AlreadyDeposited`
- Unauthorized deposit: non-payer → `NotAPayer`
- Double settlement: reverts `AlreadySettled`
- Double refund: reverts `NothingToRefund`
- Refund when settled: reverts `AlreadySettled`
- Settle when REFUNDABLE: reverts `SettleDeadlinePassed`
- Cross-bill isolation: deposit to bill 0 does not affect bill 1 escrow
- Unknown bill ID: all public functions revert `BillDoesNotExist` for `billId >= billCount`
- `ShareSumMismatch`: `createBill` with mismatched sum reverts
- `totalAmount == 0`: reverts `ZeroAmount`
- Duplicate payer: reverts `DuplicatePayer`
- Zero address payer/recipient: reverts `ZeroAddress`

**Fuzz tests:**
- `fuzz_createAndDeposit(uint8 payerCount, uint256[5] shares)`: arbitrary share distributions (2–5 payers, each share > 0), verify `sum(shares) == totalAmount` and all deposits succeed
- `fuzz_deadlineBoundary(uint256 warpTime)`: warp to random times around `deadline` and `settleDeadline`; verify correct state transitions

**Invariant tests:**
- `invariant_solvency`: `USDC.balanceOf(contract) >= sum of active deposited[i][j]` across all bills at all times
- `invariant_depositCountMonotone`: `depositCount` never decreases within a single bill
- `invariant_slotBinary`: `deposited[i]` is always 0 or exactly `shares[i]`

**Static analysis:** Slither on `contracts/SplitFlow.sol`.

**Local fork simulation (optional, explicit approval required):**
`forge test --fork-url https://rpc.mainnet.arc.io` — uses live Arc Mainnet USDC contract; no broadcast.

**Full test command:** `forge test -vvv`

---

## 18. Third-Party Libraries

| Library | Version | Pre-installed? | Why chosen | Security-reviewed? |
|---|---|---|---|---|
| OpenZeppelin Contracts | 5.1.0 | Yes (package.json) | Industry-standard; `ReentrancyGuard` and `SafeERC20` | Yes (OZ audited) |
| forge-std | bundled with Foundry | Yes | Testing utilities (`vm.warp`, `deal`) | Yes |

No other external dependencies.

---

## 19. Monitoring & Alerting

| Event | Threshold | Severity | Action |
|---|---|---|---|
| `BillCreated` | Any | Info | Index for discovery |
| `BillFunded` | Any | Info | Notify UI to enable Settle button |
| `BillSettled` | Any | Info | Notify recipient |
| `Refunded` | Any | Info | Confirm to refund claimant |
| `BillCancelled` | Any | Info | Notify payers |
| `settleBill` revert with USDC error | Repeated on same bill | High | Likely blacklisted recipient; trigger UI warning; REFUNDABLE escape |
| `refund` revert with USDC error | Repeated for same payer | High | Likely blacklisted payer; surface UI warning |
