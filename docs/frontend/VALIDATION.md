# LastWord frontend validation

Completed on 2026-10-15. This is worker-run evidence, not independent certification. The deliverable is source under `web/`, a static export prepared for submission under `dist/`, and documentation under `docs/`. No contract was changed, deployed, signed for, or sent a real transaction.

| Review area | Final result |
| --- | --- |
| Approved product requirements | Implemented; no fabricated live data |
| Required worker checks | Clean install, typecheck, build, five domain tests, 18 browser scenarios passed |
| Product and primary control at 390px | Yes; observed in `screenshots/live-390.png` and asserted in browser tests |
| Design probe | 16 / 16 checks passed |
| Outstanding observed bugs | None in the tested flows |
| Share metadata | Title, description, favicon, og:title, og:image and Twitter card present |
| Publication | Publisher responsibility; no hosted URL or CID claimed |
| Root DESIGN.md | Delivered as `docs/DESIGN.md` because the overriding write budget forbids root writes |

The visual idea is a large serif message on a dark green billboard, with its posting form immediately beside or below it.

## Requirement coverage

| Approved requirement | Implementation and evidence |
| --- | --- |
| “one public billboard message of up to 140 characters” | `App.tsx` reads `currentMessage()` and renders text in the main heading; scalar-value validation rejects empty, over-140 and unpaired-surrogate input. Five domain tests include Unicode boundaries. |
| “current message very large … author and how long it has stood” | `.billboard` uses 48px desktop / 32px mobile message text, explorer/copy author and elapsed time. Elapsed display interpolates from the observed chain timestamp; eligibility never uses the visitor's clock. |
| “free … once per wallet every 10 minutes” | `nextFreePostAt(account)` controls the free-post action. `setMessage(text, 0)` sends no ETH value. Mocked receipt/cooldown interaction passed. |
| “minimum burn … Approve then Post” | The amount uses contract-cached decimals, never floating-point math. The displayed minimum is read live. Exact approval goes to LastWord; nonzero insufficient allowances have a visible reset step. Approval and posting have separate review/receipt stages. Six-decimal and 18-decimal scenarios passed. |
| “each next one at least 10% more … 24 hours … back to 1,000” | Reads `minimumBurn()` from the contract instead of inventing a quote. Explains escalation, exact spend and reset. Re-reads before review and signing; a raised minimum stops the transaction without increasing spend. Live paid behavior remains untested because the token is unset. |
| “last 50 messages … total tokens burned” | One fixed-block `getRecentMessages()` call, newest-first display, per-row burn and lifetime `totalBurned()`. Fifty-row and extreme-value mock passed. |
| “setToken … owner … only once” | Owner identity comes from `owner()`. The setup panel appears only for that account while token is unset. Address, code, decimals, acknowledgement and permanent-action review are required. A mocked successful setting hides setup and activates paid controls. |
| “token features … until it is set” | No approval or burn input in free mode. Visitors see “Token not connected.” There is no guessed token, token launch or pool control. |
| Wallet connection | EIP-6963 discovery, reconnect via wagmi storage, browser-wallet fallback, phone deep links with marks, Coinbase SDK, account/explorer/disconnect panel. Wrong chain offers switch and exact add-chain fallback. |
| Static hosting | Vite relative base, local assets, same-page anchors, no backend. Browser scenarios exercise the actual `dist/` at `/preview/`. |
| Runtime configuration / ABI | App fetches `imd-deployment.json`, then its ABI path. Canonical ABI hash verification fails closed. Every chain/address/RPC source comes from that manifest or live contract reads. |
| Deployment manifest | Exact handoff identity, source commit, attestation, contract set, ABI hash, network and add-chain block. No pool key exists in this handoff. All 13 other export files are SHA-256 inventoried. |
| Protected source/configuration | Existing contract source, root config, Foundry files, dependencies and root documentation untouched. Only `web/`, `dist/`, and new `docs/` artifacts are delivered. `web/.gitignore` is the explicitly budgeted ignore file. |

## Commands and results

The final source was checked after corrections and formatting:

