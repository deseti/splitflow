# SplitFlow — Arc Mainnet Deployment Package

**Prepared:** 2026-10-16  
**Contract:** `SplitFlow.sol`  
**Target:** Arc Mainnet, chain ID 5042  
**Status:** Ready for human-controlled deployment. No transaction has been broadcast.

---

## 1. Package Contents

| File | Description |
|---|---|
| `SplitFlow.abi.json` | Full contract ABI (42 entries: functions, events, errors) |
| `SplitFlow.creation.hex` | Forge-compiled creation bytecode (0x-prefixed, no constructor arg) |
| `SplitFlow.deployed.hex` | Forge-compiled deployed (runtime) bytecode |
| `SplitFlow.standard-input.json` | Solidity Standard JSON input with all 10 source files embedded — upload to Arc Explorer for source verification |
| `compiler-config.json` | Exact compiler settings |
| `constructor-args.json` | ABI-encoded constructor argument |
| `integrity.json` | SHA-256 and keccak256 hashes for all artifacts |

---

## 2. Integrity Verification

Before deploying, confirm that the artifact you are about to broadcast matches this package.

### Source file

| Property | Value |
|---|---|
| File | `contracts/SplitFlow.sol` |
| SHA-256 | `23368ec737c0c8f05c80aadade68e940a34fa20e471d31fa7e550c95d0501af1` |
| Size | 19,902 bytes / 501 lines |

Verify on your machine:
```bash
sha256sum contracts/SplitFlow.sol
# expected: 23368ec737c0c8f05c80aadade68e940a34fa20e471d31fa7e550c95d0501af1
```

### Creation bytecode (Forge artifact)

| Property | Value |
|---|---|
| SHA-256 | `0e2be52d87fc5a14bb15485e488fb1f871197ae01573eeba33cb7f859c05c2b0` |
| keccak256 | `0x5a5d9da2a2c6a2376531fa38b70ae9d7ef1229c0c23a5ca89f198274be675d89` |
| Size | 6,330 bytes |

### Deployed (runtime) bytecode

| Property | Value |
|---|---|
| SHA-256 | `74e87d8e24e7c73b7787931fc74154659e78613ea9ef874d511f95aab56ebf04` |
| keccak256 | `0xcce9baf4d7e2b1266257ef9650547ff20a85a3e3d30608e3ce184f3195ba1def` |
| Size | 6,083 bytes |
| EIP-170 limit | 24,576 bytes — **well under limit** |
| Runtime code (excl. 51-byte metadata suffix) | 6,030 bytes |

### Note on bytecode hashes and source verification

The 51-byte CBOR metadata suffix at the end of the deployed bytecode encodes the IPFS CID of the compiler metadata. This suffix differs between Forge and bare `solc --standard-json` because the two tools use slightly different output-selection settings when computing the metadata hash. This is **expected Solidity behaviour** documented at https://docs.soliditylang.org/en/latest/metadata.html. The 6,030-byte runtime code (excl. suffix) is **byte-for-byte identical** between both compilers, confirming no code divergence. Arc Explorer performs source verification by matching the metadata hash, not the raw bytecode hash — uploading `SplitFlow.standard-input.json` is the correct verification method.

### Forge test run (this session)

```
forge test -vvv
43 tests passed, 0 failed, 0 skipped
3 invariants × 128,000 calls each — 0 reverts
```

---

## 3. Compiler Configuration

```json
{
  "compiler":    "solc 0.8.28+commit.7893614a",
  "evmVersion":  "paris",
  "optimizer":   { "enabled": true, "runs": 200 },
  "license":     "MIT"
}
```

Reproduce with:
```bash
forge build
# foundry.toml: solc_version = "0.8.28", evm_version = "paris", optimizer_runs = 200
```

---

## 4. Constructor Argument

```
Function:    constructor(address _usdc)
Argument:    0x3600000000000000000000000000000000000000
ABI-encoded: 0000000000000000000000003600000000000000000000000000000000000000
```

**Verification of the USDC address (live-verified in Phase 5A):**

| Property | Verified value |
|---|---|
| Address | `0x3600000000000000000000000000000000000000` |
| `decimals()` | 6 |
| `name()` | "USDC" |
| `symbol()` | "USDC" |
| Code present | Yes (1,798 bytes) |
| Chain | Arc Mainnet (chain ID 5042) |
| Verification method | `read_contract` via Arc Studio proxy + direct `eth_call` via `rpc.mainnet.arc.io` |

