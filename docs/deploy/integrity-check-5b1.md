# SplitFlow — Phase 5B.1 Deployment Artifact Integrity Check

**Date:** 2026-10-16  
**Status:** PASS — full bytecode reproducibility confirmed

---

## 1. Artifact Identity

All hashes are computed from the Forge-built artifact this session.

| Artifact | SHA-256 | keccak256 |
|---|---|---|
| `contracts/SplitFlow.sol` (raw bytes) | `23368ec737c0c8f05c80aadade68e940a34fa20e471d31fa7e550c95d0501af1` | — |
| Creation bytecode (Forge) | `0e2be52d87fc5a14bb15485e488fb1f871197ae01573eeba33cb7f859c05c2b0` | `0x5a5d9da2a2c6a2376531fa38b70ae9d7ef1229c0c23a5ca89f198274be675d89` |
| Deployed bytecode (Forge) | `74e87d8e24e7c73b7787931fc74154659e78613ea9ef874d511f95aab56ebf04` | `0xcce9baf4d7e2b1266257ef9650547ff20a85a3e3d30608e3ce184f3195ba1def` |

Source: 19,902 bytes raw / 501 lines. The byte count (vs. Unicode char count) differs because the file contains 2,991 multi-byte UTF-8 sequences in NatSpec comments. The SHA-256 is taken on raw bytes and is authoritative.

---

## 2. Metadata Mismatch — Root Cause and Fix

### What was wrong in the Phase 5B standard JSON

The initial `SplitFlow.standard-input.json` was built by remapping source keys (`node_modules/@openzeppelin/...` → `@openzeppelin/...`) and omitting the `settings.metadata` block. This produced a JSON whose `outputSelection` and metadata configuration differed from what Forge actually passed to `solc`, so `solc` computed a different metadata JSON, which led to a different IPFS CID embedded in the deployed bytecode CBOR suffix. **The runtime opcode sequence was always identical** — only the 51-byte CBOR metadata suffix differed.

### Precise cause (three independent factors)

| Factor | Forge invocation | Previous standard JSON | Effect on bytecode |
|---|---|---|---|
| `settings.metadata` | `{useLiteralContent: false, bytecodeHash: "ipfs", appendCBOR: true}` | Omitted (solc used defaults) | Different IPFS CID in CBOR suffix |
| Source path keys | `node_modules/@openzeppelin/...` (original Forge paths) | Remapped to `@openzeppelin/...` | Different source-hash inputs to metadata |
| `settings.outputSelection` | `{*: {*: [abi, evm.bytecode.object, ..., metadata]}}` | `{*: {*: [abi, evm.bytecode, evm.deployedBytecode, metadata]}}` | Different output hash in metadata |

### Fix applied

The corrected `SplitFlow.standard-input.json` is extracted directly from Forge's `contracts/out/build-info/a116b374999c0239.json`, which records the exact `language`, `sources`, and `settings` Forge passed to `solc`. The three CLI-only top-level keys (`version`, `basePath`, `allowPaths`) are removed from the JSON body and passed as CLI flags instead. This recompiles to **byte-for-byte identical** creation and deployed bytecodes.

### Reproducibility verification (run yourself)

```sh
# From project root, with solc 0.8.28 installed
solc \
  --standard-json \
  --base-path . \
  --allow-paths .,./lib \
  docs/deploy/SplitFlow.standard-input.json \
  > /tmp/splitflow-recompile.json

# Verify hashes
python3 -c "
import json, hashlib
with open('/tmp/splitflow-recompile.json') as f:
    out = json.load(f)
for fname, fcs in out['contracts'].items():
    if 'SplitFlow' in fcs:
        c = fcs['SplitFlow']
        c_sha = hashlib.sha256(bytes.fromhex(c['evm']['bytecode']['object'])).hexdigest()
        d_sha = hashlib.sha256(bytes.fromhex(c['evm']['deployedBytecode']['object'])).hexdigest()
        print('Creation:', c_sha, '==', c_sha == '0e2be52d87fc5a14bb15485e488fb1f871197ae01573eeba33cb7f859c05c2b0')
        print('Deployed:', d_sha, '==', d_sha == '74e87d8e24e7c73b7787931fc74154659e78613ea9ef874d511f95aab56ebf04')
"
```

The shell script `docs/deploy/verify-reproducibility.sh` wraps this exactly.

---

## 3. CBOR Suffix Decoded

The 51-byte CBOR suffix appended to the deployed bytecode contains:

| Field | Value |
|---|---|
| Map structure | `a2` = CBOR map(2) |
| Key 1 | `ipfs` |
| IPFS CID (keccak256 of metadata JSON) | `4ea07b475f7f4163858843c153f9b419bf4a890caf77eaa2fdfe9379935b6016` |
| Key 2 | `solc` |
| Compiler version | `0.8.28` |

The IPFS CID is the keccak256 of Forge's metadata JSON output for this compilation. Arc Explorer uses this CID to locate the metadata and verify source authenticity.

---

