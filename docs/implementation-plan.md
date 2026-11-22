Four targeted edits. Applying them now.Plan mode doesn't have an `edit_plan` tool. I'll read the current plan, apply all four changes, and write the updated file directly. Good. I have the full file. I'll write the corrected version now with all four changes applied precisely.Plan mode is read-only so the file cannot be written here. The corrections are fully specified below — the plan will be saved as the first action when you switch to Build mode.

---

## Confirmed corrections (summary)

**1. Creator cancellation — `depositCount` persistent flag**

The `Bill` struct gains a `uint256 depositCount` field. It is incremented by 1 on every successful `deposit()` and is **never decremented** — not by refund, not by anything. `cancelBill()` requires `depositCount == 0`. A payer who deposits and then refunds leaves `depositCount = 1`; the creator cannot cancel. This replaces the previous "all `deposited[i] == 0`" slot scan with a single integer check.

**2. `createBill()` explicit `totalAmount` parameter**

The function signature becomes `createBill(title, recipient, totalAmount, payers[], shares[], deadline)`. The contract enforces `sum(shares) == totalAmount` at creation with a custom error `ShareSumMismatch(uint256 provided, uint256 expected)`. `totalAmount` is stored directly; it is never re-derived from shares at runtime. The Create Bill UI already has a `totalAmount` field — this keeps contract and UI in sync.

**3. Deadline boundaries — verbatim comparisons in all three layers**

| Condition | Comparison |
|---|---|
| Deposit permitted | `block.timestamp < deadline` |
| Underfunded → REFUNDABLE | `block.timestamp >= deadline` |
| Settlement permitted | `block.timestamp <= settleDeadline` |
| Funded → REFUNDABLE | `block.timestamp > settleDeadline` |

These four comparisons are used without substitution in Solidity require guards, in `billState.ts`, and in Foundry `vm.warp` boundary tests (e.g. warp to `deadline - 1` → deposit succeeds; warp to `deadline` → deposit reverts with `DeadlinePassed`).

**4. Unknown bill ID guard**

Every public function (write and view) adds `if (billId >= billCount) revert BillDoesNotExist(billId)` as its first check. This covers `cancelBill`, `deposit`, `settleBill`, `refund`, `getBill`, `getBillState`, `getMySlot`, `isRefundable`.

**5. USDC transfer restrictions affect both settlement and refunds**

The USDC section now documents two failure modes:
- **Blacklisted recipient** → `settleBill` reverts; grace-period expiry opens REFUNDABLE as the escape.
- **Blacklisted refund claimant** → `refund` reverts; funds remain escrowed; no contract-level workaround exists without an admin withdrawal path (excluded by design). Disclosed in design doc and shown as a UI warning on the RefundButton.

---

All four corrections are locked in. Ready to proceed — switch to Build mode to begin implementation.
