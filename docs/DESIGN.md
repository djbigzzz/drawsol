# DrawSol design system: clean commercial

This is the spec for the DrawSol frontend in the **clean commercial** direction, chosen after the Ticket Office (paper, stamps, serif) and the dark crypto templates were rejected. The reference is how Irish and UK prize-draw sites sell one draw: McKinney, Omaze UK, Dream Car Giveaways, Blaa (the ticket picker), Ooosch (the instant-prize schedule). SPEC.md §4.1 (honesty rules) and §4.4 (data layer) still apply unchanged; this document replaces the Ticket Office spec.

The site is **one draw**: the newest open headline draw on chain (falling back to the newest headline draw of any status; pot draws never feature). Everything on the page is read from Solana devnet. When a number can’t be read it isn’t shown, and USD figures come from a live SOL quote (CoinGecko) and are hidden, never estimated, when no quote is available.

Example values in this document come from the fixture `open` scenario (`app/src/fixtures/data.ts`): Draw № 6, “Win $500 cash + instant prizes”, 586 of 2,000 sold, $1.00 (0.00838 SOL) a ticket, draws Sun 11 Oct 20:00 UTC, 69 instant prizes. They are examples, never constants.

---

## 1. Brand idea

> **A prize draw you can check, sold the way the best prize-draw sites sell: one big card, one price, one purple button.** White page, near-black navy type, a single purple accent (Solana purple) for the action, the money and the progress, gold only in the artwork. No decoration carries meaning that a number can carry instead.

What this means in practice:

- **The hero card is the product.** Prize headline on the left, the sold meter and the ticket picker on the right. Explanations live below the fold.
- **Every promise has a link.** Prize locked (vault), winner by ORAO VRF (recompute), guaranteed draw or full refund (draw account), every entry public (entries page).
- **One accent, used with discipline.** Purple is the Enter button, the total, the per-ticket price, the progress fill, the winning ticket and a win. Nothing else is purple, except the logo mark, which carries the brighter Solana `--highlight` in its gradient.
- **Artwork carries the prize, never a number.** Three generated graphics (`app/public/art`, white backgrounds): the $500 cash stack in the hero (through `mix-blend-mode: multiply` on the grey block), the instant-prize card beside the Prizes intro, the confetti ring behind the reveal’s “You won” total and, faintly, the settled winner card. They are referenced through `art()` in `lib/config.ts`, which prefixes the site’s base path.
- **No template tells.** No gradient text, glow blobs, glassmorphism, emoji, decorative card grids, serif or italic labels, or filler copy.

---

## 2. Tokens

### 2.1 Colour (`app/src/app/globals.css` `:root`, mirrored in `tailwind.config.ts`)

| Token | Hex | Role |
|---|---|---|
| `--white` | `#FFFFFF` | Page and card background |
| `--navy` | `#0B1220` | Text, dark pills, the secondary (navy) button |
| `--navy-2` | `#3B4555` | Body copy and labels |
| `--navy-3` | `#5F6878` | Captions, units, muted figures (≥ 4.5:1 on white and on `--surface`) |
| `--surface` | `#F5F7FA` | Grey surfaces: the prize half of the hero, trust items, sums |
| `--surface-2` | `#EBEEF3` | Meter track, disabled buttons, tab rail |
| `--line` / `--line-2` | `#E3E7EE` / `#CBD2DC` | Card borders / control borders |
| `--accent` | `#7C3AED` | The accent: primary button, prices, totals, winning ticket, wins, progress fill (5.9:1 with white text) |
| `--accent-2` | `#6D28D9` | Primary button hover |
| `--accent-bar` | `#7C3AED` | Progress fill, the slider track and the wallet dot (non-text) |
| `--highlight` | `#9945FF` | Solana purple: the logo mark’s gradient (with `--accent`) and decoration only, never text |
| `--accent-tint` / `--accent-line` | `#F5F3FF` / `#DDD6FE` | Win chips, success panels, the Open pill |
| `--warn` / `--warn-tint` | `#B45309` / `#FFFBEB` | Draw due / drawing pills, the stale note, devnet-SOL notes |
| `--danger` / `--danger-tint` | `#B91C1C` / `#FEF2F2` | Errors only |

The palette is closed. Green (`#15803D`) was the accent until the brand moved to Solana purple; orange was considered and rejected: it fails AA with white text at button size. Purple beside the gold of the artwork is intended.

### 2.1a Logo

A ticket stub tilted 12° to the left, filled with the `#9945FF` → `#7C3AED` gradient (top-left to bottom-right), rounded corners, the two notches at mid-height and a white five-point star; beside it the wordmark “DrawSol” in Plus Jakarta Sans 800, `--navy`, tight tracking (`components/Logo.tsx`, 30px in the header, 24px in the footer). Files: `app/public/brand/drawsol-mark.svg` (icon), `drawsol-logo.svg` (mark + wordmark), `app-icon-512.png`, `drawsol-logo-2000.png`, `og-1200x630.png` (the social preview, linked from `layout.tsx`); the favicon is `app/src/app/icon.svg`, the mark on a white rounded square.

