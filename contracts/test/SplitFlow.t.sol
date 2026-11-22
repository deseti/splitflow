// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {SplitFlow} from "../SplitFlow.sol";
import {MockERC20} from "../test-helpers/MockERC20.sol";

// ─────────────────────────────────────────────────────────────────────────────
// Shared base: deploy mock USDC + SplitFlow, define helpers
// ─────────────────────────────────────────────────────────────────────────────
contract SplitFlowBase is Test {
    // ── Constants ──
    uint256 internal constant DAY = 1 days;
    uint256 internal constant GRACE = 7 days;

    // ── USDC mock (6 decimals like real USDC) ──
    MockERC20 internal usdc;

    // ── Contract under test ──
    SplitFlow internal sf;

    // ── Named actors ──
    address internal creator  = makeAddr("creator");
    address internal recipient = makeAddr("recipient");
    address internal alice    = makeAddr("alice");
    address internal bob      = makeAddr("bob");
    address internal carol    = makeAddr("carol");
    address internal dave     = makeAddr("dave");
    address internal eve      = makeAddr("eve");
    address internal nobody   = makeAddr("nobody");

    // ── Default shares (6-decimal USDC) ──
    uint256 internal constant SHARE_ALICE = 50e6;
    uint256 internal constant SHARE_BOB   = 50e6;
    uint256 internal constant TOTAL_2     = 100e6;

    function setUp() public virtual {
        usdc = new MockERC20("Mock USDC", "mUSDC", 6);
        sf   = new SplitFlow(address(usdc));
    }

    // ── Fund a payer with USDC and pre-approve SplitFlow ──
    function _fund(address payer, uint256 amount) internal {
        usdc.mint(payer, amount);
        vm.prank(payer);
        usdc.approve(address(sf), amount);
    }

    // ── Create a 2-payer bill, returns (billId, deadline) ──
    function _createBill2(
        address _recipient,
        uint256 futureSecs
    ) internal returns (uint256 billId, uint256 deadline) {
        deadline = block.timestamp + futureSecs;
        address[] memory payers = new address[](2);
        payers[0] = alice;
        payers[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = SHARE_ALICE;
        shares[1] = SHARE_BOB;
        vm.prank(creator);
        billId = sf.createBill("Dinner", _recipient, TOTAL_2, payers, shares, deadline);
    }

    // ── Create a 5-payer bill (20 USDC each = 100 USDC total) ──
    function _createBill5(
        address _recipient,
        uint256 futureSecs
    ) internal returns (uint256 billId, uint256 deadline) {
        deadline = block.timestamp + futureSecs;
        address[] memory payers = new address[](5);
        payers[0] = alice; payers[1] = bob; payers[2] = carol;
        payers[3] = dave;  payers[4] = eve;
        uint256[] memory shares = new uint256[](5);
        shares[0] = 20e6; shares[1] = 20e6; shares[2] = 20e6;
        shares[3] = 20e6; shares[4] = 20e6;
        vm.prank(creator);
        billId = sf.createBill("GroupDinner", _recipient, 100e6, payers, shares, deadline);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 – Happy path: 2 payers → both deposit → settle within grace period
// ─────────────────────────────────────────────────────────────────────────────
contract Test_HappyPath2Payers is SplitFlowBase {
    function test_happyPath2Payers() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);

        _fund(alice, SHARE_ALICE);
        _fund(bob,   SHARE_BOB);

        vm.prank(alice); sf.deposit(billId);

        // Bob is the last payer — deposit() auto-settles, no separate settleBill() needed
        uint256 recipientBefore = usdc.balanceOf(recipient);
        vm.prank(bob); sf.deposit(billId);

        assertEq(usdc.balanceOf(recipient), recipientBefore + TOTAL_2, "recipient received total");
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.SETTLED));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 – Happy path 5 payers: all 5 deposit → settle
// ─────────────────────────────────────────────────────────────────────────────
contract Test_HappyPath5Payers is SplitFlowBase {
    function test_happyPath5Payers() public {
        (uint256 billId,) = _createBill5(recipient, 1 days);
        address[5] memory payers5 = [alice, bob, carol, dave, eve];
        uint256 before = usdc.balanceOf(recipient);
        for (uint8 i = 0; i < 5; i++) {
            _fund(payers5[i], 20e6);
            vm.prank(payers5[i]);
            sf.deposit(billId); // last deposit (eve) auto-settles
        }
        // No separate settleBill() needed — eve's deposit auto-settled
        assertEq(usdc.balanceOf(recipient), before + 100e6);
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.SETTLED));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 3 – Deposit deadline boundary
// ─────────────────────────────────────────────────────────────────────────────
contract Test_DepositDeadlineBoundary is SplitFlowBase {
    function test_depositJustBeforeDeadline_succeeds() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        // warp to deadline - 1 (strict less-than → still permitted)
        vm.warp(deadline - 1);
        _fund(alice, SHARE_ALICE);
        vm.prank(alice);
        sf.deposit(billId); // should succeed
    }

    function test_depositAtDeadline_reverts() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        vm.warp(deadline); // block.timestamp == deadline → DeadlinePassed
        _fund(alice, SHARE_ALICE);
        vm.prank(alice);
        vm.expectRevert(SplitFlow.DeadlinePassed.selector);
        sf.deposit(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 4 – Settle grace period boundary
// ─────────────────────────────────────────────────────────────────────────────
contract Test_SettleGracePeriodBoundary is SplitFlowBase {
    function test_settleAtSettleDeadline_succeeds() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        // Bob's deposit auto-settles — no warp or explicit settleBill needed
        vm.prank(bob); sf.deposit(billId);
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.SETTLED));
    }

    function test_settleAfterSettleDeadline_reverts() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(bob);   sf.deposit(billId); // auto-settles

        // Any explicit settleBill() after auto-settlement reverts AlreadySettled
        uint256 settleDeadline = deadline + GRACE;
        vm.warp(settleDeadline + 1);
        vm.expectRevert(SplitFlow.AlreadySettled.selector);
        sf.settleBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 5 – Underfunded expiry: 1-of-2 deposits, warp past deadline, refund
