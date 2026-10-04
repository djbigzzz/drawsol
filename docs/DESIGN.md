# DrawSol design system: clean commercial

This is the spec for the DrawSol frontend in the **clean commercial** direction, chosen after the Ticket Office (paper, stamps, serif) and the dark crypto templates were rejected. The reference is how Irish and UK prize-draw sites sell one draw: McKinney, Omaze UK, Dream Car Giveaways, Blaa (the ticket picker), Ooosch (the instant-prize schedule). SPEC.md §4.1 (honesty rules) and §4.4 (data layer) still apply unchanged; this document replaces the Ticket Office spec.

The site is **one draw**: the newest open headline draw on chain (falling back to the newest headline draw of any status; pot draws never feature). Everything on the page is read from Solana devnet. When a number can’t be read it isn’t shown, and USD figures come from a live SOL quote (CoinGecko) and are hidden, never estimated, when no quote is available.

Example values in this document come from the fixture `open` scenario (`app/src/fixtures/data.ts`): Draw № 6, “Win $500 cash + instant prizes”, 586 of 2,000 sold, $1.00 (0.00838 SOL) a ticket, draws Sun 11 Oct 20:00 UTC, 69 instant prizes. They are examples, never constants.

---

## 1. Brand idea

> **A prize draw you can check, sold the way the best prize-draw sites sell: a deep-navy hero, one price, one blue button.** Like Ooosch and the other Irish prize sites: a navy devnet strip, a navy-to-blue header, a full-width navy hero with the prize art and a white entry card, a light-grey strip of chain figures, then light body sections and a navy footer. Blue is the action, the money and the progress; purple (Solana purple) is the logo and the wins; gold only in the artwork. No decoration carries meaning that a number can carry instead.

What this means in practice:

- **The hero card is the product.** Prize headline on the left, the sold meter and the ticket picker on the right. Explanations live below the fold.
- **Every promise has a link.** Prize locked (vault), winner by ORAO VRF (recompute), guaranteed draw or full refund (draw account), every entry public (entries page).
- **Two accents, each with one job.** Blue (`#1D4ED8` → `#2563EB`) is the Enter button and every primary button, the sold meter and slider, prices and totals, the stats strip, the how-it-works numerals. Purple (`#7C3AED`) is the logo mark and wins: the winning ticket, “You won $10”, win chips and won pills, the viewer’s winning row. Nothing else is purple.
- **Navy frames, light reads.** Navy surfaces are the devnet strip, the header, the hero band and the footer. Everything with paragraphs (prizes, how it works, tickets, winners, rules) stays on white and `--surface`, so it is never a dark site.
- **Artwork carries the prize, never a number.** Generated graphics in `app/public/art`: the $500 cash stack in the hero (`prize-500-dark.webp`, the white-background `prize-500.png` cut out to alpha with its navy “$500” recoloured white so it reads on navy; one soft blue radial light sits behind it), the instant-prize card beside the Prizes intro, the confetti ring behind the reveal’s “You won” total and, faintly, the settled winner card. They are referenced through `art()` in `lib/config.ts`, which prefixes the site’s base path; a campaign without a `dark` cut-out shows its white original on a white rounded plate.
- **No template tells.** No gradient text, glassmorphism, emoji, decorative card grids, serif or italic labels, or filler copy. Gradients are only the header band, the primary buttons and the meter fill.

---

## 2. Tokens

### 2.1 Colour (`app/src/app/globals.css` `:root`, mirrored in `tailwind.config.ts`)