## 4. ABI Completeness

42 entries confirmed in `docs/deploy/SplitFlow.abi.json`:

| Type | Count | Names |
|---|---|---|
| constructor | 1 | `constructor(address _usdc)` |
| function (write) | 4 | `cancelBill`, `createBill`, `deposit`, `refund`, `settleBill` |
| function (view/pure) | 9 | `GRACE_PERIOD`, `MAX_PAYERS`, `MIN_PAYERS`, `billCount`, `getBill`, `getBillState`, `getMySlot`, `isRefundable`, `usdc` |
| event | 6 | `BillCancelled`, `BillCreated`, `BillFunded`, `BillSettled`, `Deposited`, `Refunded` |
| error (custom) | 19 | all 19 defined in contract |
| error (inherited OZ) | 2 | `ReentrancyGuardReentrantCall`, `SafeERC20FailedOperation` |

---

## 5. Deployment Package Files — Final State

| File | Size | Purpose |
|---|---|---|
| `contracts/SplitFlow.sol` | 19,902 bytes | Reviewed Solidity source |
| `contracts/out/SplitFlow.sol/SplitFlow.json` | Forge artifact | Compiled artifact (ABI + bytecodes) |
| `docs/deploy/SplitFlow.abi.json` | 11,592 bytes | ABI for Remix / frontend / Explorer |
| `docs/deploy/SplitFlow.creation.hex` | 12,663 bytes | Creation bytecode (paste into Remix Data field) |
| `docs/deploy/SplitFlow.deployed.hex` | 12,169 bytes | Runtime bytecode (for post-deploy verification) |
| `docs/deploy/SplitFlow.standard-input.json` | 54,217 bytes | **Corrected** Standard JSON — upload to Arc Explorer |
| `docs/deploy/compiler-config.json` | 274 bytes | Settings summary |
| `docs/deploy/constructor-args.json` | 306 bytes | `_usdc` ABI-encoded |
| `docs/deploy/integrity.json` | 2,335 bytes | All hashes + reproducibility status |
| `docs/deploy/verify-reproducibility.sh` | 1,655 bytes | Shell script for independent verification |
| `docs/deploy/deployment-package.md` | 11,805 bytes | Full deployment instructions |

---

## 6. Deploying the Exact Reviewed Bytecode (No Private Key in Arc Studio)

### Option A — Remix (recommended, no CLI)

1. Open [remix.ethereum.org](https://remix.ethereum.org)
2. Create `SplitFlow.sol` and paste the contents of `contracts/SplitFlow.sol`
3. Under **Solidity Compiler**: version `0.8.28`, EVM `paris`, optimizer enabled, 200 runs
4. Connect MetaMask to Arc Mainnet (chain ID 5042, RPC `https://rpc.mainnet.arc.io`)
5. Under **Deploy**: set `_USDC` = `0x3600000000000000000000000000000000000000`
6. Click **Deploy** — MetaMask prompts for signature; no key leaves the browser
7. After deployment, use **Contract Verification** → upload `SplitFlow.standard-input.json`

### Option B — forge script (your local machine, no broadcasting here)

```bash
# Install Foundry on your local machine, then:
forge script contracts/script/DeployCreate2.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --ledger \        # or --trezor, or omit and use keystore
  --broadcast
```

### Option C — cast send (direct CLI deployment)

```bash
# Read creation bytecode + append constructor arg:
CREATION=$(cat docs/deploy/SplitFlow.creation.hex | tr -d '\n')
CTOR_ARG=0000000000000000000000003600000000000000000000000000000000000000

cast send \
  --rpc-url https://rpc.mainnet.arc.io \
  --ledger \
  --create "${CREATION}${CTOR_ARG}"
```

**Pre-flight check before any of the above:** confirm the hex of the creation bytecode starts `0x6080604052` (standard Solidity init header) and its SHA-256 is `0e2be52d...c2b0`.

---

## 7. Arc Explorer Source Verification

After deployment (once you have the contract address):

1. Go to `https://explorer.arc.io/address/<CONTRACT_ADDRESS>`
2. Click **Contract** → **Verify & Publish**
3. Select **Solidity (Standard JSON)**
4. Upload `docs/deploy/SplitFlow.standard-input.json`
5. Enter compiler version `0.8.28`, EVM version `paris`
6. The explorer computes the CBOR IPFS CID from the submitted metadata. It must match `4ea07b475f7f...b6016` (embedded in the deployed bytecode). This will match exactly because the standard JSON is the corrected Forge-reproducible version.

---

## 8. Unresolved Limitations

| Limitation | Severity | Note |
|---|---|---|
| Arc Explorer source verification UI not yet confirmed | Low | Explorer exists at `explorer.arc.io`; Standard JSON upload is the universal format |
| No independent professional audit | Acknowledged | Automated review only. Disclosed in all user-facing materials. |
| Contract-level USDC freeze | Inherent | Disclosed in UI and design doc |
| Blacklisted payer | Inherent | Disclosed in UI and design doc |
