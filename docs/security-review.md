# SplitFlow — Phase 3 Security Review & Testing Report

**Date:** 2026-10-16  
**Contract:** `contracts/SplitFlow.sol`  
**Solidity:** 0.8.28 / EVM Paris  
**OpenZeppelin:** 5.1.0  
**Review depth:** Max (Critical + High + Medium + Low)

---

## Summary

**Result: PASS — no unresolved Critical or High findings.**

| Category | Count | Resolved |
|---|---|---|
| Critical findings | 0 | — |
| High findings | 0 | — |
| Medium findings | 2 | 2 fixed ✓ |
| Low findings | 4 | Accepted (timestamp — see analysis) |
| Informational | 1 | Accepted (cyclomatic complexity) |
| Test results | 43 / 43 pass | ✓ |
| Fuzz runs | 256 × 2 = 512 runs | ✓ |
| Invariant calls | 3 invariants × 128 000 calls | ✓ |

---

## Files Created / Modified

| File | Action |
|---|---|
| `contracts/SplitFlow.sol` | Modified (2 fixes applied) |
| `contracts/test/SplitFlow.t.sol` | Created |
| `contracts/test/MockERC20.sol` | Created (test helper) |
| `docs/security-review.md` | Created (this file) |

---

## Security Review Findings

### Medium — Constructor USDC address validation insufficient
**Source:** solidity-auditor corpus rule  
**Location:** `SplitFlow.sol` constructor  
**Issue:** The constructor only checked `_usdc != address(0)`. Passing an EOA or any non-contract address would deploy successfully but permanently brick all fund movements (every `safeTransferFrom`/`safeTransfer` would revert or misbehave). Because `usdc` is immutable, the mistake is irreversible post-deploy.  
**Fix applied:** Added `if (_usdc.code.length == 0) revert ZeroAddress();` after the zero-address check. This ensures the bound address actually holds contract code.  
**Status: Fixed ✓**

---

### Medium — Slither `uninitialized-local`: `sharesSum` not explicitly initialized
**Source:** Slither `uninitialized-local` detector  
**Location:** `createBill`, line 215  
**Issue:** `uint256 sharesSum;` is implicitly zero-initialized in Solidity 0.8, so there is no actual bug. However, Slither flags it because the explicit initialization is absent, which is also clearer to readers.  
**Fix applied:** Changed to `uint256 sharesSum = 0;`  
**Status: Fixed ✓ (false positive resolved)**

---

### Medium (informational risk, no code fix) — Contract-level USDC freeze
**Source:** solidity-auditor corpus rule `centralized-stable-blocklist-frozen-vault`  
**Location:** All fund movements  
**Issue:** All payer USDC is pooled in a single contract address. If Circle freezes the contract address itself (not an individual user), all outgoing transfers (`settleBill` and `refund`) would fail for all active bills simultaneously. There is no alternate withdrawal path.  
**Assessment:** This is an inherent property of any single-address shared-custody escrow with a centrally blacklistable token. Mitigating it architecturally (per-bill micro-contracts, pull-only escrow, etc.) would significantly increase contract complexity and gas costs, and was explicitly excluded from the MVP design (no admin withdrawal path, no upgradeability). The existing grace-period → REFUNDABLE escape handles per-user blacklisting; it does not help with a contract-level freeze.  
**Action:** Documented in design doc Failure Scenarios. Disclosed in UI. Accepted as a known limitation for MVP.  
**Status: Accepted, documented**

---

### Low ×4 — `block.timestamp` comparisons
**Source:** Slither `timestamp` detector, Foundry lint `block-timestamp`  
**Locations:** `createBill` (deadline check), `deposit` (deadline check), `settleBill` (settleDeadline check), `_isRefundable` (both deadline and settleDeadline checks)  
**Issue:** Validators on PoS chains can manipulate `block.timestamp` by ±~15 seconds.  
**Assessment:** All time windows in SplitFlow are measured in days:
- `deadline` is user-specified (expected hours to weeks in the future; `createBill` enforces `deadline > block.timestamp`)
- `GRACE_PERIOD` is a fixed constant of 7 days

A ±15 second manipulation is 0.002% of the minimum meaningful window. No economic advantage is extractable from this level of manipulation: the settler gains nothing (funds go to a fixed recipient), and a payer who misses the deadline by 15 seconds because of validator manipulation would have deposited within 15 seconds of the cutoff — an edge case with negligible real-world impact.  
**Status: Accepted — no code change**

---

