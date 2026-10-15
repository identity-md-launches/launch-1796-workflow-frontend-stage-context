# LastWord design

## Overview

LastWord is a public Ethereum billboard. The message is the visual center: a dark green sign with large cream serif text, beside the posting form on desktop and directly above it on mobile. The surrounding page is a quiet cream reading surface. The design is deliberately light-only; there is no theme toggle or marketing hero before the product.

This document describes the implemented source in `web/src/`. It is placed in `docs/` because the assignment's overriding path budget does not permit a root `DESIGN.md`.

## Colors

`web/src/styles.css` defines the canonical hex primitives and semantic roles. Components use roles rather than borrowing unrelated border colors for text.

| Role | Token | Value / primitive | Use |
| --- | --- | --- | --- |
| Page | `--color-page` | `#f4f1e8`, cream-100 | Main reading surface |
| Surface | `--color-surface` | `#fffdf7`, cream-50 | Fields, wallet button, dialogs |
| Text | `--color-text` | `#182d24`, green-900 | Body and headings |
| Secondary text | `--color-muted` | `#59645c`, gray-600 | Supporting copy, metadata |
| Separator | `--color-line` | `#e8e3d7`, cream-200 | Row dividers, disabled background |
| Control border | `--color-control-border` | `#b8bdb3`, gray-400 | Fields and neutral controls |
| Primary / board | `--color-accent`, `--color-board` | `#203b30`, green-800 | Primary action, billboard |
| Primary hover | `--color-accent-hover` | `#294b3c`, green-700 | Enabled primary hover |
| Inverse text | `--color-on-accent` | `#fffdf7` | Billboard and primary button text |
| Board metadata | `--color-board-muted` | `#c5d4c9` | Author, age, read status |
| Error | `--color-error` | `#a43626`, red-700 | Persistent inline error text |
| Focus | `--color-focus` | `#b04a26` | Three-pixel focus ring on light surfaces |
| Board focus | `--color-board-focus` | `#f0c49b` | Focus ring on the dark billboard |

The live dot uses `#b9d9a7`, the waiting dot `#dfb98c`, and each is accompanied by explicit status text. Selection pairs `#dfb98c` with the primary text color. The dialog backdrop is `#182d2477`. Actual rendered text pairs are checked by the pinned taste probe; detailed verification is in `docs/frontend/VALIDATION.md`. Forced-colors mode uses system `ButtonText`, `CanvasText` and `Highlight`.

## Typography

The system uses Arial / Helvetica / sans-serif for interface text and Georgia / Times New Roman / serif for the message, historical messages, review quotation and the short billboard rule. These are system font stacks; no font network requests are required. Exact glyph metrics depend on platform fonts.

| Role | CSS token | Size |
| --- | --- | --- |
| Labels, metadata, supporting copy | `--text-small` | 14px / 0.875rem |
| Body, inputs, buttons | `--text-body` | 16px / 1rem |
| Section headings, historical message | `--text-section` | 20px / 1.25rem |
| Desktop brand and totals | `--text-large` | 28px / 1.75rem |
| Billboard message | `--text-display` | 48px / 3rem; 32px / 2rem below 44rem |

CSS requests weights 400, 500 and 700; the installed system font may map 500 to its nearest available face. The headline is at weight 700. Body line-height is 1.5; explanatory columns use 1.6. The message uses 1.4 for multiline readability, with 1.15 on the short empty-state headline. Headings use 1.3. The display and brand track at -0.035em; body and labels use natural spacing. There are no tracked uppercase kicker labels.

Messages preserve whitespace and wrap even unbroken text with `overflow-wrap: anywhere`; `dir="auto"` isolates their direction from surrounding interface content. Critical addresses and amounts can wrap and remain selectable. `.number` uses tabular figures. Headings balance and paragraphs use pretty wrapping where supported.

## Layout

The shared page and header are at most 1248px wide including padding. Desktop inline padding is 40px; it becomes 24px below 58rem and 16px below 44rem. Spacing predominantly uses 8, 12, 16, 20, 24, 32 and 40px. Related labels and fields have 8px gaps; sections have larger 24–44px gaps.