| Token | Hex | Role |
|---|---|---|
| `--white` | `#FFFFFF` | Page and card background, the entry card on the hero, countdown boxes |
| `--navy` | `#0B1B3F` | Text (16.9:1 on white), dark pills, the secondary (navy) button, countdown digits |
| `--navy-2` | `#3B4A66` | Body copy and labels (8.3:1 on `--surface`) |
| `--navy-3` | `#5B6884` | Captions, units, muted figures (5.6:1 on white, 5.2:1 on `--surface`) |
| `--deep` / `--deep-2` | `#0B1B3F` / `#102A5C` | Deep surfaces: devnet strip, hero band, footer; the header gradient’s start |
| `--surface` | `#F4F7FB` | Light surfaces: the stats strip, how-it-works steps, sums |
| `--surface-2` | `#E8EDF5` | Meter track, disabled buttons, tab rail |
| `--line` / `--line-2` | `#E2E8F0` / `#CBD5E1` | Card borders / control borders |
| `--blue` / `--blue-2` | `#1D4ED8` / `#2563EB` | Primary: `--grad-cta` (135°, `--blue-2` → `--blue`) on primary buttons (white text 6.7 / 5.2:1), `--grad-bar` on the meter, prices, totals, stats figures |
| `--blue-3` | `#1E40AF` | Primary hover (end of `--grad-cta-hover`), success text |
| `--blue-tint` / `--blue-line` | `#EFF6FF` / `#BFDBFE` | Stat icon tiles, the Open pill, success panels, the countdown boxes’ under-edge |
| `--grad-mast` | `#0B1B3F` → `#102A5C` → `#1D4ED8` | The header band, left to right |
| `--on-dark-2` / `--on-dark-3` | `#C9D4EA` / `#9DB0D3` | Body / captions on navy (11.3 / 7.7:1 on `--deep`) |
| `--sky` | `#93C5FD` | Accent on navy: “CASH”, the live end prize figure, the wallet dot (9.4:1) |
| `--violet-on-dark` | `#C4B5FD` | Purple on navy: “+ 69 instant prizes”, the winning ticket in the hero facts (9.2:1) |
| `--accent` / `--accent-2` | `#7C3AED` / `#6D28D9` | Purple, for wins only: winning ticket, “You won”, win chips, `.pill-win`, `.c-win` |
| `--accent-bar` | `#7C3AED` | The instant-prize tier bars |
| `--highlight` | `#9945FF` | Solana purple: the logo mark’s gradient (with `--accent`) and decoration only, never text |
| `--accent-tint` / `--accent-line` | `#F5F3FF` / `#DDD6FE` | Win chips and won rows |
| `--warn` / `--warn-tint` | `#B45309` / `#FFFBEB` | Draw due / drawing pills, the stale note, devnet-SOL notes |
| `--danger` / `--danger-tint` | `#B91C1C` / `#FEF2F2` | Errors only |

The palette is closed. History: green (`#15803D`) was the first accent, then Solana purple for everything; the all-white, all-purple page read as too bright, so the frame went navy and the action blue, as the Irish prize sites do, and purple kept the logo and the wins. Orange was considered and rejected: it fails AA with white text at button size.

### 2.1a Logo

A ticket stub tilted 12° to the left, filled with the `#9945FF` → `#7C3AED` gradient (top-left to bottom-right), rounded corners, the two notches at mid-height and a white five-point star; beside it the wordmark “DrawSol” in Plus Jakarta Sans 800, tight tracking (`components/Logo.tsx`, 30px in the header, 24px in the footer). `variant="inverse"` sets the wordmark in white for the navy header and footer (both use it); the default `--navy` wordmark is for light grounds. The mark is the same on both. Files: `app/public/brand/drawsol-mark.svg` (icon), `drawsol-logo.svg` (mark + wordmark), `app-icon-512.png`, `drawsol-logo-2000.png`, `og-1200x630.png` (the social preview, linked from `layout.tsx`); the favicon is `app/src/app/icon.svg`, the mark on a white rounded square.

### 2.2 Type

One family, self-hosted: **Plus Jakarta Sans Variable** (`@fontsource-variable/plus-jakarta-sans`). 800 for headlines, 700 for UI and figures, 500/600 for body. Tabular numerals (`.tab`) on every figure that updates.

| Class | Size (mobile → desktop) | Use |
|---|---|---|
| `.t-win` | 48 → 72 → 88px, 800, uppercase, −0.035em | “WIN $500 CASH” |
| `.t-h1` / `.t-h2` / `.t-h3` / `.t-h4` | 32→40 / 26→30 / 20→22 / 17px | Page, section, card, sub-card headings |
| `.sec-head .t-h2` | 28 → 36px, 800, uppercase, `--navy` | Section headings: “PRIZES”, “HOW IT WORKS”, “WINNERS” |
| `.cdb-n` | 30 → 36px, 800, in a 60 → 72px white box | Countdown digits |
| `.stat-v` | 22 → 30px, 800, `--blue` | Stats strip figures |
| `.total b` | 40px, 800 | The live total |
| `.winner-ticket`, `.live-num` | 56px / 72→160px | Winning ticket |
| body | 16px/1.5, 500 | Everything else |