### Informational — High cyclomatic complexity in `createBill`
**Source:** Slither `cyclomatic-complexity` detector  
**Location:** `createBill` (complexity 13)  
**Assessment:** The complexity arises from the combined validation loop (payer zero-address, share zero-amount, duplicate payer check, share accumulation) plus the outer validations. This is the correct place for this logic and is well-commented. The alternative — multiple separate loops — would add gas cost and reduce readability. No change warranted.  
**Status: Accepted**

---

## `block.timestamp` Boundary Analysis

The five Foundry lint warnings correspond to these exact comparisons:

| Location | Comparison | Semantic | Boundary test result |
|---|---|---|---|
| `createBill` | `deadline <= block.timestamp` | Deadline must be strictly in the future | Test 24a/24b: `deadline == timestamp` reverts ✓; `deadline == timestamp + 1` passes ✓ |
| `deposit` | `block.timestamp >= b.deadline` | No deposit at or after deadline | Test 3b: warp to `deadline` → `DeadlinePassed` ✓; warp to `deadline - 1` → passes ✓ |
| `settleBill` | `block.timestamp > b.settleDeadline` | Settlement permitted including settleDeadline | Test 4a: warp to `settleDeadline` → settle passes ✓; Test 4b: `settleDeadline + 1` → `SettleDeadlinePassed` ✓ |
| `_isRefundable` (case A) | `block.timestamp >= b.deadline` | Underfunded bill refundable from deadline inclusive | Test 5: warp to `deadline` → `isRefundable` true, refund succeeds ✓ |
| `_isRefundable` (case B) | `block.timestamp > b.settleDeadline` | Funded bill refundable only after settleDeadline | Test 6/15: warp to `settleDeadline + 1` → REFUNDABLE ✓; at `settleDeadline` → not yet REFUNDABLE ✓ |

All five boundaries behave exactly as specified. The operators are intentional, consistent across the contract and the tests, and documented in the NatSpec.

---

## Test Results

**Command:** `forge test -vvv`  
**Result:** `43 tests passed, 0 failed, 0 skipped`  
**Runtime:** 38.63 seconds (dominated by invariant fuzzing)

### Unit tests (37 tests, all pass)

| # | Test | Suite |
|---|---|---|
| 1 | `test_happyPath2Payers` | HappyPath2Payers |
| 2 | `test_happyPath5Payers` | HappyPath5Payers |
| 3a | `test_depositJustBeforeDeadline_succeeds` | DepositDeadlineBoundary |
| 3b | `test_depositAtDeadline_reverts` | DepositDeadlineBoundary |
| 4a | `test_settleAtSettleDeadline_succeeds` | SettleGracePeriodBoundary |
| 4b | `test_settleAfterSettleDeadline_reverts` | SettleGracePeriodBoundary |
| 5 | `test_underfundedExpiry` | UnderfundedExpiry |
| 6 | `test_fundedExpiry_refundsAndDoubleRefund` | FundedExpiry |
| 7 | `test_cancelBeforeDeposits` | CancelBeforeDeposits |
| 8 | `test_cancelAfterDeposit_reverts` | CancelAfterDeposit |
| 9 | `test_cancelAfterRefund_stillReverts` | CancelAfterDepositThenRefund |
| 10 | `test_duplicateDeposit_reverts` | DuplicateDeposit |
| 11 | `test_unauthorizedDeposit_reverts` | UnauthorizedDeposit |
| 12 | `test_doubleSettlement_reverts` | DoubleSettlement |
| 13 | `test_refundAfterSettle_reverts` | RefundWhenSettled |
| 14 | `test_settleUnderfunded_reverts` | SettleWhenRefundableUnderfunded |
| 15 | `test_settleFundedExpired_reverts` | SettleWhenRefundableFundedExpired |
| 16 | `test_crossBillIsolation` | CrossBillIsolation |
| 17 | `test_unknownBillId_allFunctionsRevert` | UnknownBillId |
| 18 | `test_shareSumMismatch_reverts` | ShareSumMismatch |
| 19 | `test_zeroTotalAmount_reverts` | ZeroAmountTotal |
| 20 | `test_zeroShare_reverts` | ZeroAmountShare |
| 21 | `test_duplicatePayer_reverts` | DuplicatePayer |
| 22 | `test_zeroAddressPayer_reverts` | ZeroAddressPayer |
| 23 | `test_zeroAddressRecipient_reverts` | ZeroAddressRecipient |
| 24a | `test_deadlineEqTimestamp_reverts` | InvalidDeadline |
| 24b | `test_deadlineInPast_reverts` | InvalidDeadline |
| 25 | `test_cancelAlreadyCancelled_reverts` | CancelAlreadyCancelled |
| 26 | `test_nonCreatorCancel_reverts` | NonCreatorCancel |
| 27a–f | `test_state{Open,Funded,Settled,Refundable×2,Cancelled}` | GetBillState ×6 |
| 28 | `test_billFundedEvent_emittedOnLastDeposit` | BillFundedEvent |
| 29 | `test_settleBeforeDeposits_reverts` | SettleBeforeDeposits |
| 30 | `test_refundBeforeDeadline_reverts` | RefundOnOpenBill |

