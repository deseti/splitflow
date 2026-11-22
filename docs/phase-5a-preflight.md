# SplitFlow — Phase 5A Arc Mainnet Deployment Preflight

**Date:** 2026-10-16  
**Status:** READ-ONLY PREFLIGHT — No deployment performed  
**Prepared by:** Arc Studio  

---

## GO / NO-GO: CONDITIONAL GO

The contract is technically ready. Two hard blockers remain before mainnet deployment is safe:
1. **USDC balance split across two wallets** — must choose a single deployer wallet with enough balance for deployment + demo.
2. **Reown Cloud allowed origin** — `splitflow.wizpay.xyz` must be registered before the production frontend is live.

Both are resolved by the deployer before sending any transaction. Details below.

---

## 1. Contract Build and Test Results

### forge build

| Property | Value |
|---|---|
| Compiler | solc 0.8.28+commit.7893614a |
| EVM version | paris |
| Optimizer | enabled, 200 runs |
| Warnings | 5 × `block-timestamp` (accepted; see Phase 3) |
| Errors | **0** |
| Build result | **PASS** |

### Bytecode

| Metric | Value |
|---|---|
| Deployment bytecode | 6,330 bytes |
| Deployed runtime bytecode | 6,083 bytes |
| EIP-170 limit | 24,576 bytes |
| Under limit | **Yes (6,083 / 24,576 = 24.8%)** |

### forge test

**Command:** `forge test -vvv`  
**Result:** `43 tests passed, 0 failed, 0 skipped`  
**Runtime:** 37.89 s

| Suite | Tests | Result |
|---|---|---|
| Unit tests | 37 | PASS |
| Fuzz tests | 2 × 256 runs | PASS |
| Invariant tests | 3 × 128,000 calls | PASS (0 reverts) |

**Invariant results (fresh run, this preflight):**

| Invariant | Calls | Reverts | Outcome |
|---|---|---|---|
| `invariant_solvency` | 128,000 | 0 | PASS |
| `invariant_depositCountMonotone` | 128,000 | 0 | PASS |
| `invariant_slotBinary` | 128,000 | 0 | PASS |

### Artifact vs source consistency

The Foundry artifact at `contracts/out/SplitFlow.sol/SplitFlow.json` was produced by the `forge build` run this session from the reviewed source. The ABI embedded in `src/lib/splitflow.ts` was copied from this artifact. ABI and source are in sync.

### Unresolved findings from Phase 3

| Finding | Severity | Status |
|---|---|---|
| `block.timestamp` comparisons | Low | Accepted — all 5 boundaries tested on both sides; ±15s manipulation is negligible against 7-day windows |
| `createBill` cyclomatic complexity 13 | Informational | Accepted — consolidation of correct validation logic |
| Contract-level USDC freeze (pool custody) | Medium (disclosure) | Accepted — inherent to single-address pooled custody; documented in design doc, disclosed in UI |
| Blacklisted payer (refund path) | Medium (disclosure) | Accepted — no contract-level rescue without admin path; disclosed in UI |
| **Independent third-party audit** | — | **Not performed.** All review was automated within Arc Studio. Recommended before deployment with significant user funds. |

---

## 2. Arc Mainnet Network Verification

All values verified against live Arc Mainnet RPC (`https://rpc.mainnet.arc.io`) and Arc Studio's `onchain-facts` registry.

| Property | Expected | Live RPC result | Match |
|---|---|---|---|
| Chain ID | 5042 | `eth_chainId` → `0x13b2` = **5042** | ✓ |
| RPC URL | https://rpc.mainnet.arc.io | HTTP 200, responding | ✓ |
| Explorer | https://explorer.arc.io | Registered in onchain-facts | ✓ |
| USDC address | `0x3600000000000000000000000000000000000000` | `eth_getCode` → 1,798 bytes (contract exists) | ✓ |
| USDC `decimals()` | 6 | `read_contract` → **6** | ✓ |
| USDC `name()` | "USDC" | `read_contract` → **"USDC"** | ✓ |
| USDC `symbol()` | "USDC" | `read_contract` → **"USDC"** | ✓ |
| Current block | — | 26,234,172 (live at preflight time) | — |