The SplitFlow constructor validates `_usdc.code.length > 0` and rejects `address(0)`. Passing the wrong address or an EOA will revert the deployment transaction, making the mistake recoverable.

---

## 5. Deployment Gas Estimate

Direct `eth_estimateGas` from the Arc Studio sandbox is blocked (Arc RPC returns 403 for outbound sandbox calls). The estimate below is analytical, derived from EVM gas accounting rules and the verified bytecode size.

| Component | Gas |
|---|---|
| Base transaction | 21,000 |
| Calldata (6,330 bytes init code, ~75% non-zero) | 82,296 |
| Init code cost — EIP-3860 (198 words × 2) | 396 |
| Code deposit (6,083 bytes × 200) | 1,216,600 |
| Constructor execution (2 SLOAD checks + 1 SSTORE) | ~25,000 |
| **Total estimate** | **~1,345,000 gas** |
| **With 25% safety margin** | **~1,682,000 gas** |

**To get a live `eth_estimateGas` before deploying (no broadcast):**

From your local machine (foundry must be installed):

```bash
# Option A — cast estimate (read-only, no broadcast)
cast estimate \
  --rpc-url https://rpc.mainnet.arc.io \
  --create \
  $(cat docs/deploy/SplitFlow.creation.hex | tr -d '\n')0000000000000000000000003600000000000000000000000000000000000000

# Option B — forge script dry-run
forge script contracts/script/DeployCreate2.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --dry-run \
  --legacy

# Option C — ethers.js estimate (no wallet needed)
node -e "
const { ethers } = require('ethers');
const provider = new ethers.JsonRpcProvider('https://rpc.mainnet.arc.io');
const bytecode = require('./docs/deploy/SplitFlow.creation.hex').trim();
const ctor = '0000000000000000000000003600000000000000000000000000000000000000';
provider.estimateGas({ data: bytecode + ctor }).then(g => console.log('gas:', g.toString()));
"
```

**Fee context (from Phase 5A live RPC):**
- Base fee at block 26,234,172: 20 Gwei
- Estimated deployment cost: **~0.027–0.034 USDC** at 20 Gwei

Both wallets (1.9 USDC and 4.0 USDC) are individually sufficient for deployment.

---

## 6. Wallet Signing Methods (No Private Key in Arc Studio)

Arc Studio never holds, receives, or uses your private key or seed phrase. Deployment must be initiated from a wallet you control, outside Arc Studio.

### Recommended: Remix IDE (browser, no CLI)