`main-grid` has `minmax(0, 1.5fr)` and `minmax(0, 1fr)` columns with a 32px gap. Below 58rem it narrows to 1.2:1 and a 24px gap. Below 44rem it stacks the billboard and composer. The billboard's minimum height changes from 410px to 228px, but content is never cropped to a fixed height. Long real messages can grow the page vertically. No horizontal overflow is intentionally hidden.

The header keeps the brand left and the wallet control right. The optional history jump link disappears on narrow screens; history remains in document order. Mobile statistics use two columns and the rule spans the next row. About copy and the footer stack. History uses a narrow numeric column and one flexible text column. Wallet dialogs become bottom sheets on mobile with safe-area padding. Transaction review remains a centered native dialog.

Production-export checks cover 320, 390, 768 and 1440 CSS pixels, long values, 200% text enlargement, and an RTL mirror. Narrow-viewport and CSS text-enlargement tests are not claims of native browser zoom or physical-device testing.

## Elevation & depth

The page is mostly flat. The billboard uses a filled surface, statistics and history use structural separators, and fields use borders. Only modal dialogs use elevation (`0 20px 80px #0004`) and they have no decorative border. The backdrop dims the inert page. No gradient, animated ticker, nested-card system or page-load entrance animation is implemented.

## Shapes

The billboard radius is 3px; controls and fields use 6px. Centered dialogs use 12px. The mobile wallet sheet uses 16px top corners and square lower corners. The live indicator is a 7px circle. Wallet marks are 28px square with 5px rounding. Standard controls have a minimum height of 44px; the primary button is at least 50px and wallet rows at least 52px. Small copy controls are 28px high and spaced from nearby targets.

## Components

- **`Wallet` (`web/src/Wallet.tsx`)**: one header control for connection, switching, account details and disconnect. Named EIP-6963 rows carry wallet-provided marks. Phone links use locally bundled marks. Rows show their own pending state and recoverable rejection. Wrong-chain controls remain visible.
- **`Modal` (`web/src/Wallet.tsx`)**: shared native `<dialog>`, labelled by its title. The page behind it is inert. Escape, backdrop and the close button dismiss it. Explicit Tab wrapping and restored trigger focus supplement the native dialog behavior. `.wallet-dialog` is the mobile-sheet variant.
- **Billboard (`App.tsx`, `.billboard`)**: current message, author, chain-derived age and observed count. Loading, empty and connection-error states describe what is known. It never presents seeded content as a real post.
- **Composer (`App.tsx`, `.composer`)**: labelled textarea, Unicode count, free-mode eligibility or paid-mode exact burn field. One main action shows approval/reset/post as appropriate. Errors stay near the action; transaction status uses a polite live region. Pending actions remain disabled through confirmation and refetch.
- **`AddressLink` (`App.tsx`)**: checksummed explorer link, copy control and full-address tooltip. Full address variants appear in deployment details and consequential reviews. Addresses never become a different inferred identity.
- **Transaction review (`App.tsx`)**: exact message, amount, spender or token, estimated ETH fee and explicit final action. The one-time token setting states its permanence. A review can be dismissed before any signature is requested.
- **History (`App.tsx`, `.history-list`)**: up to 50 chronological records rendered newest first, including the current record. Text is never HTML. Each row shows author, timestamp and actual burn/free mode.
- **Owner setup (`App.tsx`, `.owner-panel`)**: appears only for the read-back owner and only before token connection; labelled token address, acknowledgement and permanent-action review.

Buttons have rest, hover, pressed, disabled and keyboard-focus treatments. High-frequency color changes use 120ms transitions only when reduced motion is not requested. There are no endless animations. Useful text and values stay selectable.

## Do's and don'ts

Reuse semantic color roles, the small type scale, `.page`, `.section-heading`, native fields and `Modal`. Keep a single dark filled primary action in the active task area; neutral utilities remain secondary. Add explanations beside the action they govern. Keep the product before the explanatory content.

Do not introduce another deployment map, guessed token, price feed or transaction route. Do not hide overflowing balances or addresses, render message HTML, silently raise a chosen spend, or make an unverified action look ready. A new section should use the existing grid and spacing, then be checked at 320 and 390px with its longest values before adding new tokens.