### 2.2 Type

One family, self-hosted: **Plus Jakarta Sans Variable** (`@fontsource-variable/plus-jakarta-sans`). 800 for headlines, 700 for UI and figures, 500/600 for body. Tabular numerals (`.tab`) on every figure that updates.

| Class | Size (mobile → desktop) | Use |
|---|---|---|
| `.t-win` | 48 → 72 → 88px, 800, uppercase, −0.035em | “WIN $500 CASH” |
| `.t-h1` / `.t-h2` / `.t-h3` / `.t-h4` | 32→40 / 26→30 / 20→22 / 17px | Page, section, card, sub-card headings |
| `.total b` | 40px, 800 | The live total |
| `.winner-ticket`, `.live-num` | 56px / 72→160px | Winning ticket |
| body | 16px/1.5, 500 | Everything else |

### 2.3 Space, radii, elevation

8px rhythm (`gap`/`padding` are multiples of 8; 4 only inside controls). Page max-width 1200px, gutters 16/24/32px. Radii: 8 (inputs), 12 (panels), 16 (cards), 20 (the hero, sheets), pills 999. Shadows only on the hero card (`--shadow-card`), popovers and sheets. Breakpoints: 761 (tablet), 1024 (desktop: hero goes two-column, sticky bar disappears), 1280 (headline grows).

---

## 3. Structure of the page

1. **Devnet bar** (`.devbar`): “Devnet demo · play money (devnet tokens are not real)”, sticky, on every page. The fixture badge sits inside its right end.
2. **Header**: the logo, Winners, How it works, wallet button (outline pill with the short address and balance).
3. **Hero card** (`Hero.tsx`), two columns from 1024px:
   - **Prize block** (grey): pills “DRAW № 6 · OPEN”; “WIN $500 CASH” from `lib/campaigns.ts` (the nominal headline the draw was sold under, mirrored by its terms file), “+ 69 instant prizes”; the escrow line always from chain (“4.19 SOL escrowed ↗”, and for a guaranteed draw “End prize right now $205 · becomes $500 at 1,430 sold”); the campaign’s artwork (`Campaign.art`: the $500 cash stack), a 220px band under the lock line on phones and, from 1024px, the bottom of the column, taking the height the entry panel leaves and sitting on the card’s edge; facts: ticket price ($1.00 · 0.00838 SOL), draw time, live countdown; the instant-prize summary; the vault balance. The artwork is skipped when the headline isn’t the nominal figure (a guaranteed draw settled under its minimum) and on a cancelled draw.
   - **Entry panel** (white): the sold meter first (“29%” · “586 / 2,000 tickets sold”, accent bar, a tick at the minimum, the note “1,430 sold unlocks the full end prize · 844 to go”), the Paid / Free entry tabs of equal weight, then the **picker** (§4).
4. **Trust strip**: four promises with links.
5. **Prizes** (`Prizes.tsx`): the end prize row with its rule stated in full, then the instant-prize accordion (§5).
6. **How it works**: three numbered steps (Get your tickets / Reveal if you’ve won / End prize drawn Sunday).
7. **Your tickets**: one row per purchase with the ticket numbers as chips (wins and the drawn ticket highlighted), Reveal for sealed purchases, Refund when cancelled.
8. **Winners**: instant wins (from Entry accounts) and every settled draw (from Draw accounts) with ticket, wallet, payout link and record link; cancelled draws as one line; an honest empty state.
9. **Rules and questions**: a short FAQ, the terms hash. **Play safe**: a collapsed section with the spend limit and break (program-enforced), BeGambleAware.
10. **Footer**: program ID, source, rules, play safe, every draw, live.

Mobile: the hero stacks (prize block, then panel); a **sticky bottom bar** shows “5 tickets · $5.00 · ENTER NOW” while the panel’s own button is off screen.

---

## 4. The picker (Blaa pattern)

`EntryPanel.tsx`, in this order: “How many tickets?” → range slider 1…max (28px accent thumb, min/max labels) → price row (“$1.00 per ticket · 0.00838 SOL” in accent, −/+ stepper with the number in a grey box) → preset chips (the five largest below max, then “Max · 1,000”) → “Total (5 tickets)” and the total in 40px accent with the SOL figure beside it → fee line (expandable breakdown, from chain) → one full-width accent pill **ENTER NOW · $5.00** → the draw rule in one line → “Free entry, no purchase needed” link (switches to the Free entry tab) → “Up to 1,000 per purchase · 2,000 entries max per person”.

Slider, stepper and chips share one state (`BuyContext`); the total updates live, nothing reflows. `max` is the least of per-purchase cap, per-wallet room, tickets left and the spend limit. With a low balance the button becomes **Get devnet SOL** (the faucet, from the browser) with the shortfall stated.