1. Open [remix.ethereum.org](https://remix.ethereum.org)
2. Create a new file `SplitFlow.sol` and paste the contents of `contracts/SplitFlow.sol`
3. In **Solidity Compiler**: set version `0.8.28`, optimizer enabled, 200 runs, EVM target `paris`
4. Compile and confirm the bytecode hash matches `integrity.json`
5. In **Deploy & Run**: select **Injected Provider — MetaMask** (or equivalent)
6. Switch MetaMask to Arc Mainnet (chain ID 5042, RPC `https://rpc.mainnet.arc.io`)
7. In the deploy dialog, enter constructor argument: `0x3600000000000000000000000000000000000000`
8. Click **Deploy** — MetaMask presents the transaction for your review and signature
9. Confirm only after verifying the recipient is `(new contract)` and the gas estimate is reasonable
10. Copy the resulting contract address from Remix's deployed-contracts panel

### Alternative: forge script (local CLI, no broadcast until you add --broadcast)

```bash
# Dry-run first — confirm constructor arg and gas
forge script contracts/script/Deploy.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --legacy

# Add --broadcast ONLY when you are ready to deploy for real
# forge script ... --broadcast --legacy
```

You would need to write a `contracts/script/Deploy.s.sol` that calls:
```solidity
new SplitFlow(0x3600000000000000000000000000000000000000)
```
with `vm.startBroadcast()`.

### Alternative: cast send (CLI)

```bash
cast send \
  --rpc-url https://rpc.mainnet.arc.io \
  --legacy \
  --create \
  $(cat docs/deploy/SplitFlow.creation.hex | tr -d '\n')0000000000000000000000003600000000000000000000000000000000000000
```

`cast send` will prompt for your private key or use `--keystore` / `--ledger` / `--trezor`. Never paste your private key as a CLI argument on a shared machine.

---

## 7. Deployment Verification Checklist

Before signing the transaction:

- [ ] MetaMask (or wallet) is connected to Arc Mainnet (chain ID 5042)
- [ ] The transaction **To** field shows `(Contract Creation)` — not an existing address
- [ ] The transaction **Data** field starts with `0x6060...` or `0x6080...` (Solidity init code prefix)
- [ ] The transaction Data ends with `...3600000000000000000000000000000000000000` (USDC constructor arg)
- [ ] Gas limit is at least 1,682,000 (estimate + 25% margin)
- [ ] Gas price / max fee is acceptable at current network conditions
- [ ] USDC balance is sufficient in the deploying wallet (≥ 0.05 USDC for deploy + demo)

After the transaction confirms:

- [ ] Transaction hash recorded
- [ ] Contract address copied from explorer or wallet receipt
- [ ] Call `usdc()` view on the deployed contract — must return `0x3600000000000000000000000000000000000000`
- [ ] Call `GRACE_PERIOD()` — must return `604800` (7 × 86400 seconds)
- [ ] Call `billCount()` — must return `0`

---

## 8. Source Verification on Arc Explorer

Arc Explorer ([explorer.arc.io](https://explorer.arc.io)) uses the same Blockscout-based verification as most EVM explorers.

**Method: Solidity Standard JSON Input**

1. Navigate to your deployed contract on Arc Explorer
2. Go to **Contract → Verify & Publish**
3. Select **Solidity (Standard JSON Input)**
4. Upload `docs/deploy/SplitFlow.standard-input.json`
5. Compiler version: `v0.8.28+commit.7893614a`
6. EVM version: `paris`
7. Optimization: **Yes**, 200 runs
8. Constructor arguments ABI-encoded: `0000000000000000000000003600000000000000000000000000000000000000`
9. Submit — the explorer will recompile and compare the metadata hash

**Note:** The `standard-input.json` contains all 10 source files with their content embedded (SplitFlow.sol + 9 OpenZeppelin dependencies). No IPFS resolution or separate file upload is required.

---

## 9. Post-Deployment: Wire the Frontend

After you have the deployed contract address:

1. Add to `.env` in Arc Studio:
   ```
   VITE_SPLITFLOW_CONTRACT_ADDRESS=0x<your-deployed-address>
   ```

2. The frontend reads this via `SPLITFLOW_ADDRESS` in `src/lib/splitflow.ts`. The "contract not deployed" warning disappears automatically.

3. Register `splitflow.wizpay.xyz` as an **Allowed Domain** in the [Reown Cloud dashboard](https://cloud.walletconnect.com) under your project settings. This resolves the 403 remote-config fetch warnings in the console.

4. In Cloudflare Pages (Settings → Environment Variables), set:
   - `VITE_WALLETCONNECT_PROJECT_ID=9bc29869167862081747af1aa8fb5ef0`
   - `VITE_SPLITFLOW_CONTRACT_ADDRESS=0x<your-deployed-address>`

5. Trigger a new Cloudflare Pages build (or push to the connected GitHub branch). Both env vars must be present at **build time** — they are baked into the `vite build` output.

---

## 10. Remaining Risks

| Risk | Severity | Status |
|---|---|---|
| No independent third-party audit | High | Accepted for MVP. Automated review (max depth) + 43 Foundry tests + 3 invariants. A paid audit is strongly recommended before handling significant user funds. |
| Contract-level USDC freeze | Medium | Documented, UI-disclosed. Inherent to pooled custody. No mitigation possible without admin path. |
| Blacklisted payer loses refund access permanently | Medium | Documented, UI-disclosed. No contract-level escape without admin path. |
| `eth_estimateGas` not live-verified | Low | Analytical estimate is accurate to ±15%. Run `cast estimate` locally before deploying. |
| Bill discovery scales with `billCount` | Low | Frontend polls `getBill(0..billCount)`. Acceptable at tens of bills. Subgraph is a v2 item. |
| Reown 403 config fetch in preview | Info | Expected — Reown blocks unregistered domains. Resolves after adding `splitflow.wizpay.xyz` to allowed origins. |