| Command | Outcome |
| --- | --- |
| `npm ci --prefix web --cache /tmp/lastword-npm-cache` | Exit 0; lockfile install, 53 packages; npm reported zero vulnerabilities |
| `npm run --prefix web typecheck` | Exit 0 |
| `npm run --prefix web test` | Exit 0; 5 tests passed |
| `npm run --prefix web build` | Exit 0; Vite production export, pinned ABI validation, manifest generation and export verification |
| `npm run --prefix web verify` | Exit 0; 13 assets, 770,874 asset bytes, exact inventory and hashes |
| `npm run --prefix web test:browser` | Exit 0; 18 scenarios passed; no page errors or missing local resources |
| Pinned `taste.mjs --out test/scratch/taste` | Exit 0; 16 / 16 checks passed on the final export |

The browser commands used `PLAYWRIGHT_BROWSERS_PATH` pointing to a temporary directory. WebKit initially lacked Linux libraries; public Ubuntu runtime packages were downloaded and extracted to a temporary directory without changing system files. Its temporary launcher and library search path were adjusted to use those libraries and software EGL. The final WebKit check actually launched, navigated and completed the mocked free-post flow; it is not an inferred pass. Browser binaries, extracted libraries, package archives and caches are excluded from the delivery.

The supplied probe is a pinned input and disappears after submission; `design-probe.json` retains its final checks, thresholds and outcomes. `interaction-results.json` records the browser scenarios. The source for reproducible interaction checks is `web/tests/browser.mjs`. A receipt-wait fixture initially failed to advance its mocked block number; that test infrastructure defect was repaired by mining the next mock block when the receipt became available.

## Real chain observations

`chain-read.json` records a read-only observation at Ethereum block **26,194,609**, using the assignment's contributor RPC transport and naming the approved public source `https://ethereum-rpc.publicnode.com`.

- Chain ID: 1.
- LastWord: `0xa47376608ecc82972c711993c20b7b2b9dbe79bb`.
- Deployed code: 5,306 bytes, nonempty; Keccak-256 recorded in the JSON evidence.
- Owner: `0xb77161bbaf98470c6c5101899d30df413f9a019d`.
- Token: unset, as explicitly defined by the contract's zero-address sentinel.
- Message count, minimum burn and total burned: zero; current message and history empty.
- Implementation ABI canonical Keccak: `b07509ebaf542d356344011eee7be13e36a1322f223302f9c69063c228adf1d2`, matching the handoff and the ABI at source commit `d3247e54976f9b5597a1f1de4b8140dc1cc46e0e`.

The browser also loaded real public reads from the production export, with no console errors. Runtime configuration, ABI, script, CSS, favicon and Coinbase chunk returned HTTP 200 from the preview subpath. A nonempty-code check establishes presence, not an independent audit of deployed semantics. The existing deployment attestation supplies the binding this frontend preserves.

## Better Interface coverage

| Domain | Checked coverage | Remaining limits |
| --- | --- | --- |
| Accessibility | Native controls/landmarks, persistent labels, visible focus, modal Escape/backdrop/close, explicit Tab wrap and focus return, inert modal background, inline error roles, polite transaction status, target sizes, 200% text enlargement and reduced motion. | No screen-reader session, native browser-zoom session, physical-device or forced-colors visual inspection. |
| Layout | Production subpath at 320/390/768/1440; first-screen action at 390; long amounts, full contract address, 50 records and long Unicode message; RTL mirror; wallet sheet and review dialog. No horizontal overflow in measured states. | Not every viewport, translation or possible message has been inspected. Very long messages and paid-mode explanations intentionally grow vertically. |
| Writing | Action-specific labels, explicit exact spend and permanent token setting, next-step errors, distinguish loading/empty/stale/pending/success/rejected states, no invented USD conversion. | English only. User-authored content is unmoderated and outside the site's copy review. |
| Typography | Two system font families, three weights, at most five rendered sizes per measured width, 16px inputs, wrapping, tabular numbers, selectable values; display is the largest/heaviest text. | Platform-specific font rasterization varies; no downloaded font files are involved. |
| Colors | Semantic tokens and measured actual foreground/background pairs; probe passes all measured contrast pairs. Status combines text with color. | No claim that every wallet-supplied icon or externally hosted Coinbase screen was contrast-audited. |
| UI | Shared controls, rest/hover/pressed/disabled/focus, loading/empty/error/success flows, restrained conditional 120ms color transitions, flat surfaces, modal-only shadow, no perpetual motion. | No slow-motion animation-panel recording; there are no staged or looping animations to inspect. |