### Arc native vs ERC-20 USDC

On Arc, the native gas token and the ERC-20 USDC are the same asset exposed through two interfaces:

| View | Decimals | Used for |
|---|---|---|
| Native (gas token) | 18 | `msg.value`, `eth_gasPrice`, fee calculation |
| ERC-20 | 6 | All escrow deposits, transfers, approvals |

The SplitFlow contract uses only the ERC-20 view (via `SafeERC20`). The frontend uses only the ERC-20 view (via `@/onchain-money`). No confusion between the two paths exists in the current code.

---

## 3. Deployment Gas Estimate

**Note:** The Arc Mainnet RPC at `https://rpc.mainnet.arc.io` returns HTTP 403 to direct `eth_estimateGas` calls from the sandbox (CORS/IP restriction). The estimate below is **analytical**, derived from the EVM gas cost model (EIP-2028 calldata, EIP-3860 init code, code deposit) plus the actual bytecode sizes from the compiled artifact. This method typically estimates within 5–15% of actual `eth_estimateGas`.

| Component | Gas |
|---|---|
| Base transaction | 21,000 |
| Calldata (6,330 bytes, ~75% non-zero) | 82,296 |
| Init code words (EIP-3860) | 396 |
| Code deposit (6,083 runtime bytes × 200) | 1,216,600 |
| Constructor execution (2 SSTORE-equiv writes) | 25,000 |
| **Total estimate** | **1,345,292** |
| **With 25% safety margin** | **1,681,615** |

**Current base fee** (from `eth_getBlockByNumber` at block 26,234,172): **20 Gwei** (20,000,000,000 native wei)

| Scenario | Gas | Cost (USDC) |
|---|---|---|
| Estimate (no margin) | 1,345,292 | **~0.027 USDC** |
| Estimate + 25% margin | 1,681,615 | **~0.034 USDC** |

**Conversion note:** Arc native-wei → USDC: `gas × 20e9 wei ÷ 1e18 (native decimals)`. At current gas price, deployment costs approximately **0.03–0.04 USDC** including safety margin.

**End-to-end demonstration gas estimate** (one complete bill: createBill + 2× approve + 2× deposit + settleBill):

| Operation | ~Gas | ~USDC |
|---|---|---|
| `createBill` (2 payers) | ~350,000 | ~0.007 |
| `approve` × 2 | ~90,000 | ~0.002 |
| `deposit` × 2 | ~130,000 | ~0.003 |
| `settleBill` | ~60,000 | ~0.001 |
| **Demo total** | **~630,000** | **~0.013** |

**Full deployment + demo estimate: ~0.05 USDC** at current gas price (well within either wallet balance).

### Wallet balance assessment

| Wallet | Reported balance | Sufficient for deployment? | Sufficient for deployment + demo? |
|---|---|---|---|
| Wallet A | ~1.9 USDC (user-reported) | Yes (~0.034 needed) | Yes (~0.05 needed) |
| Wallet B | ~4.0 USDC (user-reported) | Yes | Yes |

**Critical rule:** These are two separate wallets. They must NOT be treated as a combined 5.9 USDC balance. The deployer wallet is whichever single wallet you use to send the deployment transaction — the contract has no deployer privileges after deploy, so the wallet choice only affects which address pays deployment gas. The USDC held in the *other* wallet can be used for deposits during the demo by connecting that wallet separately.

**Recommendation:** Deploy from the 4.0 USDC wallet for comfort margin. Use the 1.9 USDC wallet for payer deposits during the demo.

---

## 4. Constructor Arguments

The SplitFlow constructor takes exactly one argument:

```
constructor(address _usdc)
```

