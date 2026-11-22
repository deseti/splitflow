// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SplitFlow
 * @notice Shared USDC bill escrow with conditional settlement and grace-period refunds.
 *
 * @dev Life-cycle of a bill:
 *
 *   OPEN ──────────────────────────────────────────→ CANCELLED  (creator, depositCount == 0)
 *   OPEN → (block.timestamp >= deadline, underfunded) → REFUNDABLE
 *   OPEN → FUNDED → (block.timestamp <= settleDeadline) → SETTLED
 *   OPEN → FUNDED → (block.timestamp > settleDeadline, unsettled) → REFUNDABLE
 *
 * Exact boundary rules (applied identically here, in billState.ts, and in tests):
 *   deposit  permitted:  block.timestamp < deadline
 *   underfunded → REFUNDABLE: block.timestamp >= deadline
 *   settlement permitted:  block.timestamp <= settleDeadline
 *   funded → REFUNDABLE:   block.timestamp > settleDeadline
 *
 * Security: ReentrancyGuard + SafeERC20 + strict CEI on every write function.
 * No owner. No admin withdrawal. No upgrade proxy.
 */
contract SplitFlow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────

    /// @notice Fixed settlement grace period added to every bill's funding deadline.
    uint256 public constant GRACE_PERIOD = 7 days;

    /// @notice Maximum number of payers per bill.
    uint8 public constant MAX_PAYERS = 5;

    /// @notice Minimum number of payers per bill.
    uint8 public constant MIN_PAYERS = 2;

    // ─────────────────────────────────────────────
    // Immutables
    // ─────────────────────────────────────────────

    /// @notice The ERC-20 USDC token contract used for all escrow operations.
    IERC20 public immutable usdc;

    // ─────────────────────────────────────────────
    // State enum
    // ─────────────────────────────────────────────

    enum BillState {
        OPEN,
        FUNDED,
        SETTLED,
        REFUNDABLE,
        CANCELLED
    }

    // ─────────────────────────────────────────────
    // Storage
    // ─────────────────────────────────────────────

    /**
     * @dev Core bill struct. Stored in the `bills` mapping.
     *
     * `depositCount` is monotonically non-decreasing: incremented on every successful
     * deposit and NEVER decremented. Cancel requires depositCount == 0. A payer who
     * deposits and later refunds leaves depositCount == 1, permanently blocking cancel.
     *
     * `deposited[i]` is always 0 or exactly shares[i] — no partial fills permitted.
     *
     * `totalAmount` is explicit at creation and must equal sum(shares). It is stored
     * directly and never re-derived from the shares array at runtime.
     */
    struct Bill {
        string title;
        address creator;
        address recipient;
        /// @dev Explicit totalAmount; must equal sum(shares) at creation (6-decimal USDC).
        uint256 totalAmount;
        /// @dev Funding deadline. Deposits require block.timestamp < deadline.
        uint256 deadline;
        /// @dev deadline + GRACE_PERIOD. Settlement requires block.timestamp <= settleDeadline.
        uint256 settleDeadline;
        uint8 payerCount;
        bool settled;
        bool cancelled;
        /// @dev Monotonically non-decreasing deposit counter. Never decremented.
        uint256 depositCount;
        address[MAX_PAYERS] payers;
        /// @dev shares[i] is the exact USDC amount assigned to payers[i].
        uint256[MAX_PAYERS] shares;
        /// @dev deposited[i] is 0 (unpaid) or shares[i] (paid). No other value stored.
        uint256[MAX_PAYERS] deposited;
    }

    /// @notice Total number of bills ever created. Used as the next bill ID.
    uint256 public billCount;

    /// @notice Primary bill storage. Key is a sequential bill ID starting at 0.
    mapping(uint256 => Bill) private _bills;

    // ─────────────────────────────────────────────
    // Custom errors
    // ─────────────────────────────────────────────

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

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

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

    event BillSettled(
        uint256 indexed billId,
        address indexed recipient,
        uint256 amount
    );

    event Refunded(
        uint256 indexed billId,
        address indexed payer,
        uint256 amount
    );

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /**
     * @param _usdc Address of the USDC ERC-20 contract.
     *              On Arc Mainnet: 0x3600000000000000000000000000000000000000
     */
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        // Verify the address holds deployed contract code.
        // An EOA or wrong address would silently accept any transfer call but could
        // not actually hold or transfer tokens, bricking all escrow operations.
        if (_usdc.code.length == 0) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    // ─────────────────────────────────────────────
    // Write functions
    // ─────────────────────────────────────────────

    /**
     * @notice Create a new shared bill.
     *
     * @param title       Human-readable label for the bill.
     * @param recipient   Address that receives the total amount on settlement.
     * @param totalAmount Explicit total (6-decimal USDC); must equal sum(shares).
     * @param payers      2–5 unique non-zero addresses, one per payer slot.
     * @param shares      Exact USDC amount assigned to each payer slot; shares[i] > 0.
     * @param deadline    Unix timestamp after which underfunded bills become refundable.
     *                    Must be strictly in the future (> block.timestamp).
     */
    function createBill(
        string calldata title,
        address recipient,
        uint256 totalAmount,
        address[] calldata payers,
        uint256[] calldata shares,
        uint256 deadline
    ) external returns (uint256 billId) {
        // ── Validate lengths and counts ──
        if (payers.length < MIN_PAYERS || payers.length > MAX_PAYERS) {
            revert InvalidPayerCount();
        }
        if (payers.length != shares.length) revert InvalidPayerCount();

        // ── Validate amounts ──
        if (totalAmount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();
        if (deadline <= block.timestamp) revert InvalidDeadline();

        // ── Validate shares sum and individual payer entries ──
        uint256 sharesSum = 0;
        for (uint8 i = 0; i < payers.length; i++) {
            if (payers[i] == address(0)) revert ZeroAddress();
            if (shares[i] == 0) revert ZeroAmount();
            // Duplicate payer check: compare against all prior slots
            for (uint8 j = 0; j < i; j++) {
                if (payers[i] == payers[j]) revert DuplicatePayer();
            }
            sharesSum += shares[i];
        }
        if (sharesSum != totalAmount) {
            revert ShareSumMismatch(sharesSum, totalAmount);
        }

        // ── Assign bill ID and initialize struct ──
        billId = billCount++;
        Bill storage b = _bills[billId];

        b.title = title;
        b.creator = msg.sender;
        b.recipient = recipient;
        b.totalAmount = totalAmount;
        b.deadline = deadline;
        b.settleDeadline = deadline + GRACE_PERIOD;
        b.payerCount = uint8(payers.length);
        // settled, cancelled, depositCount default to false/0

        for (uint8 i = 0; i < payers.length; i++) {
            b.payers[i] = payers[i];
            b.shares[i] = shares[i];
            // deposited[i] defaults to 0
        }

        emit BillCreated(
            billId,
            msg.sender,
            recipient,
            totalAmount,
            deadline,
            b.settleDeadline
        );
    }

    /**
     * @notice Cancel a bill that has never received any deposit.
     *
     * @dev Only the creator may cancel. Requires depositCount == 0. This is a permanent
     *      check: depositCount is never decremented, so a bill that once had a deposit
     *      (even if subsequently refunded) can never be cancelled.
     *
     * @param billId The bill to cancel.
     */
    function cancelBill(uint256 billId) external nonReentrant {
        _requireExists(billId);
        Bill storage b = _bills[billId];

        if (msg.sender != b.creator) revert NotCreator();
        if (b.depositCount != 0) revert DepositsAlreadyMade();
        if (b.cancelled) revert AlreadyCancelled();
        if (b.settled) revert AlreadySettled();

        // CEI: update state before any potential future-proofed external interaction
        b.cancelled = true;

        emit BillCancelled(billId, msg.sender);
    }

    /**
     * @notice Deposit the caller's assigned share into escrow.
     *
     * @dev Payer must have approved this contract for at least shares[slot] USDC
     *      before calling. Pulls funds via safeTransferFrom (CEI: state updated first).
     *
     *      Deposit is permitted only while block.timestamp < deadline (strict less-than).
     *
     * @param billId The bill to deposit into.
     */
    function deposit(uint256 billId) external nonReentrant {
        _requireExists(billId);
        Bill storage b = _bills[billId];

        if (b.cancelled) revert BillIsCancelled();
        if (b.settled) revert AlreadySettled();
        // Strict less-than: deposits are NOT accepted at or after the deadline
        if (block.timestamp >= b.deadline) revert DeadlinePassed();

        uint8 slot = _findSlot(b, msg.sender);
        if (b.deposited[slot] != 0) revert AlreadyDeposited();

        uint256 amount = b.shares[slot];

        // ── CEI: update state before external call ──
        b.deposited[slot] = amount;
        b.depositCount++;

        // ── External call: pull funds from payer ──
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(billId, msg.sender, amount, slot);

        // Emit BillFunded if this was the last slot
        if (b.depositCount == b.payerCount) {
            emit BillFunded(billId);
        }
    }

    /**
     * @notice Settle a fully funded bill by transferring the total to the recipient.
     *
     * @dev Permissionless: any address may call this function. No approval required
     *      from the caller — funds move from the contract's own balance to the recipient.
     *
     *      Settlement is permitted while block.timestamp <= settleDeadline (inclusive).
     *
     * @param billId The bill to settle.
     */
    function settleBill(uint256 billId) external nonReentrant {
        _requireExists(billId);
        Bill storage b = _bills[billId];

        if (!_isFullyFunded(b)) revert NotFullyFunded();
        if (b.settled) revert AlreadySettled();
        if (b.cancelled) revert BillIsCancelled();
        // Inclusive upper bound: settlement is permitted at exactly settleDeadline
        if (block.timestamp > b.settleDeadline) revert SettleDeadlinePassed();

        // ── CEI: mark settled before external call ──
        b.settled = true;
        uint256 amount = b.totalAmount;
        address recipient = b.recipient;

        // ── External call: push funds to recipient ──
        usdc.safeTransfer(recipient, amount);

        emit BillSettled(billId, recipient, amount);
    }

    /**
     * @notice Reclaim the caller's deposited share from an expired or stuck bill.
     *
     * @dev Callable only when the bill is in REFUNDABLE state:
     *   - Underfunded and block.timestamp >= deadline, OR
     *   - Fully funded but unsettled and block.timestamp > settleDeadline.
     *
     *      CEI: deposited[slot] is zeroed BEFORE the safeTransfer to prevent re-entry.
     *
     * @param billId The bill to refund from.
     */
    function refund(uint256 billId) external nonReentrant {
        _requireExists(billId);
        Bill storage b = _bills[billId];

        uint8 slot = _findSlot(b, msg.sender);

        if (b.deposited[slot] == 0) revert NothingToRefund();
        if (b.settled) revert AlreadySettled();
        if (!_isRefundable(b)) revert NotRefundable();

        // ── CEI: zero the slot before external call ──
        uint256 amount = b.deposited[slot];
        b.deposited[slot] = 0;

        // ── External call: push funds back to payer ──
        usdc.safeTransfer(msg.sender, amount);

        emit Refunded(billId, msg.sender, amount);
    }

    // ─────────────────────────────────────────────
    // View functions
    // ─────────────────────────────────────────────

    /**
     * @notice Return the full Bill struct for a given bill ID.
     * @param billId Must be a valid existing bill ID (< billCount).
     */
    function getBill(uint256 billId) external view returns (Bill memory) {
        _requireExists(billId);
        return _bills[billId];
    }

    /**
     * @notice Derive the current state of a bill.
     *
     * @dev State derivation uses exact boundary operators consistent with the write
     *      functions. The same logic must be replicated in billState.ts for the UI.
     *
     * @param billId Must be a valid existing bill ID (< billCount).
     * @return Current BillState enum value.
     */
    function getBillState(uint256 billId) external view returns (BillState) {
        _requireExists(billId);
        Bill storage b = _bills[billId];

        if (b.cancelled) return BillState.CANCELLED;
        if (b.settled) return BillState.SETTLED;
        if (_isRefundable(b)) return BillState.REFUNDABLE;
        if (_isFullyFunded(b)) return BillState.FUNDED;
        return BillState.OPEN;
    }

    /**
     * @notice Find the slot and deposit status for a given address on a bill.
     *
     * @param billId Must be a valid existing bill ID (< billCount).
     * @param addr   The address to look up.
     * @return slot         The slot index (0–4).
     * @return hasDeposited True if deposited[slot] > 0.
     */
    function getMySlot(
        uint256 billId,
        address addr
    ) external view returns (uint8 slot, bool hasDeposited) {
        _requireExists(billId);
        Bill storage b = _bills[billId];
        slot = _findSlot(b, addr);
        hasDeposited = b.deposited[slot] != 0;
    }

    /**
     * @notice Check whether a bill is currently in the REFUNDABLE state.
     *
     * @dev Returns true when:
     *   (a) bill is underfunded AND block.timestamp >= deadline, OR
     *   (b) bill is fully funded, not settled, AND block.timestamp > settleDeadline.
     *
     * @param billId Must be a valid existing bill ID (< billCount).
     */
    function isRefundable(uint256 billId) external view returns (bool) {
        _requireExists(billId);
        return _isRefundable(_bills[billId]);
    }

    // ─────────────────────────────────────────────
    // Internal helpers
    // ─────────────────────────────────────────────

    /**
     * @dev Revert with BillDoesNotExist if billId is not a valid existing bill.
     */
    function _requireExists(uint256 billId) internal view {
        if (billId >= billCount) revert BillDoesNotExist(billId);
    }

    /**
     * @dev Return true if all payer slots have been deposited.
     */
    function _isFullyFunded(Bill storage b) internal view returns (bool) {
        return b.depositCount == b.payerCount;
    }

    /**
     * @dev Return true if the bill is in REFUNDABLE state.
     *
     *  Case A (underfunded): not fully funded AND block.timestamp >= deadline.
     *  Case B (funded, missed window): fully funded AND not settled AND block.timestamp > settleDeadline.
     *
     * Note: a cancelled bill is never refundable (depositCount == 0 guarantees no funds).
     */
    function _isRefundable(Bill storage b) internal view returns (bool) {
        if (b.cancelled || b.settled) return false;
        bool fullyFunded = _isFullyFunded(b);
        // Case A: underfunded past funding deadline (>= is inclusive lower bound)
        if (!fullyFunded && block.timestamp >= b.deadline) return true;
        // Case B: funded but grace period expired (> is exclusive upper bound)
        if (fullyFunded && block.timestamp > b.settleDeadline) return true;
        return false;
    }

    /**
     * @dev Find the slot index for `addr` in bill `b`. Reverts NotAPayer if not found.
     */
    function _findSlot(
        Bill storage b,
        address addr
    ) internal view returns (uint8) {
        for (uint8 i = 0; i < b.payerCount; i++) {
            if (b.payers[i] == addr) return i;
        }
        revert NotAPayer();
    }
}