Computed-color measurements in the browser, using WCAG relative luminance: primary text on page **12.92:1**; billboard text **11.94:1**; muted intro text **5.47:1**; input text **14.34:1**; disabled primary text **4.82:1**. These measurements use the actual resolved backgrounds. The taste probe also reported no overlaps or clipped text, no all-caps content, no excessive tracking, no kicker labels, no repeated lines, no nested cards and no `transition: all`.

## Findings, fixes and rechecks

1. **Medium · Accessibility: dialog keyboard focus.** Location: `web/src/Wallet.tsx:19` and `web/src/Wallet.tsx:37` (`Modal` cleanup and `onKeyDown`). Initial Escape closure did not reliably restore the trigger, and repeated Tab could escape the active dialog. The browser tests reproduced both. Explicit post-unmount focus restoration and wrapping at first/last controls fix this. Final Escape and ten-Tab assertions passed at 390px.
2. **High · Writing/transaction feedback: a post's words could change its error classification.** Location: `web/src/domain.ts:64` (`explainError`). The original broad “rejected” check matched untrusted transaction arguments inside a simulation error. A post reading “A rejected simulation.” incorrectly showed wallet rejection instead of `BurnTooSmall`. Error classification now walks structured codes and ABI-decoded errors; regression and browser tests passed, with no signature request on simulation failure.
3. **Medium · Wallet error recovery.** Location: `web/src/domain.ts:69`. Wagmi's missing-provider error is a different error class from viem's. It originally exposed a provider/version message. A bounded cause walk now gives an actionable extension-or-Coinbase instruction. Missing-wallet and rejected-connection retry tests passed.
4. **Medium · Phone handoff link.** Location: `web/src/Wallet.tsx:92`. The pinned reference listed Rabby without a complete URL example. Reading Rabby's public handler established `_cmd=open-dapp&dapp=...`. The final link uses those parameters and preserves the current URL. Browser link presence/shape checked; physical handoff remains unperformed.
5. **Medium · Transaction observability.** Location: `web/src/App.tsx:95` and `web/src/App.tsx:328`. Source review identified that a reload could lose the pending lock and a replacement receipt could be described as the original success. The hash is now preserved in session storage and other actions stay locked until a status check; replacement/cancellation is distinguished from repricing. Reload/status recovery is browser-tested. A real replacement transaction was not broadcast or tested.

All observed applicable findings above were fixed. No high finding remains in the checked states. Copy controls remain 28px rather than the preferred 44px, with spacing that passed the probe's 24px rule; this is a recorded density choice, not a claim that all controls are 44px.

## Evidence files and limits

- `interaction-results.json`: final intercepted browser scenarios, including Chromium and WebKit. Synthetic wallet/token fixtures are test-only and never shipped as runtime state.
- `design-probe.json`: final 16-check probe report, without temporary server/filesystem details.
- `chain-read.json`: real fixed-block read evidence; zero broadcasts.
- `screenshots/live-390.png`, `screenshots/live-1440.png`: final probe screenshots with real public state. The phone screenshot was visually inspected and the main control is on its first screen.
- `screenshots/mobile-390.png`, `screenshots/desktop-1440.png`: production-export screenshots under deterministic intercepted RPC responses.
- `screenshots/mobile-wallets.png`: emulated iPhone wallet sheet with mobile links and Coinbase Smart Wallet.

No live post, approval, token connection, passkey creation, physical phone handoff, hardware-wallet interaction, real transaction replacement, chain reorganization or long-lived RPC outage was exercised. No token exists in the observed deployment, so all paid-mode behavior was validated with explicit mocks. ENS resolution is not implemented; checksummed addresses, complete explorer links and copy controls are provided. USD context is unavailable because the brief supplies no price source. Absolute social-image URLs await the publisher's final origin. Hosting/CID/named-entrypoint checks remain the control plane's responsibility.

**Implementation and validation complete for the stated frontend scope**, with the documented path-budget adjustment and live-wallet/publication limits. No publication check is presented as evidence of browser behavior.

## Git submission limitation

The final `git add -- web dist docs/DESIGN.md docs/frontend` attempt failed with exit 128: `.git/index.lock: Read-only file system`. Repository metadata is mounted read-only by the worker. No commit or staging operation succeeded; the deliverable remains in the working tree for the managed submission service. This is an environment constraint, not missing requester input, and no root blocked-input file was created. The size/path report describes the exact intended submission files.