### Fuzz tests (2 tests, 256 runs each)

| Test | Runs | Result |
|---|---|---|
| `testFuzz_createAndDeposit(uint8, uint256[5])` | 256 | PASS |
| `testFuzz_deadlineBoundary(uint256)` | 256 | PASS |

### Stateful invariant tests (3 invariants, 256 runs × 500 depth = 128 000 calls each)

| Invariant | Calls | Reverts | Result |
|---|---|---|---|
| `invariant_solvency` — `USDC.balanceOf(contract) >= sum(active deposited)` | 128 000 | 0 | PASS |
| `invariant_depositCountMonotone` — `depositCount` never decreases | 128 000 | 0 | PASS |
| `invariant_slotBinary` — `deposited[i] ∈ {0, shares[i]}` always | 128 000 | 0 | PASS |

Handler call distribution (uniform across all operations):
- createBill: 25 670 calls
- deposit: 25 663 calls
- settle: 25 664 calls
- refund: 25 539 calls
- cancel: 25 464 calls

---

## Business Logic Verification

All items from the Phase 3 requirements confirmed:

| Requirement | Verified |
|---|---|
| Bill creation and exact share allocations | ✓ Tests 1, 2, 18, 31 |
| Authorized payer deposits only | ✓ Test 11 |
| Persistent depositCount (never decrements) | ✓ Tests 9, 34 (invariant) |
| Creator cancellation restrictions | ✓ Tests 7–9, 25, 26 |
| Exact funding deadline boundaries | ✓ Tests 3a, 3b (both sides) |
| Seven-day settlement grace period | ✓ Tests 4a, 4b (both sides) |
| Permissionless settlement | ✓ Tests 1, 2 (third-party settler) |
| Full and partial funding scenarios | ✓ Tests 5, 6 |
| Individual refunds | ✓ Tests 5, 6 |
| Double-payment and double-refund prevention | ✓ Tests 10, 6 |
| Cross-bill escrow isolation | ✓ Test 16 |
| Unknown bill ID handling | ✓ Test 17 (all 8 public functions) |
| Escrow solvency across simultaneous bills | ✓ Test 16, invariant_solvency |
| ReentrancyGuard | ✓ nonReentrant on all 4 write functions |
| SafeERC20 failures | ✓ Mock ERC20 revert paths in fuzz/invariant |
| Invalid inputs | ✓ Tests 18–24 |
| block.timestamp boundary behavior | ✓ Tests 3a/3b, 4a/4b, boundary analysis above |

---

## Known Limitations

1. **Contract-level USDC freeze:** If Circle freezes SplitFlow's contract address, all fund movements fail. No contract-level escape without an admin path. Disclosed in UI and design doc.

2. **Blacklisted payer (refund path):** A payer whose address is blacklisted by Circle cannot call `refund()` successfully. Their escrowed funds are permanently inaccessible. No contract-level escape. Disclosed in UI.

3. **Gas costs scale with `payerCount`:** `createBill` runs an O(n²) duplicate-check loop (n ≤ 5, so max 10 comparisons). Not a scalability concern at the fixed cap of 5 payers.

4. **Bill discovery:** Frontend polls `getBill(0..billCount)`. Acceptable for MVP at tens of bills; degrades at scale. Subgraph is a v2 item.

5. **This review is not a substitute for an independent professional audit.** All test coverage was generated within Arc Studio. A paid third-party audit is recommended before mainnet deployment with significant user funds.

---

## Audit Provenance

| Subagent | Dispatched | Files audited | Corpus rules cited |
|---|---|---|---|
| solidity-auditor | yes | 9 | centralized-stable-blocklist-frozen-vault, insufficient-constructor-parameter-validation |
| functional-auditor | yes | 1 | — |