**Flow**: Enter now → confirm sheet (summary in USD and SOL, fee line, 18+ asked once per device, Pay) → wallet → on draws with instant prizes the **reveal sheet** (“Revealing your tickets…” while ORAO assigns the numbers, then each ticket flips to its number and “No win” / “Won $10”, the total paid, tx links, Done); on draws without, the **success sheet** (“You’re in · Tickets #0139–#0143”, tx link). Both are centred dialogs on desktop and bottom sheets on phones, with a focus trap and Esc.

---

## 5. Prizes and the instant-prize schedule (Ooosch pattern)

- **End prize row**: “$500 cash”, the rule in full (“$500 is escrowed and is paid in full once 1,430 tickets have sold by the draw. Below that, the end prize is 35% of ticket sales instead. The draw runs either way, with no refunds.”), and on the right “End prize right now $205 · becomes $500 at 1,430 sold · 824 to go”. On v3 headline draws the rule reads “Drawn once 560 tickets sell; otherwise everyone is refunded in full.”
- **Instant prizes**: “23 of 69 won so far ($86)”, the one-line explanation (numbers published on-chain before sales; yours assigned at random by ORAO at reveal, so nobody can buy a known winner; a match is paid in the reveal transaction), a “Hide already won prizes” toggle, then one accordion row per tier (“$25 · 1 of 2 still to be won”, progress) opening to the grid of number chips: “#1,952 · Won by DC4s…3b2L” (accent) or “#1,131 · Not yet won”; the viewer’s own wins are outlined.

Ticket numbers on random-number draws print as `#1,284` / `#0,071` (`tno`); sequential draws keep `#0009`.

---

## 6. Draw states (hero panel)

| Phase | Prize block | Panel |
|---|---|---|
| open | OPEN pill, countdown | meter, tabs, picker / free entry |
| closed (sold out or deadline) | SOLD OUT / SALES CLOSED | meter at 100%, “Draws in 2d 14h”, your tickets |
| due | DRAW DUE | “Draw time has passed”, **Run the draw** (keeper first, anyone after the public window), the ORAO fee |
| drawing | DRAWING NOW | three steps (request · randomness landed · winning ticket computed), **Settle the draw**, the 48 h cancel valve |
| settled | WON $500 CASH, paid to… | winner card: ticket, wallet, prize, settled time, prize tx, recompute link |
| cancelled | CANCELLED, refunds | reason, your refund, **Claim your refund** |
| loading / error / no draw / stale | skeleton card / “Can’t reach devnet” / “No draw is open right now” / the stale note above the hero and “as of” on the meter |

---

## 7. Other pages

- **/draw/?n=N** (`DrawRecord.tsx`): status pill, “Draw № N”, the lead, the winner card when settled, the record (every account field), the meter and Enter link while open, **Recompute** (fairness.ts in the browser against the stored randomness and ORAO’s account), and the full entry ledger with search and CSV. No number: the index of every draw number the program has handed out. A missing number says so, never a 404.
- **/live/?n=N** (`LiveShow.tsx`): the faceless draw show for a 1920×1080 browser source: headline, stage voice, the countdown or the ticket number at 160px, the roll through every ticket that settles on the winner when ORAO’s randomness lands, PAID with the winner and payout link, run/settle controls.

---

## 8. Data and the v4 contract

The chain adapters are thin. `DrawView` carries three v4 fields with defaults from the v3 decoder (`guaranteed`, `schedule`, `randomNumbers`) and `EntryView` carries `numbers`; `lib/derive.ts` has `featuredDraw`, `endPrize`, `endPrizeLocked`, `ticketNumbersOf`, `scheduleWinsOf`, `wonNumbers`, `scheduleTotals`. When the v4 IDL lands, `decodeDraw`/`decodeEntry` in `lib/chain.ts` read those fields and nothing else changes. The reveal flow reuses the v3 session (`RevealSession.numbers`), and `drawRolls` is true for any draw with a schedule.

---

## 9. Fixtures and screenshots

`NEXT_PUBLIC_FIXTURES=1 npx next build`, then `?fx=<name>` (`&usd=0` hides the quote, `&my=loading|error` the wallet reads). Scenarios: open, open-guest, open-low, open-max, open-locked, confirm, reveal-wait, reveal, reveal-done, reveal-nowin, reveal-failed, free, free-claimed, success, v3, sold-out, due, due-public, drawing, drawing-wait, settled, settled-pot, cancelled, stale, nodraw, loading, error, draw-settled, draw-cancelled, draw-open, live-countdown, live-due, live-drawing, live-rolling, live-paid. The shoot and check scripts live in the session scratchpad (`fe/shoot-c.cjs`, `fe/final-c.cjs`).

Checks before shipping: `npx tsc --noEmit` (app and root), a production build with no fixture strings in `out/`, `node app/scripts/check-fairness.mjs`, `node app/scripts/check-copy.mjs` (typographic quotes; never “competition”, “skill-based”, “legal”, “compliant”, “DCMS” or “verify” in copy: it is a prize draw), no overflow at 320/390/1440, nothing animating under `prefers-reduced-motion`.
