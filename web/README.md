# LastWord frontend

A static React/TypeScript app for the deployed LastWord billboard. The production files are delivered in [`../dist/`](../dist/). Hosting, IPFS pinning, site naming and contract deployment belong to the publisher; this app needs no backend.

## Install, build and preview

Use Node.js 24 and npm 11 (the lockfile pins the tested dependencies). From the repository root:

```sh
npm ci --prefix web
npm run --prefix web typecheck
npm run --prefix web test
npm run --prefix web build
npm run --prefix web verify
npm run --prefix web preview -- --host 127.0.0.1
```

Vite uses `base: './'` and writes directly to root `dist/`. Serve the whole directory, including `imd-deployment.json` and `abi/`. No history routing or server rewrites are needed. The application works under a gateway subpath. For development, run `npm run --prefix web dev`. Vite serves the same configuration shape from the build template and the referenced ABI from `docs/abi/`; production always fetches the final exported manifest. Use the production preview for integration checks.

## Deployment configuration

`dist/imd-deployment.json` is the **only runtime deployment configuration**. `src/config.ts` fetches it, loads its referenced ABI JSON, verifies the ABI's canonical Keccak-256 hash, and constructs the chain, public clients and wallet connectors from its network block. Nothing imports a second address/chain map into the browser bundle.

`deployment.template.json` is a build input copied from the validated handoff. It is not bundled or fetched by the application. It preserves the launch ID, source commit, attestation, exact contract set and network/add-chain objects. This assignment has no pool key, token deployment or pool. Uniswap addresses in the unchanged network block are unused. The future token is read from `LastWord.token()`; the owner enters its verified address when it exists.

After Vite exports, `scripts/export-manifest.mjs`:

1. Reads `docs/abi/LastWord.json` from the pinned Git commit with `git show` and checks its canonical Keccak hash against the handoff.
2. Confirms the working ABI is identical under canonical hashing and exports that raw JSON array.
3. Enumerates every exported file except the manifest and calculates SHA-256 from its final bytes.
4. Writes `imd-deployment.json`, then checks exact configuration, safe paths, asset inventory, file sizes and ABI hashes. When the pinned `.imd/reads` inputs are present, it also compares directly against them.

A rebuild needs the pinned commit in local Git history. Canonical ABI hashing recursively sorts object keys, preserves array order, uses compact JSON and Keccak-256, and stores lowercase hex without `0x`. Never edit exported files after manifest generation. Rebuild or rerun the manifest exporter after any export change.

## Contract and wallet behavior

- The public board reads without connecting. A fixed-block snapshot contains the current message, the last 50, minimum burn, totals, token and owner. Connected reads add balance, allowance and free-post eligibility. Polling runs every 5 seconds connected, 12 seconds disconnected, and pauses in the background. Public RPCs fail over in their configured order.
- The RPC chain ID and contract code must verify before reads are accepted. Stale or failed state, missing approval, an active cooldown, an invalid message/amount, an absent wallet or a wrong chain disables transactions.
- Text is 1–140 Unicode scalar values, preserved and rendered as text. No user HTML is interpreted. Amounts use integer arithmetic and the token decimals cached by LastWord; excess decimal precision is rejected rather than rounded.
- Free posts use `setMessage(text, 0)` with no ETH value. Gas still costs ETH.
- Paid posting shows the exact irreversible spend. The ERC-20 approves **LastWord**, not a router or Permit2. An insufficient nonzero allowance is explicitly cleared before an exact approval. Posting is a separate reviewed, simulated transaction. The chosen amount never silently increases when the minimum changes.
- Simulation and gas estimation precede review. Account, chain and contract state are checked again immediately before asking the wallet to sign. Each action stays locked through the receipt and state refresh. A pending hash is retained in session storage across reloads. A timeout requires a status check; rejection preserves the draft. Receipts are checked for reverts and replacements.
- Only the on-chain owner sees `setToken` setup while the slot is unset. Address validation, deployed code, metadata, acknowledgement and an explicit permanent-action review precede its transaction. Visitors see that the token is not connected. No token address is guessed.
- Browser wallets are discovered by EIP-6963 through wagmi; the generic row disappears when a named wallet is found. The same header control offers account details and disconnect. On the wrong network it switches chains, adding the exact handoff chain parameters after error 4902 or an unknown-chain response.
- Phones get MetaMask, Coinbase Wallet, Rabby and Phantom app-browser links; Coinbase Wallet's SDK also supports a passkey smart wallet. No relay or project ID is used. Real app handoffs and real passkey creation were not exercised by the worker.

## Validation and evidence

```sh
# Install browser runtimes outside Git, then test the actual production export.
PLAYWRIGHT_BROWSERS_PATH=/tmp/lastword-browsers web/node_modules/.bin/playwright install chromium webkit
PLAYWRIGHT_BROWSERS_PATH=/tmp/lastword-browsers npm run --prefix web test:browser

# Available while the pinned design-review input is present:
PLAYWRIGHT_BROWSERS_PATH=/tmp/lastword-browsers \
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" \
node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The browser script serves `dist/` at `/preview/` inside its own bounded process and intercepts RPC and wallet calls. It never signs or broadcasts on a real chain. Chromium and WebKit need their normal Linux runtime libraries; missing WebKit support is recorded as a limitation, not a pass. `TEST_FILTER` can select a named scenario during repair; use an unfiltered run for final evidence. Browser outputs live in `docs/frontend/`; temporary artifacts live in `test/scratch/`.

See [`../docs/frontend/VALIDATION.md`](../docs/frontend/VALIDATION.md), [`../docs/DESIGN.md`](../docs/DESIGN.md) and the machine-readable reports. The report distinguishes mocked transactions from real read-only chain observations. No live token approval, post, token configuration, Coinbase passkey or mobile-app signing is claimed.

All fonts and first-party visuals are local or system-provided. `public/share.png` is a delivered typography-only share card; optionally regenerate it with `PLAYWRIGHT_BROWSERS_PATH=/tmp/lastword-browsers node web/scripts/share.mjs`. Metadata image paths remain relative until the publisher supplies a public origin.

## Source map and scope

- `src/App.tsx`: billboard, composer, transaction review/receipt lifecycle, history and owner setup.
- `src/chain.ts`: verified reads at one block.
- `src/config.ts`: manifest/ABI loading, public transport and wagmi construction.
- `src/Wallet.tsx`: native modal, wallet discovery, mobile links and add/switch chain.
- `src/domain.ts`: exact amounts, Unicode validation, durations and error translation.
- `src/styles.css`: design tokens and responsive components.
- `scripts/`: export generation/integrity and optional share-card generation.
- `tests/`: domain regression tests and actual-export browser interactions.

The explicit ignore-file budget is **`web/.gitignore` only**. It excludes dependency/cache trees at every nesting level under `web/`. No dependencies or archives are vendored. The root `DESIGN.md` request conflicts with the assignment's overriding write scope; its complete content is delivered at `docs/DESIGN.md`. Contract source, Foundry configuration, root manifests and existing contract documentation are preserved.

## Submission environment

This worker checkout mounts `.git` read-only. `git add` failed with exit 128 because it could not create `.git/index.lock`; therefore the worker did not create a commit. All source, lockfile, export and evidence files are present for the managed submission step to commit. No approval or account input can change that within this worker session.