### 2.3 Space, radii, elevation

8px rhythm (`gap`/`padding` are multiples of 8; 4 only inside controls). Page max-width 1200px, gutters 16/24/32px. Radii: 8 (inputs), 12 (panels), 16 (cards), 20 (the hero, sheets), pills 999. Shadows only on the entry card and state cards on the navy band (`--shadow-hero`), popovers and sheets. Breakpoints: 761 (tablet), 1024 (desktop: hero goes two-column, sticky bar disappears), 1280 (headline grows).

---

## 3. Structure of the page

1. **Devnet bar** (`.devbar`, `--deep`): “Devnet demo · play money (devnet tokens are not real)”, sticky, on every page. The fixture badge sits inside its right end.
2. **Header** (`.mast-band`, `--grad-mast`): the logo (inverse), Winners, How it works in white, the wallet button outlined in white (short address and balance). `/draw` and `/live` use the same band.
3. **Hero band** (`.hero-band`, full-width `--deep`; `Hero.tsx`), two columns from 1024px. The loading skeleton and the error / no-draw cards sit on the same band, so nothing flashes from white to navy.
   - **Prize block** (on navy, white type): pills “DRAW № 7 · OPEN” (blue); “WIN $500 CASH” (“CASH” in `--sky`) from `lib/campaigns.ts`, “+ 69 instant prizes” in `--violet-on-dark`; the escrow line always from chain (“4.19 SOL escrowed ↗”, and for a guaranteed draw “End prize right now $205 · becomes $500 at 1,430 sold”); the campaign’s cut-out artwork (`Campaign.art.dark`), centred, 440px wide at most on desktop; the **countdown boxes** (`CountdownBoxes`: “TIME LEFT” or “DRAWS IN”, four white boxes Days / Hours / Minutes / Seconds with navy digits, from the on-chain `draw_at`; one `role="timer"` whose accessible name updates once a minute) beside the facts from 1024px (ticket price, draw time; the winning ticket or refunds after); the instant-prize summary in a translucent panel; the vault balance. The artwork is skipped when the headline isn’t the nominal figure (a guaranteed draw settled under its minimum) and on a cancelled draw.
   - **Entry panel** (white card, 20px radius): the sold meter first (“29%” · “586 / 2,000 tickets sold”, blue gradient bar, a tick at the minimum, the note), the Paid / Free entry tabs of equal weight, then the **picker** (§4).
4. **Stats strip** (`StatsStrip.tsx`, full-width `--surface`): four chain figures, each a pale-blue icon tile, a big blue figure and a label: tickets sold (“586 tickets sold of 2,000”), the escrow (“4.19 SOL escrowed for the end prize”; after the draw the prize paid, or refunds so far), instant prizes still to win (“46 of 69 instant prizes left”, “not won” once the draw is over; tickets still on sale for a draw without a schedule), the draw date and time. Only numbers the Draw and Schedule accounts hold: no ratings, no winner tallies, no invented figures. Two columns on phones, four from 1024px.
5. **Trust strip**: four promises with links, on white with solid blue check circles (no boxes, so it doesn’t echo the stats strip).
6. **Prizes** (`Prizes.tsx`): the end prize row with its rule stated in full, then the instant-prize accordion (§5).
7. **How it works**: three numbered steps (Get your tickets / Reveal if you’ve won / End prize drawn Sunday), blue numerals.
8. **Your tickets**: one row per purchase with the ticket numbers as chips (wins and the drawn ticket highlighted), Reveal for sealed purchases, Refund when cancelled.
9. **Winners**: instant wins (from Entry accounts) and every settled draw (from Draw accounts) with ticket, wallet, payout link and record link; cancelled draws as one line; an honest empty state.
10. **Rules and questions**: a short FAQ, the terms hash. **Play safe**: a collapsed section with the spend limit and break (program-enforced), BeGambleAware.
11. **Footer** (`.foot-band`, `--deep`): the inverse logo, program ID, source, rules, play safe, every draw, live, the note.