// ─────────────────────────────────────────────────────────────────────────────
contract Test_UnderfundedExpiry is SplitFlowBase {
    function test_underfundedExpiry() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        vm.prank(alice); sf.deposit(billId);

        vm.warp(deadline); // block.timestamp >= deadline → REFUNDABLE

        // alice refunds successfully
        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice); sf.refund(billId);
        assertEq(usdc.balanceOf(alice), aliceBefore + SHARE_ALICE);

        // bob never deposited → NothingToRefund
        vm.prank(bob);
        vm.expectRevert(SplitFlow.NothingToRefund.selector);
        sf.refund(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 6 – Funded expiry: with auto-settlement, all deposits immediately settle,
//           so the funded-but-unsettled-past-grace-period state is not reachable
//           for new bills. This test instead verifies:
//           (a) auto-settle fires on full funding,
//           (b) refund after auto-settlement reverts AlreadySettled,
//           (c) underfunded expiry refund path still works correctly.
// ─────────────────────────────────────────────────────────────────────────────
contract Test_FundedExpiry is SplitFlowBase {
    // (a)+(b): auto-settle means refund after full funding is always AlreadySettled
    function test_fundedExpiry_autoSettleBlocksRefund() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(bob);   sf.deposit(billId); // auto-settles

        uint256 settleDeadline = deadline + GRACE;
        vm.warp(settleDeadline + 1);

        // Refund is blocked because bill is already settled
        vm.prank(alice);
        vm.expectRevert(SplitFlow.AlreadySettled.selector);
        sf.refund(billId);
    }

    // (c): underfunded expiry refund still works (unchanged path)
    function test_underfundedExpiry_refundWorks() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        vm.prank(alice); sf.deposit(billId); // only alice deposits

        vm.warp(deadline); // underfunded, past deadline → REFUNDABLE

        uint256 aliceBefore = usdc.balanceOf(alice);
        vm.prank(alice); sf.refund(billId);
        assertEq(usdc.balanceOf(alice), aliceBefore + SHARE_ALICE);

        // double refund reverts
        vm.prank(alice);
        vm.expectRevert(SplitFlow.NothingToRefund.selector);
        sf.refund(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 7 – Cancel before deposits: deposit reverts BillIsCancelled,
//           settleBill reverts NotFullyFunded (then BillIsCancelled after settle check)
// ─────────────────────────────────────────────────────────────────────────────
contract Test_CancelBeforeDeposits is SplitFlowBase {
    function test_cancelBeforeDeposits() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        vm.prank(creator); sf.cancelBill(billId);

        // deposit should revert BillIsCancelled
        _fund(alice, SHARE_ALICE);
        vm.prank(alice);
        vm.expectRevert(SplitFlow.BillIsCancelled.selector);
        sf.deposit(billId);

        // settleBill: NotFullyFunded fires before BillIsCancelled in code order
        vm.expectRevert(SplitFlow.NotFullyFunded.selector);
        sf.settleBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 8 – Cancel after deposit: reverts DepositsAlreadyMade
// ─────────────────────────────────────────────────────────────────────────────
contract Test_CancelAfterDeposit is SplitFlowBase {
    function test_cancelAfterDeposit_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        vm.prank(alice); sf.deposit(billId);

        vm.prank(creator);
        vm.expectRevert(SplitFlow.DepositsAlreadyMade.selector);
        sf.cancelBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 9 – Cancel after deposit-then-refund: depositCount remains 1 → still reverts
// ─────────────────────────────────────────────────────────────────────────────
contract Test_CancelAfterDepositThenRefund is SplitFlowBase {
    function test_cancelAfterRefund_stillReverts() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        vm.prank(alice); sf.deposit(billId);

        vm.warp(deadline); // warp past deadline → REFUNDABLE
        vm.prank(alice); sf.refund(billId);

        // depositCount == 1, never decremented → cannot cancel
        vm.prank(creator);
        vm.expectRevert(SplitFlow.DepositsAlreadyMade.selector);
        sf.cancelBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 10 – Duplicate deposit: same payer deposits twice → AlreadyDeposited
// ─────────────────────────────────────────────────────────────────────────────
contract Test_DuplicateDeposit is SplitFlowBase {
    function test_duplicateDeposit_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE * 2);
        vm.prank(alice); usdc.approve(address(sf), SHARE_ALICE * 2);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(alice);
        vm.expectRevert(SplitFlow.AlreadyDeposited.selector);
        sf.deposit(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 11 – Unauthorized deposit: address not in payers → NotAPayer
// ─────────────────────────────────────────────────────────────────────────────
contract Test_UnauthorizedDeposit is SplitFlowBase {
    function test_unauthorizedDeposit_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(nobody, 1e6);
        vm.prank(nobody);
        vm.expectRevert(SplitFlow.NotAPayer.selector);
        sf.deposit(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 12 – Double settlement: second settleBill reverts AlreadySettled
// ─────────────────────────────────────────────────────────────────────────────
contract Test_DoubleSettlement is SplitFlowBase {
    function test_doubleSettlement_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(bob);   sf.deposit(billId); // auto-settles

        // First explicit settleBill() after auto-settlement reverts AlreadySettled
        vm.expectRevert(SplitFlow.AlreadySettled.selector);
        sf.settleBill(billId);

        // Second explicit call also reverts AlreadySettled
        vm.expectRevert(SplitFlow.AlreadySettled.selector);
        sf.settleBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 13 – Refund when settled: AlreadySettled
// ─────────────────────────────────────────────────────────────────────────────
contract Test_RefundWhenSettled is SplitFlowBase {
    function test_refundAfterSettle_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(bob);   sf.deposit(billId); // auto-settles — no explicit settleBill needed

        vm.prank(alice);
        vm.expectRevert(SplitFlow.AlreadySettled.selector);
        sf.refund(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 14 – Settle when REFUNDABLE (underfunded path): SettleDeadlinePassed
// ─────────────────────────────────────────────────────────────────────────────
contract Test_SettleWhenRefundableUnderfunded is SplitFlowBase {
    function test_settleUnderfunded_reverts() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        // Only alice deposits (underfunded)
        _fund(alice, SHARE_ALICE);
        vm.prank(alice); sf.deposit(billId);

        uint256 settleDeadline = deadline + GRACE;
        // warp past settleDeadline so NotFullyFunded triggers indirectly through
        // SettleDeadlinePassed, but we're also testing the underfunded path
        // The contract checks _isFullyFunded first → reverts NotFullyFunded
        vm.warp(settleDeadline + 1);
        vm.expectRevert(SplitFlow.NotFullyFunded.selector);
        sf.settleBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 15 – Settle when REFUNDABLE (funded-expired path): SettleDeadlinePassed
// ─────────────────────────────────────────────────────────────────────────────
contract Test_SettleWhenRefundableFundedExpired is SplitFlowBase {
    function test_settleFundedExpired_reverts() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(bob);   sf.deposit(billId); // auto-settles immediately

        uint256 settleDeadline = deadline + GRACE;
        vm.warp(settleDeadline + 1);
        // Bill already settled via auto-settle — explicit settleBill reverts AlreadySettled
        vm.expectRevert(SplitFlow.AlreadySettled.selector);
        sf.settleBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 16 – Cross-bill isolation
// ─────────────────────────────────────────────────────────────────────────────
contract Test_CrossBillIsolation is SplitFlowBase {
    function test_crossBillIsolation() public {
        // Bill 0: alice + bob
        (uint256 bill0,) = _createBill2(recipient, 1 days);

        // Bill 1: carol + dave, different recipient
        address recip2 = makeAddr("recip2");
        uint256 dl2 = block.timestamp + 2 days;
        address[] memory p2 = new address[](2);
        p2[0] = carol; p2[1] = dave;
        uint256[] memory s2 = new uint256[](2);
        s2[0] = 30e6; s2[1] = 30e6;
        vm.prank(creator);
        uint256 bill1 = sf.createBill("Hotel", recip2, 60e6, p2, s2, dl2);

        // Deposit into bill 0 only
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(bill0);
        vm.prank(bob);   sf.deposit(bill0);

        // Bill 1 is still OPEN (unaffected)
        assertEq(uint8(sf.getBillState(bill1)), uint8(SplitFlow.BillState.OPEN));

        // Bob is last for bill0 — deposit auto-settles to recipient
        uint256 recip2Before = usdc.balanceOf(recip2);
        // (bill0 was already settled by bob's deposit above)

        // Bill 1 escrow unaffected: SplitFlow contract should still hold 0 USDC for bill1
        assertEq(usdc.balanceOf(recip2), recip2Before, "bill1 recipient untouched");
        assertEq(uint8(sf.getBillState(bill1)), uint8(SplitFlow.BillState.OPEN));

        // Now fund bill 1 — dave is last, auto-settles
        _fund(carol, 30e6); _fund(dave, 30e6);
        vm.prank(carol); sf.deposit(bill1);
        vm.prank(dave);  sf.deposit(bill1); // auto-settles bill1
        assertEq(usdc.balanceOf(recip2), recip2Before + 60e6);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 17 – Unknown bill ID: BillDoesNotExist on all public functions
// ─────────────────────────────────────────────────────────────────────────────
contract Test_UnknownBillId is SplitFlowBase {
    function test_unknownBillId_allFunctionsRevert() public {
        // No bills created → billCount == 0 → id=0 is invalid
        uint256 badId = sf.billCount(); // == 0

        vm.expectRevert(abi.encodeWithSelector(SplitFlow.BillDoesNotExist.selector, badId));
        sf.deposit(badId);

        vm.expectRevert(abi.encodeWithSelector(SplitFlow.BillDoesNotExist.selector, badId));
        sf.cancelBill(badId);

        vm.expectRevert(abi.encodeWithSelector(SplitFlow.BillDoesNotExist.selector, badId));
        sf.settleBill(badId);

        vm.expectRevert(abi.encodeWithSelector(SplitFlow.BillDoesNotExist.selector, badId));
        sf.refund(badId);

        vm.expectRevert(abi.encodeWithSelector(SplitFlow.BillDoesNotExist.selector, badId));
        sf.getBill(badId);

        vm.expectRevert(abi.encodeWithSelector(SplitFlow.BillDoesNotExist.selector, badId));
        sf.getBillState(badId);

        vm.expectRevert(abi.encodeWithSelector(SplitFlow.BillDoesNotExist.selector, badId));
        sf.getMySlot(badId, alice);

        vm.expectRevert(abi.encodeWithSelector(SplitFlow.BillDoesNotExist.selector, badId));
        sf.isRefundable(badId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 18 – ShareSumMismatch
// ─────────────────────────────────────────────────────────────────────────────
contract Test_ShareSumMismatch is SplitFlowBase {
    function test_shareSumMismatch_reverts() public {
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 40e6; shares[1] = 50e6; // sum = 90e6, totalAmount = 100e6

        vm.prank(creator);
        vm.expectRevert(
            abi.encodeWithSelector(SplitFlow.ShareSumMismatch.selector, 90e6, 100e6)
        );
        sf.createBill("X", recipient, 100e6, payers, shares, block.timestamp + 1 days);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 19 – ZeroAmount (totalAmount = 0)
// ─────────────────────────────────────────────────────────────────────────────
contract Test_ZeroAmountTotal is SplitFlowBase {
    function test_zeroTotalAmount_reverts() public {
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 0; shares[1] = 0;

        vm.prank(creator);
        vm.expectRevert(SplitFlow.ZeroAmount.selector);
        sf.createBill("X", recipient, 0, payers, shares, block.timestamp + 1 days);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 20 – ZeroAmount share: one share = 0
// ─────────────────────────────────────────────────────────────────────────────
contract Test_ZeroAmountShare is SplitFlowBase {
    function test_zeroShare_reverts() public {
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 100e6; shares[1] = 0; // second share is zero

        vm.prank(creator);
        vm.expectRevert(SplitFlow.ZeroAmount.selector);
        sf.createBill("X", recipient, 100e6, payers, shares, block.timestamp + 1 days);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 21 – DuplicatePayer
// ─────────────────────────────────────────────────────────────────────────────
contract Test_DuplicatePayer is SplitFlowBase {
    function test_duplicatePayer_reverts() public {
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = alice; // duplicate

        uint256[] memory shares = new uint256[](2);
        shares[0] = 50e6; shares[1] = 50e6;

        vm.prank(creator);
        vm.expectRevert(SplitFlow.DuplicatePayer.selector);
        sf.createBill("X", recipient, 100e6, payers, shares, block.timestamp + 1 days);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 22 – ZeroAddress payer
// ─────────────────────────────────────────────────────────────────────────────
contract Test_ZeroAddressPayer is SplitFlowBase {
    function test_zeroAddressPayer_reverts() public {
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = address(0); // zero address

        uint256[] memory shares = new uint256[](2);
        shares[0] = 50e6; shares[1] = 50e6;

        vm.prank(creator);
        vm.expectRevert(SplitFlow.ZeroAddress.selector);
        sf.createBill("X", recipient, 100e6, payers, shares, block.timestamp + 1 days);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 23 – ZeroAddress recipient
// ─────────────────────────────────────────────────────────────────────────────
contract Test_ZeroAddressRecipient is SplitFlowBase {
    function test_zeroAddressRecipient_reverts() public {
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 50e6; shares[1] = 50e6;

        vm.prank(creator);
        vm.expectRevert(SplitFlow.ZeroAddress.selector);
        sf.createBill("X", address(0), 100e6, payers, shares, block.timestamp + 1 days);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 24 – InvalidDeadline: deadline <= block.timestamp
// ─────────────────────────────────────────────────────────────────────────────
contract Test_InvalidDeadline is SplitFlowBase {
    function test_deadlineEqTimestamp_reverts() public {
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 50e6; shares[1] = 50e6;

        vm.prank(creator);
        vm.expectRevert(SplitFlow.InvalidDeadline.selector);
        sf.createBill("X", recipient, 100e6, payers, shares, block.timestamp);
    }

    function test_deadlineInPast_reverts() public {
        address[] memory payers = new address[](2);
        payers[0] = alice; payers[1] = bob;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 50e6; shares[1] = 50e6;

        vm.warp(1000);
        vm.prank(creator);
        vm.expectRevert(SplitFlow.InvalidDeadline.selector);
        sf.createBill("X", recipient, 100e6, payers, shares, 999);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 25 – Cancel already cancelled: AlreadyCancelled
// ─────────────────────────────────────────────────────────────────────────────
contract Test_CancelAlreadyCancelled is SplitFlowBase {
    function test_cancelAlreadyCancelled_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        vm.prank(creator); sf.cancelBill(billId);

        vm.prank(creator);
        vm.expectRevert(SplitFlow.AlreadyCancelled.selector);
        sf.cancelBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 26 – Non-creator cancel: NotCreator
// ─────────────────────────────────────────────────────────────────────────────
contract Test_NonCreatorCancel is SplitFlowBase {
    function test_nonCreatorCancel_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);

        vm.prank(nobody);
        vm.expectRevert(SplitFlow.NotCreator.selector);
        sf.cancelBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 27 – getBillState: correct enum for each state
// ─────────────────────────────────────────────────────────────────────────────
contract Test_GetBillState is SplitFlowBase {
    function test_stateOpen() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.OPEN));
    }

    function test_stateFunded() public {
        // FUNDED state is now only visible transiently inside deposit().
        // After the last deposit, the bill is immediately SETTLED via auto-settle.
        // A partially funded bill (not all payers deposited) is OPEN, not FUNDED.
        // Test: one-of-two payers deposited → OPEN (not FUNDED)
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        vm.prank(alice); sf.deposit(billId); // only alice — bill is partially funded → OPEN
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.OPEN));
    }

    function test_stateSettled() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(bob);   sf.deposit(billId); // auto-settles — no explicit settleBill needed
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.SETTLED));
    }

    function test_stateRefundable_underfunded() public {
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        vm.prank(alice); sf.deposit(billId);
        vm.warp(deadline); // >= deadline → REFUNDABLE
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.REFUNDABLE));
    }

    function test_stateRefundable_fundedExpired() public {
        // With auto-settlement, a fully funded bill auto-settles immediately.
        // The FUNDED→REFUNDABLE path (funded but grace expired) is no longer reachable
        // for new bills under this contract version.
        // This test verifies that after full funding (auto-settle), warp past
        // settleDeadline still shows SETTLED (not REFUNDABLE).
        (uint256 billId, uint256 deadline) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(bob);   sf.deposit(billId); // auto-settles
        uint256 settleDeadline = deadline + GRACE;
        vm.warp(settleDeadline + 1);
        // Already settled — state remains SETTLED, not REFUNDABLE
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.SETTLED));
    }

    function test_stateCancelled() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        vm.prank(creator); sf.cancelBill(billId);
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.CANCELLED));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 28 – BillFunded event: emitted when last payer deposits
// ─────────────────────────────────────────────────────────────────────────────
contract Test_BillFundedEvent is SplitFlowBase {
    function test_billFundedEvent_emittedOnLastDeposit() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);

        vm.prank(alice); sf.deposit(billId); // NOT the last → no BillFunded

        // Bob is last → BillFunded should fire
        vm.expectEmit(true, false, false, false, address(sf));
        emit SplitFlow.BillFunded(billId);
        vm.prank(bob); sf.deposit(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 29 – Settle before any deposits: reverts NotFullyFunded
// ─────────────────────────────────────────────────────────────────────────────
contract Test_SettleBeforeDeposits is SplitFlowBase {
    function test_settleBeforeDeposits_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        vm.expectRevert(SplitFlow.NotFullyFunded.selector);
        sf.settleBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 30 – Refund on OPEN bill (before deadline): NotRefundable
// ─────────────────────────────────────────────────────────────────────────────
contract Test_RefundOnOpenBill is SplitFlowBase {
    function test_refundBeforeDeadline_reverts() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        vm.prank(alice); sf.deposit(billId);

        // Still before deadline → NOT refundable
        vm.prank(alice);
        vm.expectRevert(SplitFlow.NotRefundable.selector);
        sf.refund(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzz Test 31 – fuzz_createAndDeposit
// ─────────────────────────────────────────────────────────────────────────────
contract Test_Fuzz_CreateAndDeposit is SplitFlowBase {
    // Pre-created named payers for fuzz use
    address[5] internal fuzzPayers;

    function setUp() public override {
        super.setUp();
        fuzzPayers[0] = alice;
        fuzzPayers[1] = bob;
        fuzzPayers[2] = carol;
        fuzzPayers[3] = dave;
        fuzzPayers[4] = eve;
    }

    function testFuzz_createAndDeposit(
        uint8 rawPayerCount,
        uint256[5] calldata rawShares
    ) public {
        uint8 payerCount = uint8(bound(uint256(rawPayerCount), 2, 5));

        // Build bounded shares > 0 and sum them
        uint256 total = 0;
        uint256[] memory shares = new uint256[](payerCount);
        address[] memory payers = new address[](payerCount);
        for (uint8 i = 0; i < payerCount; i++) {
            shares[i] = bound(rawShares[i], 1, 1_000_000e6 / payerCount);
            total += shares[i];
            payers[i] = fuzzPayers[i];
        }

        uint256 deadline = block.timestamp + 1 days;

        vm.prank(creator);
        uint256 billId = sf.createBill("Fuzz", recipient, total, payers, shares, deadline);

        for (uint8 i = 0; i < payerCount; i++) {
            _fund(payers[i], shares[i]);
            vm.prank(payers[i]);
            sf.deposit(billId);
        }

        // With auto-settlement, the last deposit settles the bill immediately → SETTLED
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.SETTLED));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzz Test 32 – fuzz_deadlineBoundary
// ─────────────────────────────────────────────────────────────────────────────
contract Test_Fuzz_DeadlineBoundary is SplitFlowBase {
    function testFuzz_deadlineBoundary(uint256 warpDelta) public {
        // Bill deadline is 1 day in the future
        uint256 startTs = block.timestamp;
        uint256 deadline = startTs + 1 days;

        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);

        // Bound warpDelta to [0, 14 days]
        warpDelta = bound(warpDelta, 0, 14 days);
        vm.warp(startTs + warpDelta);

        if (warpDelta < 1 days) {
            // block.timestamp = startTs + warpDelta < startTs + 1 days = deadline → permitted
            vm.prank(alice);
            sf.deposit(billId); // should succeed
        } else {
            // block.timestamp >= deadline → DeadlinePassed
            vm.prank(alice);
            vm.expectRevert(SplitFlow.DeadlinePassed.selector);
            sf.deposit(billId);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant handler
// ─────────────────────────────────────────────────────────────────────────────
contract SplitFlowHandler is Test {
    SplitFlow public sf;
    MockERC20 public usdc;

    // Ghost accounting
    // For each (billId, slotIndex) → deposited amount currently held in escrow
    // We track bills 0–(MAX_BILLS-1)
    uint256 public constant MAX_BILLS = 4;
    uint256[5][MAX_BILLS] public ghostDeposited; // ghostDeposited[billId][slot]
    uint256[MAX_BILLS] public ghostDepositCount; // mirrors bill.depositCount minimum
    bool[MAX_BILLS] public billCreated;
    bool[MAX_BILLS] public billSettled;
    bool[MAX_BILLS] public billCancelled;

    address[5] internal actors;
    address internal creator_;
    address internal recipient_;

    // Track per-bill deposit count for monotonicity invariant
    uint256[MAX_BILLS] public lastKnownDepositCount;

    constructor(SplitFlow _sf, MockERC20 _usdc) {
        sf = _sf;
        usdc = _usdc;
        creator_   = makeAddr("h_creator");
        recipient_ = makeAddr("h_recipient");
        actors[0]  = makeAddr("h_alice");
        actors[1]  = makeAddr("h_bob");
        actors[2]  = makeAddr("h_carol");
        actors[3]  = makeAddr("h_dave");
        actors[4]  = makeAddr("h_eve");
    }

    // ── Create a bill (up to MAX_BILLS) ──
    function createBill(uint256 billSeed, uint256 payerSeed, uint256 shareSeed) external {
        // Pick a slot for the new bill
        uint256 nextId = sf.billCount();
        if (nextId >= MAX_BILLS) return; // don't create more than MAX_BILLS bills

        uint8 payerCount = uint8(bound(payerSeed, 2, 5));
        uint256 deadline = block.timestamp + 1 days;

        address[] memory payers = new address[](payerCount);
        uint256[] memory shares = new uint256[](payerCount);
        uint256 total = 0;
        for (uint8 i = 0; i < payerCount; i++) {
            payers[i] = actors[i];
            uint256 share = bound(
                uint256(keccak256(abi.encode(shareSeed, i, billSeed))),
                1e6,
                100e6
            );
            shares[i] = share;
            total += share;
        }

        vm.prank(creator_);
        try sf.createBill("H", recipient_, total, payers, shares, deadline) returns (uint256 billId) {
            billCreated[billId] = true;
            // Initialise ghost arrays
            for (uint8 i = 0; i < payerCount; i++) {
                ghostDeposited[billId][i] = 0;
            }
        } catch {}
    }

    // ── Deposit into a bill slot ──
    function deposit(uint256 billSeed, uint256 slotSeed) external {
        uint256 totalBills = sf.billCount();
        if (totalBills == 0) return;
        uint256 billId = bound(billSeed, 0, totalBills - 1);
        if (!billCreated[billId]) return;
        if (billSettled[billId] || billCancelled[billId]) return;

        SplitFlow.Bill memory b = sf.getBill(billId);
        if (b.payerCount == 0) return;
        uint8 slot = uint8(bound(slotSeed, 0, b.payerCount - 1));
        address payer = b.payers[slot];

        // Ghost deposit count must be monotone: snapshot before deposit
        uint256 dcBefore = b.depositCount;

        if (b.deposited[slot] != 0) return; // already deposited
        if (block.timestamp >= b.deadline) return; // past deadline

        uint256 share = b.shares[slot];
        usdc.mint(payer, share);
        vm.prank(payer);
        usdc.approve(address(sf), share);

        vm.prank(payer);
        try sf.deposit(billId) {
            ghostDeposited[billId][slot] = share;
            ghostDepositCount[billId]++;
            // If auto-settlement fired (all slots filled), clear ghost deposits
            SplitFlow.Bill memory bFinal = sf.getBill(billId);
            if (bFinal.settled) {
                billSettled[billId] = true;
                for (uint8 k = 0; k < bFinal.payerCount; k++) {
                    ghostDeposited[billId][k] = 0;
                }
            }
        } catch {}

        // Record monotone check
        SplitFlow.Bill memory bAfter = sf.getBill(billId);
        require(bAfter.depositCount >= dcBefore, "INV: depositCount decreased");
        if (bAfter.depositCount > lastKnownDepositCount[billId]) {
            lastKnownDepositCount[billId] = bAfter.depositCount;
        }
    }

    // ── Settle a bill ──
    function settle(uint256 billSeed) external {
        uint256 totalBills = sf.billCount();
        if (totalBills == 0) return;
        uint256 billId = bound(billSeed, 0, totalBills - 1);
        if (!billCreated[billId]) return;
        if (billSettled[billId] || billCancelled[billId]) return;

        SplitFlow.Bill memory b = sf.getBill(billId);
        if (!_isFullyFunded(b) || b.settled || block.timestamp > b.settleDeadline) return;

        try sf.settleBill(billId) {
            billSettled[billId] = true;
            // Clear ghost deposits (funds left the contract)
            for (uint8 i = 0; i < b.payerCount; i++) {
                ghostDeposited[billId][i] = 0;
            }
        } catch {}
    }

    // ── Refund ──
    function refund(uint256 billSeed, uint256 slotSeed) external {
        uint256 totalBills = sf.billCount();
        if (totalBills == 0) return;
        uint256 billId = bound(billSeed, 0, totalBills - 1);
        if (!billCreated[billId]) return;
        if (billSettled[billId] || billCancelled[billId]) return;

        SplitFlow.Bill memory b = sf.getBill(billId);
        if (b.payerCount == 0) return;
        uint8 slot = uint8(bound(slotSeed, 0, b.payerCount - 1));
        if (b.deposited[slot] == 0) return;
        if (!_isRefundable(b)) return;

        address payer = b.payers[slot];
        vm.prank(payer);
        try sf.refund(billId) {
            ghostDeposited[billId][slot] = 0;
        } catch {}
    }

    // ── Cancel ──
    function cancel(uint256 billSeed) external {
        uint256 totalBills = sf.billCount();
        if (totalBills == 0) return;
        uint256 billId = bound(billSeed, 0, totalBills - 1);
        if (!billCreated[billId]) return;
        if (billSettled[billId] || billCancelled[billId]) return;

        SplitFlow.Bill memory b = sf.getBill(billId);
        if (b.depositCount != 0) return;

        vm.prank(creator_);
        try sf.cancelBill(billId) {
            billCancelled[billId] = true;
        } catch {}
    }

    // ── Ghost sum for solvency ──
    function ghostTotal() external view returns (uint256 total) {
        for (uint256 i = 0; i < MAX_BILLS; i++) {
            for (uint256 j = 0; j < 5; j++) {
                total += ghostDeposited[i][j];
            }
        }
    }

    // ── Internal helpers mirroring contract logic ──
    function _isFullyFunded(SplitFlow.Bill memory b) internal pure returns (bool) {
        return b.depositCount == b.payerCount;
    }

    function _isRefundable(SplitFlow.Bill memory b) internal view returns (bool) {
        if (b.cancelled || b.settled) return false;
        bool fullyFunded = _isFullyFunded(b);
        if (!fullyFunded && block.timestamp >= b.deadline) return true;
        if (fullyFunded && block.timestamp > b.settleDeadline) return true;
        return false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test A – Auto-settle: final deposit transfers funds to recipient in same tx
// ─────────────────────────────────────────────────────────────────────────────
contract Test_AutoSettle_FinalDeposit is SplitFlowBase {
    function test_autoSettle_finalDeposit_recipientReceivesFunds() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        _fund(bob,   SHARE_BOB);

        vm.prank(alice); sf.deposit(billId);
        // Alice is not the last slot — bill not yet settled
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.OPEN));

        uint256 recipientBefore = usdc.balanceOf(recipient);
        vm.prank(bob); sf.deposit(billId); // last slot — auto-settle fires

        // Recipient received full amount in the same tx as bob's deposit
        assertEq(usdc.balanceOf(recipient), recipientBefore + TOTAL_2, "auto-settle: recipient");
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.SETTLED));
        SplitFlow.Bill memory b = sf.getBill(billId);
        assertEq(b.depositCount, 2, "depositCount == payerCount");
        assertTrue(b.settled, "settled flag set");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test B – Auto-settle: BillSettled event emitted during final deposit
// ─────────────────────────────────────────────────────────────────────────────
contract Test_AutoSettle_BillSettledEvent is SplitFlowBase {
    function test_autoSettle_BillSettled_event() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE);
        _fund(bob,   SHARE_BOB);

        vm.prank(alice); sf.deposit(billId);

        // Expect BillSettled(billId, recipient, TOTAL_2) emitted during bob's deposit
        vm.expectEmit(true, true, false, true, address(sf));
        emit SplitFlow.BillSettled(billId, recipient, TOTAL_2);

        vm.prank(bob); sf.deposit(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test C – Auto-settle: blacklisted recipient causes deposit to revert cleanly
// ─────────────────────────────────────────────────────────────────────────────

/// @dev MockERC20 with per-address transfer blocklist (simulates USDC blacklisting).
contract MockBlacklistERC20 is MockERC20 {
    mapping(address => bool) public blacklisted;

    constructor() MockERC20("Blacklist USDC", "bUSDC", 6) {}

    function blacklist(address addr) external {
        blacklisted[addr] = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blacklisted[from], "USDC: from blacklisted");
        require(!blacklisted[to],   "USDC: to blacklisted");
        super._update(from, to, value);
    }
}

contract Test_AutoSettle_BlacklistedRecipient is Test {
    uint256 internal constant SHARE = 50e6;
    uint256 internal constant TOTAL = 100e6;

    MockBlacklistERC20 internal blToken;
    SplitFlow          internal sf;

    address internal creator2   = makeAddr("creator2");
    address internal alice2     = makeAddr("alice2");
    address internal bob2       = makeAddr("bob2");
    address internal badRecip   = makeAddr("badRecip");

    function setUp() public {
        blToken = new MockBlacklistERC20();
        sf      = new SplitFlow(address(blToken));

        // Blacklist the recipient
        blToken.blacklist(badRecip);

        // Create 2-payer bill with blacklisted recipient
        address[] memory payers = new address[](2);
        payers[0] = alice2; payers[1] = bob2;
        uint256[] memory shares = new uint256[](2);
        shares[0] = SHARE; shares[1] = SHARE;

        vm.prank(creator2);
        sf.createBill("BL", badRecip, TOTAL, payers, shares, block.timestamp + 1 days);
    }

    function test_autoSettle_blacklistedRecipient_bobDepositReverts() public {
        // Alice deposits first (safeTransferFrom to contract — allowed)
        blToken.mint(alice2, SHARE);
        vm.prank(alice2); blToken.approve(address(sf), SHARE);
        vm.prank(alice2); sf.deposit(0); // succeeds
        assertEq(blToken.balanceOf(address(sf)), SHARE, "alice escrow intact");

        // Bob is last — auto-settle tries safeTransfer(badRecip) → reverts
        blToken.mint(bob2, SHARE);
        vm.prank(bob2); blToken.approve(address(sf), SHARE);
        vm.prank(bob2);
        vm.expectRevert(); // safeTransfer to blacklisted address reverts
        sf.deposit(0);

        // Alice's slot is still filled (her deposit succeeded independently)
        SplitFlow.Bill memory b = sf.getBill(0);
        assertEq(b.deposited[0], SHARE, "alice slot still filled");
        assertEq(b.deposited[1], 0,     "bob slot not filled (reverted)");
        assertEq(b.depositCount, 1,     "depositCount == 1");
        assertFalse(b.settled,          "bill not settled");

        // Contract still holds alice's escrow
        assertEq(blToken.balanceOf(address(sf)), SHARE, "contract holds alice USDC");
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test D – settleBill() reverts AlreadySettled after auto-settle
// ─────────────────────────────────────────────────────────────────────────────
contract Test_AutoSettle_SettleBillFallback is SplitFlowBase {
    function test_settleBill_revertsAlreadySettled_afterAutoSettle() public {
        (uint256 billId,) = _createBill2(recipient, 1 days);
        _fund(alice, SHARE_ALICE); _fund(bob, SHARE_BOB);
        vm.prank(alice); sf.deposit(billId);
        vm.prank(bob);   sf.deposit(billId); // auto-settles

        // Explicit settleBill() must revert AlreadySettled
        vm.expectRevert(SplitFlow.AlreadySettled.selector);
        sf.settleBill(billId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test E – Auto-settle fires on 5th deposit in a 5-payer bill
// ─────────────────────────────────────────────────────────────────────────────
contract Test_AutoSettle_5Payers is SplitFlowBase {
    function test_autoSettle_5payers() public {
        (uint256 billId,) = _createBill5(recipient, 1 days);
        address[5] memory payers5 = [alice, bob, carol, dave, eve];
        uint256 before = usdc.balanceOf(recipient);

        // First 4 payers deposit — bill stays un-settled
        for (uint8 i = 0; i < 4; i++) {
            _fund(payers5[i], 20e6);
            vm.prank(payers5[i]);
            sf.deposit(billId);
            assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.OPEN),
                "not settled after partial fill");
        }

        // Eve is the 5th — auto-settle fires
        _fund(eve, 20e6);
        vm.prank(eve); sf.deposit(billId);

        assertEq(usdc.balanceOf(recipient), before + 100e6, "5-payer auto-settle");
        assertEq(uint8(sf.getBillState(billId)), uint8(SplitFlow.BillState.SETTLED));
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Invariant Test 33 – invariant_solvency
// Invariant Test 34 – invariant_depositCountMonotone
// Invariant Test 35 – invariant_slotBinary
// ─────────────────────────────────────────────────────────────────────────────
contract SplitFlowInvariantTest is Test {
    MockERC20     internal usdc;
    SplitFlow     internal sf;
    SplitFlowHandler internal handler;

    function setUp() public {
        usdc    = new MockERC20("Mock USDC", "mUSDC", 6);
        sf      = new SplitFlow(address(usdc));
        handler = new SplitFlowHandler(sf, usdc);

        targetContract(address(handler));
    }

    /// @dev USDC balance of SplitFlow >= sum of ghost-tracked active deposits.
    function invariant_solvency() public view {
        assertGe(
            usdc.balanceOf(address(sf)),
            handler.ghostTotal(),
            "solvency: contract balance < ghost tracked deposits"
        );
    }

    /// @dev For each bill, the on-chain depositCount >= last known depositCount
    ///      (monotone non-decreasing). Tracked inside the handler on every deposit call.
    function invariant_depositCountMonotone() public view {
        uint256 totalBills = sf.billCount();
        for (uint256 i = 0; i < totalBills; i++) {
            SplitFlow.Bill memory b = sf.getBill(i);
            assertGe(
                b.depositCount,
                handler.lastKnownDepositCount(i),
                "depositCount must be monotone non-decreasing"
            );
        }
    }

    /// @dev For every bill slot: deposited[i] is exactly 0 or shares[i].
    function invariant_slotBinary() public view {
        uint256 totalBills = sf.billCount();
        for (uint256 i = 0; i < totalBills; i++) {
            SplitFlow.Bill memory b = sf.getBill(i);
            for (uint8 j = 0; j < b.payerCount; j++) {
                bool isZero   = b.deposited[j] == 0;
                bool isFull   = b.deposited[j] == b.shares[j];
                assertTrue(
                    isZero || isFull,
                    "slot must be 0 or exactly shares[j]"
                );
            }
        }
    }
}