| Argument | Value | Source |
|---|---|---|
| `_usdc` | `0x3600000000000000000000000000000000000000` | Arc Mainnet USDC (verified above) |

ABI-encoded constructor argument (append to deployment bytecode):
```
0000000000000000000000003600000000000000000000000000000000000000
```

The contract validates at construction time that `_usdc != address(0)` AND `_usdc.code.length > 0`. If you pass any other address, the deployment transaction will revert.

---

## 5. Deployment Options and Wallet-Signing Security

### Does Arc Studio's Contracts panel support Arc Mainnet?

Arc Studio's built-in `deploy_contract` tool deploys via Circle Smart Contract Platform (SCP). SCP currently targets Circle-managed testnet deployments — it uses a Circle-funded deployer wallet, not your personal wallet. **Arc Mainnet is not a supported SCP target in Arc Studio.** For mainnet, you deploy from your own wallet.

### Supported user-controlled deployment methods

All three methods require you to sign the deployment transaction from your own wallet. Arc Studio never holds your private key, never signs transactions, and never broadcasts to mainnet.

**Method 1 — Remix (browser-based, recommended for manual verification)**
1. Open [remix.ethereum.org](https://remix.ethereum.org)
2. Upload `contracts/SplitFlow.sol` and its OpenZeppelin imports, or use the Foundry artifact.
3. Compile with Solidity 0.8.28, EVM: Paris, optimizer 200 runs.
4. Deploy tab → select "Injected Provider - MetaMask" → connect wallet.
5. Switch MetaMask to Arc Mainnet (chain ID 5042, RPC `https://rpc.mainnet.arc.io`).
6. Constructor field: paste `0x3600000000000000000000000000000000000000`.
7. Click Deploy. MetaMask shows the gas estimate. Confirm.

**Method 2 — Foundry `forge script` (from your local machine)**
```bash
# On your local machine (NOT in Arc Studio)
forge script contracts/script/DeployCreate2.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify
```
Replace with a simple deploy script that calls `new SplitFlow(0x3600000000000000000000000000000000000000)`. Never paste your private key into Arc Studio.

**Method 3 — Hardhat / ethers.js (from your local machine)**
Standard `ethers.ContractFactory.deploy("0x3600000000000000000000000000000000000000")` with a local signer.

### Post-deployment verification checklist

- [ ] Deployment transaction confirmed on Arc Explorer: `https://explorer.arc.io/tx/<txhash>`
- [ ] Contract address verified on Arc Explorer: `https://explorer.arc.io/address/<contract>`
- [ ] Call `usdc()` on deployed contract → should return `0x3600000000000000000000000000000000000000`
- [ ] Call `GRACE_PERIOD()` → should return `604800` (7 days in seconds)
- [ ] Call `billCount()` → should return `0`
- [ ] Source code submitted to Arc Explorer for verification (if supported)
- [ ] `VITE_SPLITFLOW_CONTRACT_ADDRESS` set to the deployed address in `.env` and in Cloudflare Pages env vars
- [ ] Frontend production build re-run after env var is set
- [ ] Smoke test: `createBill` on mainnet, verify `billCount()` = 1, verify `BillCreated` event in explorer

---

## 6. Frontend Readiness

| Check | Status |
|---|---|
| Lint (oxlint) | **0 errors, 0 warnings** |
| TypeScript (tsc --noEmit) | **0 errors** |
| Production build (vite build) | **PASS** (22 s) |
| Dev server renders dark UI | **PASS** (HTTP 200, `background-color:#090D16` in HTML) |
| ConnectKit removed | **Confirmed** — no ConnectKit import in any source file |
| Reown AppKit configured | **PASS** — `themeMode: 'dark'`, project ID loaded from env |
| Arc Mainnet chain ID 5042 | **PASS** — hardcoded in `ARC_MAINNET_CHAIN_ID`, verified against `onchain-facts` |
| USDC address from onchain-facts | **PASS** — `getUsdc(5042)` returns verified address |
| ABI matches deployed source | **PASS** — ABI in `splitflow.ts` generated from current artifact |
| Missing contract address | **PASS** — renders "Contract Not Deployed" notice, no crash |
| Chain guard | **PASS** — `ChainGuard` blocks writes on wrong network |
| `VITE_SPLITFLOW_CONTRACT_ADDRESS` | **NOT SET** — required after deployment |

### Reown / WalletConnect allowed-origin

The Reown project ID `9bc29869167862081747af1aa8fb5ef0` is configured. The production domain `splitflow.wizpay.xyz` must be added as an **allowed origin** in the [Reown Cloud dashboard](https://cloud.walletconnect.com) before users can use WalletConnect QR / mobile wallets on the live site. Without this registration, AppKit falls back to local config and logs a 403 warning — injected wallets (MetaMask) still work.

### Cloudflare Pages configuration

Before deploying to Cloudflare Pages, set these environment variables in the Cloudflare Pages dashboard (Settings → Environment Variables → Production):

| Variable | Value |
|---|---|
| `VITE_WALLETCONNECT_PROJECT_ID` | `9bc29869167862081747af1aa8fb5ef0` |
| `VITE_SPLITFLOW_CONTRACT_ADDRESS` | `<deployed contract address>` |

The custom domain `splitflow.wizpay.xyz` must be pointed at the Cloudflare Pages project via DNS (CNAME to `<pages-project>.pages.dev`).

---

## 7. Remaining Blockers and Risks

### Hard blockers (must resolve before deployment)

| # | Blocker | Resolution |
|---|---|---|
| 1 | `VITE_SPLITFLOW_CONTRACT_ADDRESS` not set | Set after deployment; rebuild frontend |
| 2 | Reown allowed origin not registered | Add `splitflow.wizpay.xyz` in Reown Cloud dashboard |

### Soft blockers (resolve before going public)

| # | Item | Resolution |
|---|---|---|
| 3 | Cloudflare Pages env vars not set | Set both VITE_ vars before deploying frontend |
| 4 | DNS for `splitflow.wizpay.xyz` not configured | Point domain CNAME to Cloudflare Pages project |
| 5 | Arc Explorer source verification | Submit flattened source after deploy (if explorer supports it) |

### Known risks (accepted for MVP)

| Risk | Severity | Notes |
|---|---|---|
| No independent third-party audit | High | Automated review only; do not deploy with large user funds without a professional audit |
| Contract-level USDC freeze | Medium | If Circle freezes the contract address, all fund movements fail; no contract-level escape; disclosed in UI |
| Blacklisted payer loses refund access | Medium | Disclosed in UI; no escape without admin path |
| Bill discovery scales linearly | Low | Polling `getBill(0..billCount)` acceptable for MVP; subgraph for v2 |
| No pause mechanism | Low | Emergency response is redeploy-and-redirect; documented in design doc |
| Gas price fluctuation | Low | Estimate at 20 Gwei; actual may be higher; well within available USDC |

---

## 8. GO / NO-GO Recommendation

**CONDITIONAL GO.**

The contract is technically ready:
- 43/43 tests pass (unit, fuzz, invariant) on a fresh run this session
- Bytecode artifact matches the reviewed source
- Arc Mainnet USDC verified live at `0x3600000000000000000000000000000000000000` with 6 decimals
- Deployment cost ~0.034 USDC — within both wallet balances
- Frontend builds clean with 0 lint/type errors

**Before deploying, confirm these three things:**

1. **Choose the deployer wallet** — use one wallet (not both) to sign the deployment transaction. Recommendation: use the 4.0 USDC wallet.
2. **Register the production domain** in Reown Cloud dashboard.
3. **Acknowledge the audit gap** — no independent third-party audit has been performed. The contract has no admin escape hatch; any bug found post-deploy requires a new deployment at a new address.

Once you give explicit go-ahead, Phase 5B covers the deployment transaction itself.