Mobile: the hero stacks on the navy band (prize block with the art and the countdown boxes, then the white panel); a **sticky bottom bar** (white, blue button) shows “5 tickets · $5.00 · ENTER NOW” while the panel’s own button is off screen.

---

## 4. The picker (Blaa pattern)

`EntryPanel.tsx`, in this order: “How many tickets?” → range slider 1…max (28px blue thumb, min/max labels) → price row (“$1.00 per ticket · 0.00838 SOL” in blue, −/+ stepper with the number in a grey box) → preset chips (the five largest below max, then “Max · 1,000”) → “Total (5 tickets)” and the total in 40px blue with the SOL figure beside it → fee line (expandable breakdown, from chain) → one full-width blue gradient pill **ENTER NOW · $5.00** → the draw rule in one line → “Free entry, no purchase needed” link (switches to the Free entry tab) → “Up to 1,000 per purchase · 2,000 entries max per person”.

Slider, stepper and chips share one state (`BuyContext`); the total updates live, nothing reflows. `max` is the least of per-purchase cap, per-wallet room, tickets left and the spend limit. With a low balance the button becomes **Get devnet SOL** (the faucet, from the browser) with the shortfall stated.

**Flow**: Enter now → confirm sheet (summary in USD and SOL, fee line, 18+ asked once per device, Pay) → wallet → on draws with instant prizes the **reveal sheet** (“Revealing your tickets…” while ORAO assigns the numbers, then each ticket flips to its number and “No win” / “Won $10”, the total paid, tx links, Done); on draws without, the **success sheet** (“You’re in · Tickets #0139–#0143”, tx link). Both are centred dialogs on desktop and bottom sheets on phones, with a focus trap and Esc.

---

## 5. Prizes and the instant-prize schedule (Ooosch pattern)

- **End prize row**: “$500 cash”, the rule in full (“$500 is escrowed and is paid in full once 1,430 tickets have sold by the draw. Below that, the end prize is 35% of ticket sales instead. The draw runs either way, with no refunds.”), and on the right “End prize right now $205 · becomes $500 at 1,430 sold · 824 to go”. On v3 headline draws the rule reads “Drawn once 560 tickets sell; otherwise everyone is refunded in full.”
- **Instant prizes**: “23 of 69 won so far ($86)”, the one-line explanation (numbers published on-chain before sales; yours assigned at random by ORAO at reveal, so nobody can buy a known winner; a match is paid in the reveal transaction), a “Hide already won prizes” toggle, then one accordion row per tier (“$25 · 1 of 2 still to be won”, progress) opening to the grid of number chips: “#1,952 · Won by DC4s…3b2L” (purple) or “#1,131 · Not yet won”; the viewer’s own wins are outlined.

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

`NEXT_PUBLIC_FIXTURES=1 npx next build`, then `?fx=<name>` (`&usd=0` hides the quote, `&my=loading|error` the wallet reads). Scenarios: open, open-guest, open-low, open-max, open-locked, confirm, reveal-wait, reveal, reveal-done, reveal-nowin, reveal-failed, free, free-claimed, success, v3, sold-out, due, due-public, drawing, drawing-wait, settled, settled-pot, cancelled, stale, nodraw, loading, error, draw-settled, draw-cancelled, draw-open, live-countdown, live-due, live-drawing, live-rolling, live-paid. The shoot and check scripts live in the session scratchpad (`fe/shoot-art.cjs <outdir>`: open / reveal-done / settled at 1440×900 and 390×844, viewport and full page, with the first-viewport boxes and the overflow logged).

Checks before shipping: `npx tsc --noEmit` (app and root), a production build with no fixture strings in `out/`, `node app/scripts/check-fairness.mjs`, `node app/scripts/check-copy.mjs` (typographic quotes; never “competition”, “skill-based”, “legal”, “compliant”, “DCMS” or “verify” in copy: it is a prize draw), no overflow at 320/390/1440, at 1440×900 the headline, sold meter and Enter button in the first viewport, WCAG AA on every text pair (the on-navy tokens above), nothing animating under `prefers-reduced-motion`.
