# SplitFlow — Arc Mainnet Deployment

## Deployed Contract

| Property | Value |
|---|---|
| Network | Arc Mainnet |
| Chain ID | 5042 |
| Contract address | `0xf28Ee372004dfEb66e54a014E437fbd196d79bB6` |
| Explorer | https://explorer.arc.io/address/0xf28Ee372004dfEb66e54a014E437fbd196d79bB6?tab=contract |
| Verification | **Exact Match** |
| Verification method | Source upload via Arc Explorer |
| Constructor arg `_usdc` | `0x3600000000000000000000000000000000000000` |

## Compiler Settings (Deployment)

The contract was deployed and verified using Remix IDE. The verification succeeded with an **Exact Match** against the on-chain bytecode.

| Setting | Value |
|---|---|
| Compiler | Solidity 0.8.28 |
| EVM version | paris |
| Optimizer | Enabled, 200 runs |
| License | MIT |

> **Note on toolchain.** The repository also contains Foundry (`forge build`) compilation artifacts under `contracts/out/`. These were used for development, testing, and the reproducibility analysis in `docs/deploy/integrity-check-5b1.md`. The Foundry artifact and the Remix deployment artifact are compiled from the same reviewed source with the same settings, but their CBOR metadata suffixes differ due to Foundry's build-info metadata embedding. The on-chain runtime bytecode (excluding the CBOR suffix) is identical. The Remix-produced bytecode is what was deployed and verified on Arc Explorer.

## USDC Token

| Property | Value |
|---|---|
| Address | `0x3600000000000000000000000000000000000000` |
| Symbol | USDC |
| Decimals | 6 |
| Verification | Live-verified at deployment preflight (`name()=USDC`, `symbol()=USDC`, `decimals()=6`) |

On Arc Mainnet, USDC is also the native gas token. The contract uses the ERC-20 interface (6 decimals) exclusively for all deposits, settlements, and refunds.

## Deployment Method

The contract was deployed by the developer using Remix IDE connected to MetaMask on Arc Mainnet. No private key was stored in this repository, in Arc Studio, or in any CI environment.

Steps performed outside this repository:
1. Opened Remix IDE at remix.ethereum.org
2. Pasted `contracts/SplitFlow.sol` (with OpenZeppelin imports resolved)
3. Compiled with Solidity 0.8.28, paris EVM, optimizer 200 runs
4. Connected MetaMask to Arc Mainnet (chain ID 5042, RPC `https://rpc.mainnet.arc.io`)
5. Deployed with constructor argument `0x3600000000000000000000000000000000000000`
6. Uploaded source to Arc Explorer for verification — result: **Exact Match**

## Mainnet Demonstration

A live demonstration was performed after deployment:

| Property | Value |
|---|---|
| Bill ID | 0 |
| Title | (demo bill) |
| Total | 0.20 USDC |
| Payer count | 2 |
| Deposits | 2/2 |
| Final state | **SETTLED** |
| Demo URL | https://splitflow.wizpay.xyz/bill/0 |

## Gas Costs (Observed)

Arc Mainnet fees are denominated in USDC (native gas). Observed costs at ~20 Gwei base fee:

| Operation | Approximate cost |
|---|---|
| Contract deployment | ~0.027 USDC |
| `createBill` | ~0.003–0.005 USDC |
| `deposit` (per payer, including prior ERC-20 approve) | ~0.002–0.004 USDC |
| `settleBill` | ~0.002–0.003 USDC |

## Security Notes

- The contract has not undergone an independent professional security audit.
- Automated security review (Slither, structured rule-corpus) was performed during development. See `docs/security-review.md`.
- Two Medium findings from the automated review were fixed before deployment.
- Known limitations (USDC blacklisting, contract-level freeze) are documented in `README.md`.

## Foundry Deployment Package

The `docs/deploy/` directory contains:

| File | Contents |
|---|---|
| `SplitFlow.abi.json` | Full ABI |
| `SplitFlow.creation.hex` | Foundry creation bytecode |
| `SplitFlow.deployed.hex` | Foundry deployed bytecode |
| `SplitFlow.standard-input.json` | Solidity Standard JSON (10 sources embedded) |
| `compiler-config.json` | Compiler settings record |
| `constructor-args.json` | Constructor argument |
| `integrity.json` | SHA-256 + keccak256 hashes, reproducibility status |
| `verify-reproducibility.sh` | Shell script to reproduce Foundry bytecode |
| `deployment-package.md` | Full deployment instructions |
| `integrity-check-5b1.md` | Detailed reproducibility analysis |

These artifacts describe the Foundry-compiled version of the contract. The deployed and Arc Explorer-verified contract used Remix's compiler output, which produces the same runtime opcodes but a different CBOR metadata suffix.
