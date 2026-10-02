# DrawSol design system and screen spec: Ticket Office

This is the definitive spec for rebuilding the DrawSol frontend in the **Ticket Office** direction, the winner of the design shoot-out. It replaces SPEC.md §4.2 ("Night Draw") and the visual parts of §4.3. SPEC.md §4.1 (honesty rules) and §4.4 (data layer) still apply unchanged.

The judges' must-fixes are already applied here, along with the grafts taken from the other prototypes. §10 maps every judge item to the section that resolves it. **If this document and the prototype disagree, this document wins.**

| Source | Where |
|---|---|
| Winning prototype (reference only, pre-fix) | `docs/design/ticket-office-prototype/` (`index.html`, `reveal.html`, `styles.css`, `app.js`, `reveal.js`, `shots/*.jpg`) |
| Assets to reuse | `app/src/design-assets/` (indexed in §9) |
| Asset generators (sun, barcode, receipt, stamp print) | `app/src/design-assets/generate.mjs` (`node app/src/design-assets/generate.mjs`) |

Example values in this document all come from the fixture `open` scenario (`app/src/fixtures/data.ts`). They are:
- Draw Nº 3 with a 1 SOL prize. The vault holds 3.61 SOL.
- 100 of 150 sold, plus 2 free entries (#0041, #0059).
- Wallet 5zXY…4wAD holds 16 tickets (#0031–#0040, #0059, #0097–#0101). It spent 0.15 SOL and won 0.08 SOL.
- Draw Nº 2: winning ticket #0006, winner 9goW…639n.
- Other states: in `settled`, Draw 3's winning ticket is #0067, paid to 5ggm…7nnQ; in `cancelled`, 0.37 of 1.00 SOL has been refunded.

They are examples, never constants. Every number on screen comes from the data layer.

---

## 1. Brand idea

> **DrawSol is a ticket office, not a crypto terminal: you buy from the stub of a perforated paper ticket, the fixed ticket count is a barcode you can count, and every change of state is a cashier's rubber stamp.** Two spot inks keep it honest: vermilion appears only where money moved or a state changed, and carbon blue only where you can check something or chose something.

What this means in practice:

- **The hero object is the interface.** The draw ticket holds the prize, the lock, the clock and the sales meter. Its tear-off stub is where you buy. There is no separate "panel".
- **Proof is paperwork.** The ticket carries one proof link. Everything else lives on "the back of the ticket" (one ledger) and on the carbon-copy recompute slip.
- **Type does the work boxes used to do.** One grotesk set from 62% to 125% width, the way a printer sets wood type, against a newspaper serif for the human voice. There are no chips, no pills and no micro-labels.
- **Light, warm, printed.** Paper, ink and two inks of riso spot colour. It looks nothing like a dark dashboard.

Every promise has a matching physical mark:

| Promise | Physical mark |
|---|---|
| The prize is locked before the first sale | LOCKED rubber stamp on the prize, plus one "Check the vault on Solscan" link |
| Fixed ticket count, fixed close | The barcode sales meter: one bar per ticket, which you can count. The close time is printed in full |
| Instant result by ORAO randomness | Results under halftone covers that are torn off. Each stub shows its roll |
| Anyone can run and settle | The stub turns into a "Run the draw" or "Settle the draw" window for anyone |
| Settled and paid | DRAWN date stamp, PAID round stamp and three punched cancellation holes |
| Every result can be recomputed | Carbon-copy ledger slip that redoes the arithmetic in the browser |
| Devnet, play money | Blue clerk's strip on every screen, plus "DEVNET SPECIMEN" printed on the ticket itself |

---

## 2. Tokens

### 2.1 Colour

The palette is closed: nothing outside this table may be used. Each ink has exactly one job.

| Token | Hex | Role | Never |
|---|---|---|---|
| `--paper` | `#EFE8D9` | The counter: page background, under `grain-paper` | Text |
| `--paper-2` | `#E6DDCA` | Shaded counter, disabled button fill, pressed punch. Also the worst-case grain pixel on paper | Large areas |
| `--stock` | `#FBF8F0` | Card stock for tickets, stubs, slips, sheets and the mobile bar, under `grain-stock`. Also text on ink, blue and red fills | Page background |
| `--stock-2` | `#F3EEE2` | Worst-case grain pixel on stock; hover rows on stock | Text |
| `--ink` | `#1B1814` | Warm black: all primary text, figures, rules, the primary button | — |
| `--ink-2` | `#4F473C` | Secondary text, italic field labels, units | Figures |
| `--ink-3` | `#625949` | Tertiary text: "no win", barcode key, fine print, unsold figures | Anything the user must act on |
| `--rule` | `rgba(27,24,20,.16)` | Row hairlines in ledgers and lists | Text |
| `--rule-2` | `rgba(27,24,20,.32)` | Dashed separators, unsold barcode hairlines, the divider in the wordmark | Text |
| `--red` | `#DE3F2B` | **Spot 1, the cashier's stamp.** Stamps, the raised drawn bar, receipt bars, the halftone sun, the money plate | Text below 24px; anything decorative that does not mark state or money |
| `--red-ink` | `#A92A1A` | Red **text**: winning serials, amounts won, "Won so far", errors' lead-in | Losing serials, headings, links |
| `--red-fill` | `#C4321F` | Solid fill under `--stock` text: winning slips in the mobile reveal | — |
| `--blue` | `#2448B0` | **Spot 2, the clerk's pen.** Devnet strip background, pen circle, your bars in the barcode, checked radio dot, focus ring, recompute button and slip rules, specimen overprint | Body text, decoration |
| `--blue-ink` | `#1F3F9E` | Blue **text**: proof links, text buttons, "yours", "Correct.", "you" tags | Headings |

**Colour law.** Any use that breaks one of these rules is a bug.

1. **Red** means *money moved* or *a state changed*. Allowed uses:
   - stamps (LOCKED, SALES CLOSED, DRAWN, PAID, WON, CANCELLED, REFUNDED);
   - amounts won and paid, the drawn ticket, winning serials;
   - receipt bars, the sun and the money plate;
   - error lead-ins.

   Losing serials, the draw serial "Nº 0003", headings and buttons are never red.
2. **Blue** means *you can check this* (proof links, the recompute slip), *you chose this* (pen circle, checked radio, your tickets in the barcode, "you" in the entries ledger), or *the honesty marker* (devnet strip, specimen overprint). Nothing else is blue.
3. Everything else is ink on paper. There are no greys outside `--ink-2` and `--ink-3`, no gradients (except the perforation holes and halftone dots, which are drawn with gradients), no tints and no transparency effects.

**Contrast**, computed in WCAG 2.x. "Worst" is the darkest grain pixel: `--paper-2` on the counter and `--stock-2` on card stock. Every text pair must pass AA against its worst-case background.

| Foreground | on `--paper` | on `--paper-2` (worst) | on `--stock` | on `--stock-2` (worst) | Allowed use |
|---|---|---|---|---|---|
| `--ink` #1B1814 | 14.50 | 13.10 | 16.66 | 15.28 | any text |
| `--ink-2` #4F473C | 7.49 | 6.77 | 8.61 | 7.89 | any text |
| `--ink-3` #625949 | 5.65 | 5.11 | 6.50 | 5.96 | any text ≥ 13px |
| `--red-ink` #A92A1A | 5.68 | 5.13 | 6.52 | 5.98 | any red text |
| `--red` #DE3F2B | 3.55 | 3.21 | 4.08 | 3.74 | graphics and stamps only (≥ 3:1). Never text |
| `--blue` #2448B0 | 6.55 | 5.92 | 7.53 | 6.90 | graphics, focus ring |
| `--blue-ink` #1F3F9E | 7.61 | 6.88 | 8.74 | 8.02 | link text |

| Text on fill | Ratio |
|---|---|
| `--stock` on `--ink` (primary button) | 16.66 |
| `--stock` on `--blue` (devnet strip, recompute button) | 7.53 |
| `--stock` on `--red-fill` (mobile winning slip) | 5.18 |
| `--ink-2` on `--paper-2` (disabled button) | 6.77 |

> The prototype's `--ink-3 #6B6253` (4.45 on worst-case grain) and `--red-ink #B82E1D` (4.51) failed or were borderline against grain. They are darkened above. Do not revert them.

### 2.2 Type families

Fonts are self-hosted through Fontsource only. There are no Google Fonts or Fontshare requests.

| Family (CSS name) | Package | Import in `app/src/app/layout.tsx` | Axes used |
|---|---|---|---|
| `"Archivo Variable"` | `@fontsource-variable/archivo` | `import "@fontsource-variable/archivo/standard.css"` | `wdth` 62–125, `wght` 100–900 |
| `"Newsreader Variable"` | `@fontsource-variable/newsreader` | `import "@fontsource-variable/newsreader/opsz.css"` and `import "@fontsource-variable/newsreader/opsz-italic.css"` | `opsz` 6–72 (auto), `wght` 200–800, roman and italic |

Remove `@fontsource/big-shoulders-display`, `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono` from `package.json` and `layout.tsx`. **There is no monospace face.** Hashes, addresses and code use Archivo at 85% width with tabular figures.

Fallback stacks:
- `--grot: "Archivo Variable", "Archivo", "Arial Narrow", Arial, sans-serif`
- `--serif: "Newsreader Variable", "Newsreader", Georgia, serif`

**Archivo widths are a wood-type case.** Only these widths exist; use utility classes `.wd-62`, `.wd-70`, `.wd-75`, `.wd-85`, `.wd-88`, `.wd-112` and `.wd-125`, which set `font-stretch`.
- **62%:** big figures.
- **70–75%:** facts and serials.
- **85–88%:** all UI text (nav, buttons, ledgers, inputs, links). This must-fix pins plain UI text into the wood-type system instead of a neutral 100% grotesk. **Archivo is never set at 100% width.**
- **112%:** wordmark and section titles (sentence case).
- **125%:** ticket headers (UPPERCASE) and stamp legends. These appear only on printed objects.

**Figures:**
- Everything that changes uses `font-variant-numeric: tabular-nums lining-nums`: countdown, quantity, totals, ledgers, serials, addresses and hashes.
- The static hero prize and the reveal total use `proportional-nums lining-nums`, so "1 SOL" has no tabular gap.

**Verification before any screenshot:**

```js
await document.fonts.ready;
document.fonts.check('900 40px "Archivo Variable"') &&
  document.fonts.check('400 20px "Newsreader Variable"') &&
  document.fonts.check('italic 400 20px "Newsreader Variable"');
```

### 2.3 Type scale

Sizes are px and line-height is unitless. Mobile applies at ≤ 760px. Class names are the CSS utilities to create in `globals.css`.

| Class | Face, width, weight | Desktop size / LH | Mobile size / LH | Tracking | Used for |
|---|---|---|---|---|---|
| `.t-prize` | Archivo 62% 900 | 212 / .80 | 140 / .80 (120 below 360px) | −.01em | Hero "1 SOL". The unit "SOL" is `.5em` with a `.04em` left margin |
| `.t-total` | Archivo 62% 900 | 196 / .80 | 96 / .80 | −.01em | Reveal "0.08 SOL" (unit .5em) |
| `.t-now` | Archivo 62% 900 | 120 / .86 | 64 / .86 | 0 | Reveal "now showing" ticket and result |
| `.t-qty` | Archivo 62% 900 | 96 / .86 | 36 / 1 (bar) | 0 | Quantity |
| `.t-fact` | Archivo 70% 800 | 60 / .95 | 52 / .95 (sold: 44) | −.005em | Countdown, sold, winning ticket |
| `.t-stubamt` | Archivo 62% 900 | 46 / .86 | 28 / 1 | 0 | Amount on a reveal stub (fits "0.20" in 100px) |
| `.t-rowtotal` | Archivo 85% 800 | 34 / 1 | 30 / 1 | 0 | Stub total "0.10 SOL", confirm total |
| `.t-ledger` | Archivo 85% 800 | 24 / 1.1 | 22 / 1.1 | 0 | Values in section ledgers |
| `.t-serial` | Archivo 75% 600 | 24 / 1 (head), 22 (stubs) | 20 / 1, 18 (rows) | .02em | "Nº 0003", "#0034" |
| `.t-sec` | Archivo 112% 850 | 34 / 1.0 | 28 / 1.05 | −.01em | Section titles, reveal h1 (sentence case) |
| `.t-lede-h` | Archivo 112% 800 | 20 / 1.2 | 20 / 1.2 | −.005em | "Draw Nº 3 is open." |
| `.t-ticket-head` | Archivo 125% 800 UPPERCASE | 14 / 1.2 | 12 / 1.2 (.05em) | .06em | Ticket header only: "DRAWSOL · GRAND DRAW" (also 12 on the past ticket) |
| `.t-stub-head` | Archivo 112% 800 | 18 / 1.2 | 17 / 1.2 | 0 | "Buy tickets", "Check and pay", "Run the draw" (sentence case) |
| `.t-btn` | Archivo 88% 800 | 18 / 1 | 17 / 1 | .005em | Primary and secondary buttons |
| `.t-ui` | Archivo 88% 500/600/700 | 15–17 / 1.3 | 15–16 / 1.3 | 0 | Nav, ledgers, inputs, picks (17/600, chosen 800), radio labels |
| `.t-link` | Archivo 88% 600 | .82em of context, min 14 | same | 0 | Proof links, text buttons |
| `.t-lede` | Newsreader 400 | 22 / 1.32 | 20 / 1.35 | −.005em | Lede sentence |
| `.t-body` | Newsreader 400 | 18 / 1.45 | 17 / 1.45 | 0 | Body copy, proofline (17/1.5) |
| `.t-label` | Newsreader italic 400 | 17–21 / 1.3 | 17–18 | 0 | Field labels ("Grand prize"), units ("d", "h", "min", "tickets", "of 150 sold") |
| `.t-voice` | Newsreader italic 400 | 26 / 1.25 | 20 / 1.3 | 0 | "You won", reveal status, announcer line |
| `.t-small` | Newsreader 400 | 15 / 1.4 | 15 / 1.4 | 0 | Notes under facts, captions |
| `.t-fine` | Archivo 88% 500 / Newsreader 400 | 14 / 1.4 | 14 / 1.4 | 0 | Fee line (Archivo), fine print (Newsreader) |
| `.t-key` | Archivo 88% 600 | 13 / 1.3 | 13 / 1.3 | 0 | Barcode key, receipt labels, roll line. **Smallest text allowed** |
| `.t-specimen` | Archivo 125% 700 UPPERCASE | 11 / 1 | 11 / 1 | .18em | Specimen overprint only (`aria-hidden`, decorative duplicate of the strip) |
| `.t-micro` | Archivo 75% 500 | 4 (SVG) | 4 | .02em | Program-ID microtext rule only (`aria-hidden`) |

Contrast between levels is deliberate. Each step down changes at least two of size, width, face and style, so no two adjacent levels can be confused. Most text is `.t-body` or `.t-ui` at regular weight, and emphasis is earned. **Uppercase appears only on printed objects:** ticket head, stamps, the cover's "RESULT" label and the specimen overprint.

### 2.4 Spacing

The base unit is 8px. Allowed steps: `8, 16, 24, 32, 40, 48, 64, 72, 80, 96, 128` (`--s1` … `--s16`).

The only exceptions are physical printing details:
- the 3px gap of a double rule;
- 2–6px offsets inside stamps, the barcode and the perforation;
- the 4px gap between a punch button and the quantity in the mobile bar.

| Use | Desktop | Mobile |
|---|---|---|
| Page gutter | 64 (xl), 40 (lg), 32 (md) | 16 |
| Lede/label column gap | 40 | — |
| Ticket body padding | 24 / 40 / 24 / 40 | 16 / 16 / 24 / 16 |
| Stub padding | 24 / 32 / 24 / 40 (40 on the perforation side) | 24 / 16 / 24 / 16 |
| Between blocks inside a ticket | 16–24 | 16 |
| Between sections | 96 | 64 |
| Section title → content | 24 | 16 |

### 2.5 Radii

| Object | Radius |
|---|---|
| Draw ticket, back of the ticket | 6px |
| Past (old) ticket | 5px |
| Stubs in strips (outer corners only) | 4px |
| Buttons, recompute slip | 3px |
| Mobile sheet (top corners) | 10px |
| Punch holes, perforation notches, stamps (round), pen circle, radio | circle |
| Everything else | 0 |

**There are no pills.** A rounded-rectangle label or badge is banned.

### 2.6 Rules, borders, perforation

- **Double rule** (the ticket's structural line): two 1px `--ink` lines, 3px apart. It is used under the ticket head, above the facts, above the reveal total and under the stub head. On the draw ticket's head, the lower line is the program-ID microtext rule (§4.7).
- **Hairline:** 1px `--rule` between ledger rows.
- **Dashed:** 1px dashed `--rule-2`, inside the stub only (above the total, above the confirm summary).
- **Strong rule:** 2px `--ink`. Used above the lede's odds table, above the reveal receipt steps and under the connected wallet.
- **No boxes.** Bordered panels and cards are banned. The only bounded objects are paper: the draw ticket, the old ticket, stubs, the back of the ticket, the carbon slip, the mobile bar and the sheet. Paper is defined by its stock colour and paper shadow, never by a border.
- **Perforation** (CSS, no images). It separates ticket body from stub, stub from stub, and the top edge of slips.

```css
/* vertical perforation on the stub's left edge (desktop) */
.perf-v { background-image: radial-gradient(circle at 2px 50%, var(--paper) 2px, transparent 2.6px);
          background-size: 6px 11px; background-repeat: repeat-y; background-position: -1px 6px; }
/* horizontal perforation (mobile stub top edge, slip tops) */
.perf-h { background-image: radial-gradient(circle at 50% 2px, var(--paper) 2px, transparent 2.6px);
          background-size: 11px 6px; background-repeat: repeat-x; background-position: 4px -1px; }
/* notches: two 26px semicircles in the counter colour at the ends of the perforation */
.notch::before, .notch::after { content:""; position:absolute; width:26px; height:26px; border-radius:50%; background:var(--paper); }
/* between joined stubs in a strip: 1.6px holes on an 8px pitch */
.stub + .stub::before { background-image: radial-gradient(circle at 2px 50%, var(--paper) 1.6px, transparent 2.2px); background-size: 4px 8px; }
```

### 2.7 Shadows and texture

Shadows are paper shadows only, in warm brown at low alpha. Glows, coloured shadows and inner glows are banned.

| Token | Value | Used on |
|---|---|---|
| `--shadow-ticket` | `0 1px 0 rgba(27,24,20,.06), 0 2px 3px rgba(60,45,20,.08), 0 22px 40px -24px rgba(60,45,20,.45)` | Draw ticket, old ticket, back of the ticket |
| `--shadow-slip` | `0 1px 1px rgba(60,45,20,.14), 0 12px 16px -12px rgba(60,45,20,.35)` | Stubs, carbon slip, receipt slip |
| `--shadow-lift` | `0 2px 2px rgba(60,45,20,.18), 0 22px 26px -14px rgba(60,45,20,.5)` | A winning stub after it drops |
| `--shadow-btn` | `0 2px 0 rgba(0,0,0,.25)` | Primary button (none when pressed or disabled) |
| `--shadow-bar` | `0 -1px 0 var(--ink), 0 -4px 0 var(--stock), 0 -5px 0 var(--ink), 0 -16px 24px -12px rgba(60,45,20,.3)` | Mobile bar: double-ruled top edge |

**Texture:**
- `grain-paper.svg` tiles over the page (220px tile).
- `grain-stock.svg` tiles over all card stock (180px tile).
- Both are static.

Strength is capped so the darkest pixel is no darker than `--paper-2` or `--stock-2`. Every text colour is checked against those values (§2.1). **Grain is never stronger behind small text.** There is no separate grain overlay layer, and no grain on the devnet strip, buttons or the sheet scrim.

**Halftone** is used only on the reveal covers (4px integer lattice, `radial-gradient(circle, var(--ink) 1.55px, transparent 1.85px)` at `background-size: 4px 4px`) and on the sun (§4.9). Covers are never scaled or rotated while at rest; they rotate only during the lift animation.

### 2.8 Motion

Motion happens only on **real events**: a user choice, a chain state change, or a transaction step. Nothing animates on load, nothing loops while idle, and there is no shimmer on skeletons.

| Real event | Element | Motion | Duration / easing | `prefers-reduced-motion: reduce` |
|---|---|---|---|---|
| Countdown minute changes (and seconds, under 1 h) | changed digits only | Numbering-machine advance: the old digit moves up and out (`translateY(0 → -.35em)`, opacity 1 → 0) while the new one rises in from `+.35em` | 220ms (seconds: 160ms), `cubic-bezier(.3,.7,.2,1)` | text swap |
| Quick pick chosen | pen circle | Ink draws on (`stroke-dashoffset` from path length to 0) | 180ms ease-out | appears |
| Buy pressed (≥ 761px) | stub contents | pick view → confirm view crossfade | 160ms ease-out | instant |
| Buy pressed (≤ 760px) | sheet | slides up from `translateY(105%)`; scrim fades to `rgba(27,24,20,.35)` | 240ms `cubic-bezier(.2,.8,.2,1)`; scrim 200ms | instant |
| Purchase lands | reveal overlay | fades in | 200ms ease-out | instant |
| Real request in flight | busy dot (8px ink) | blink | `1s steps(2) infinite`, only while in flight | static dot |
| A ticket is revealed | cover | Lifts off: `translate(18px,-64px) rotate(-14deg)`, opacity → 0 | 340ms `cubic-bezier(.5,0,.7,.4)` | no cover |
| — losing ticket | stub | Stays in place, quiet. Next ticket after a 330ms beat | — | final state |
| — winning ticket | stub | Drops out of the strip: `translateY(36px) rotate(2.2deg)` (even index: `40px, -2deg`), shadow → `--shadow-lift`. Next ticket after a 760ms beat | 420ms `cubic-bezier(.2,1.5,.35,1)` | no transform; stamp shown |
| — winning ticket | WON stamp | Slam: scale 1.7 → .96 → 1, opacity 0 → .95 | 320ms, 120ms delay, `cubic-bezier(.2,1.5,.35,1)` | shown |
| — winning ticket (mobile) | slip | Fills `--red-fill` and rotates ±1.4° with scale 1.03 | 200ms | filled, no rotation |
| — any ticket | now-showing slot | Ticket number and result swap | 120ms fade | swap |
| Reveal finished | total, sun, PAID stamp | Total fades in 300ms; sun fades in 600ms after 200ms; PAID slams 360ms after 350ms (same curve) | as listed | all shown |
| Chain state changes while the page is open (closes, settles, cancels, refund lands) | the new stamp | Slams once | 320ms | shown |
| Recompute pressed | ledger values | Appear in order as they are computed | 120ms stagger | instant |

Timing of a 10-ticket reveal after the randomness lands: 450ms, then 330ms per loser and 760ms per winner, then 250ms before the total. With 4 winners that is about 5.7s. The randomness wait itself is real (about 1.8s) and is never a timer. A "Skip to total" link is always available.

Reduced motion shows the final state as soon as the tiers are read from chain. The receipt steps still progress, because they are information, not motion.

### 2.9 Implementation: CSS variables and Tailwind

Put this on `:root` in `app/src/app/globals.css`. It replaces the Night Draw block. The app is light-only by design (paper is the brand), so set `color-scheme: light`. There is no dark mode.

```css
:root {
  --paper:#EFE8D9; --paper-2:#E6DDCA; --stock:#FBF8F0; --stock-2:#F3EEE2;
  --ink:#1B1814; --ink-2:#4F473C; --ink-3:#625949;
  --rule:rgba(27,24,20,.16); --rule-2:rgba(27,24,20,.32);
  --red:#DE3F2B; --red-ink:#A92A1A; --red-fill:#C4321F;
  --blue:#2448B0; --blue-ink:#1F3F9E;
  --grot:"Archivo Variable","Archivo","Arial Narrow",Arial,sans-serif;
  --serif:"Newsreader Variable","Newsreader",Georgia,serif;
  --s1:8px; --s2:16px; --s3:24px; --s4:32px; --s5:40px; --s6:48px; --s8:64px; --s9:72px; --s10:80px; --s12:96px; --s16:128px;
  --ease-stamp:cubic-bezier(.2,1.5,.35,1); --ease-lift:cubic-bezier(.5,0,.7,.4); --ease-sheet:cubic-bezier(.2,.8,.2,1); --ease-wheel:cubic-bezier(.3,.7,.2,1);
  --strip-h:28px; --gutter:64px;
  color-scheme: light;
}
@media (max-width:1335px){ :root{ --gutter:40px; } }
@media (max-width:1023px){ :root{ --gutter:32px; } }
@media (max-width:760px) { :root{ --gutter:16px; --strip-h:24px; } }
body { background:var(--paper) url(../design-assets/grain-paper.svg); color:var(--ink);
       font:400 18px/1.45 var(--serif); font-optical-sizing:auto; -webkit-font-smoothing:antialiased; }
:focus-visible { outline:2px solid var(--blue); outline-offset:3px; }
```

`tailwind.config.ts` replaces the Night Draw palette. Keep Tailwind for layout utilities only; component styling lives in `globals.css` classes named after the objects (`.ticket`, `.stub`, `.stamp`, `.barcode`, `.slip`, …).

```ts
theme: {
  colors: { transparent:"transparent", current:"currentColor",
    paper:"#EFE8D9", "paper-2":"#E6DDCA", stock:"#FBF8F0", "stock-2":"#F3EEE2",
    ink:"#1B1814", "ink-2":"#4F473C", "ink-3":"#625949",
    rule:"rgba(27,24,20,.16)", "rule-2":"rgba(27,24,20,.32)",
    red:"#DE3F2B", "red-ink":"#A92A1A", "red-fill":"#C4321F", blue:"#2448B0", "blue-ink":"#1F3F9E" },
  fontFamily: { grot:['"Archivo Variable"','Archivo','"Arial Narrow"','sans-serif'], serif:['"Newsreader Variable"','Georgia','serif'] },
  screens: { md:"761px", lg:"1024px", xl:"1336px" },
  extend: { maxWidth: { page:"1440px" } },
}
```

---

## 3. Layout

### 3.1 Breakpoints

The base styles are mobile; breakpoints are min-width.

| Name | Range | Hero | Buy controls | Sections |
|---|---|---|---|---|
| `sm` (base) | ≤ 760 | Single column. Ticket first, then the stub (info only), then the lede | **Sticky bottom bar only** (§5.5) | Single column |
| `md` | 761–1023 | Ticket body full width; the stub sits **below** the body behind a horizontal perforation, with full controls | In the stub. No sticky bar | Single column, title above content |
| `lg` | 1024–1335 | Ticket full width: `[body 1fr | stub 368]`. Lede row underneath: `[lede 1fr | odds table 1fr]`, 40 gap | In the stub | `[248 | 40 | 1fr]` |
| `xl` | ≥ 1336 | `[lede 248 | 40 | ticket: body 1fr | stub 368]` | In the stub | `[248 | 40 | 1fr]` |

The three-column hero needs about 1336px. Below that, the prize (212px) and the LOCKED stamp (200px) do not fit beside each other in the body, which is why `lg` moves the lede below the ticket. Check widths 320, 390, 768, 1024, 1280 and 1440 for no horizontal scroll.

### 3.2 Grid

- **Page:** `max-width: 1440px; margin: 0 auto; padding: 0 var(--gutter)`. At xl the content is 1312px wide.
- **Editorial column:** 248px wide plus a 40px gap, repeated in every section at ≥ 1024px. The intentional asymmetry is narrow voice on the left and wide paper on the right. Nothing is centred except text inside stamps and the 96px quantity figure.
- **Hero ticket** (xl): 1024px wide, with the body at 656px (inner 576px) and the stub at 368px (inner 296px).
- **Reveal overlay:** `[side 248 | 40 | main 1fr]` at ≥ 1024px; single column below.
- **Past draws:** `[248 | 40 | old ticket 512 | 48 | slip 1fr]` at xl; the slip goes under the ticket below 1336px.
- DOM order matches reading order: lede first, then the ticket. At `sm` and `lg`, CSS `order` shows the ticket before the lede. The lede contains no focusable elements, so focus order never jumps backwards.

### 3.3 Vertical budget (fixture `open`)

**Desktop 1440×900.** Everything required sits in the first viewport with about 60px to spare.

| Block | y (px) |
|---|---|
| Devnet strip (sticky) | 0–28 |
| Masthead | 28–100 |
| Hero top (padding 24) | 124 |
| Ticket head and double rule | 124–200 |
| "Grand prize" + **1 SOL** + LOCKED stamp | 200–438 |
| Proofline with vault link (3 lines) | 454–532 |
| Facts: **2 d 5 h 31 min left**, **Sun 4 Oct, 04:13 UTC**, **100 of 150 sold** | 574–724 |
| Barcode + key | 740–812 |
| Ticket bottom | ≈ 838 |
| Stub, same top (124): head 148–196; quantity 220–332; picks 340–384; total 432–466; fee line 472–492; **Buy button 516–572**; "Results land…" 580–602; ledger 626–734; limits and free entry to ≈ 810 | — |

**Mobile 390×844.** The sticky bar covers 768–844 plus the safe area.

| Block | y (px) |
|---|---|
| Strip (sticky) | 0–24 |
| Masthead | 24–80 |
| Ticket head | 96–132 |
| **1 SOL** (LOCKED stamp to its right, never touching) | 140–292 |
| **2 d 5 h 31 min left** + **Sun 4 Oct, 04:13 UTC** + note | 308–430 |
| Lock line + vault link | 446–541 |
| **100 of 150 sold** + barcode | 565–697 |
| Sticky bar: − 10 + · Buy 10 · 0.10 SOL | 768–844 |

### 3.4 Z-index

| Layer | z |
|---|---|
| Content | 0 |
| Stamps on paper | 2 |
| Winning stubs that dropped | 5–6 |
| Mobile buy bar | 70 |
| Scrim | 80 |
| Reveal overlay | 85 |
| Sheet | 90 |
| **Devnet strip** | 100 (always on top, including over the sheet and the reveal) |
| Fixture badge (fixture builds only, inside the strip) | 101 |

The sheet's `max-height` is `calc(100dvh - var(--strip-h) - 8px)` so the strip stays visible. The wallet-adapter modal (z 1040 in the library) temporarily covers the strip. That is accepted, because the modal is the wallet's own UI.

---

## 4. The print kit (signature objects)

Each object becomes a small component in `app/src/components/print/`. Each one is specified once here and reused by the screens in §5.

### 4.1 Draw ticket (anatomy)

The ticket is one stock-coloured object (radius 6, `--shadow-ticket`, `grain-stock`). Its two halves are separated by a vertical perforation with notches at top and bottom; at `md` and `sm` the perforation is horizontal with notches left and right.

**Body**, top to bottom:

1. **Head row.** `.t-ticket-head` "DRAWSOL · GRAND DRAW" on the left, `.t-serial` "Nº 0003" in **ink** on the right. Underneath is the double rule, whose lower line is the microtext (§4.7).
2. **Prize block:**
   - `.t-label` italic "Grand prize";
   - `.t-prize` figure;
   - the stamp: LOCKED, DRAWN or CANCELLED by state.

   The stamp sits to the right of the figure, its top aligned to the figure's cap height. It never overlaps the figure, and it keeps at least 24px of clearance from the countdown below.
3. **Proofline.** `.t-body` at 17/1.5, ink-2, with the lead sentence in ink 600. It holds exactly **one** proof link.
4. **Double rule.**
5. **Facts row.** Desktop grid `1.08fr 1fr`, gap 32. Time on the left, sold on the right. Both are written as sentences (§6).
6. **Barcode** (§4.4) across the full body width, with its key below.
7. **Specimen overprint** (§4.7). It runs vertically along the perforation on desktop and horizontally above the perforation on mobile.

**Stub:** the content depends on the draw state (§5.3, §5.5).

### 4.2 Stubs (in strips)

A stub is 102×132 (Your tickets) or 100×212 (reveal), with `grain-stock`. Stubs join into a strip with 4px perforations between them; only the outer corners are rounded (4px). The strip as a whole carries `--shadow-slip`. A strip shows at most 10 stubs per row, and further rows sit under a horizontal perforation.

Stub states:

| State | Serial colour | Body |
|---|---|---|
| Sealed (result not revealed yet) | ink | Halftone cover with a "SEALED" label in `.t-ticket-head` 10.5px on a stock tab. In Your tickets: "?" punch ring + italic "sealed" |
| No win | ink | `.t-small` italic "no win" in ink-3. Roll line (reveal only) |
| Won | **red-ink** | `.t-stubamt` amount in ink, then "SOL won" (or "SOL, paid" in Your tickets) at 14px, a WON stamp and the roll line |
| Free entry | ink | Italic "free entry" in ink-2. No roll (free entries do not roll) |
| Drawn (settled, holds the winner) | **red-ink** | Small DRAWN stamp + "1 SOL, paid" |
| Refunded | ink-3 | REFUNDED stamp across the roll; italic "refunded" |

### 4.3 Stamps

There is one component: `<Stamp kind seed label size angle />`. It renders inline SVG drawn from `app/src/design-assets/stamp-*.svg`, with `mix-blend-mode: multiply` and `pointer-events: none`.

| Kind | Asset | Text (parametrised) | Where | Size desktop / mobile | Base angle |
|---|---|---|---|---|---|
| `locked` | `stamp-locked.svg` | PRIZE · DRAW Nº {n} / LOCKED / IN THE VAULT | Prize (open, due, drawing) | 200 / 120 | −8° / −7° |
| `closed` | `stamp-closed.svg` | SALES · DRAW Nº {n} / CLOSED / {THU 1 OCT} (date only; the time is on the ticket face) | Struck across the stub's head rule, top right, out of the flow (due) | 160 / 128 | +6° |
| `drawn` | `stamp-drawn.svg` | DRAWN / {20 SEP} / DRAW Nº {n} | Prize (settled); past tickets | 184 / 128 | +7° |
| `paid` | `stamp-paid.svg` | arc: PRIZE {1 SOL} / DRAWSOL, centre PAID. Reveal variant: DRAW Nº {n} / SAME TX | Past ticket stub; reveal end | 118 (past), 144 box / 131 ring (reveal) / 100 box | −14° / −12° |
| `won` | `stamp-won.svg` | WON | Winning stubs | 74 (86 for ≥ 0.05 SOL) / 48 in Your tickets / hidden in mobile reveal rows | −12° |
| `cancelled` | `stamp-cancelled.svg` | DRAW Nº {n} / CANCELLED / REFUNDS OPEN | Prize (cancelled) | 200 / 120 | −6° |
| `refunded` | `stamp-refunded.svg` | REFUNDED | Refunded entry rolls | 120 / 96 | −5° |

In the reveal's end cell the PAID stamp is `padded`: its SVG carries a 5% ink margin in the viewBox and `overflow: hidden`, so neither the wobble nor the arc legend can paint outside its own box (and the overlay can never pan sideways).

**Each print is unique** (must-fix). This replaces the prototype's single shared filter seed:
- Every instance renders its own `<filter id={useId()}>`.
- Its parameters come from seed bytes through `stampPrint(bytes, baseAngle)` in `generate.mjs`:
  - `seed` (speckle, 1–997);
  - `wobbleSeed` (edge, 1–97);
  - `threshold` (4.0–4.5);
  - `wobble` (1.2–2.0);
  - `pressure` (opacity .82–.98);
  - `angle` (base ±3°).
- Port the function to `lib/print.ts`. It is UI-only and touches no chain code.

| Kind | Seed bytes, so the ink is printed from the real data |
|---|---|
| `won` | bytes 8–15 of `sha256(randomness ‖ "ticket" ‖ ticket_le_u32)`. Bytes 0–7 are that ticket's roll, so the stamp comes from the same randomness that decided the result |
| `paid` (reveal) | first bytes of the entry's ORAO randomness |
| `drawn`, `paid` (past) | first bytes of that draw's `randomness` |
| `locked`, `closed`, `cancelled` | the draw account address bytes |
| `refunded` | the entry account address bytes |

The reveal states the source once: "Each stamp's ink is printed from that ticket's randomness."

**Accessibility:**
- Every stamp has `role="img"` and an `aria-label` that states the fact, e.g. "Stamped: prize locked in the vault", "Stamped: won 0.05 SOL", "Stamped: paid in the same transaction".
- The same fact is always also written in plain text nearby.
- Filter and arc-path ids are unique per instance.

### 4.4 Barcode sales meter

`<Barcode draw entries mine drawn />` renders an inline SVG with `shape-rendering="crispEdges"` and integer x positions only. The reference algorithm is `barcode()` in `generate.mjs`, and the reference render is `barcode-open.svg` (desktop) / `barcode-open-mobile.svg`.

**Data:**
- `slots = d.ticketCap + d.freeTickets`. A free entry takes a ticket number but not a paid slot.
- `taken = d.nextTicket`.
- `free = entries.filter(e => e.isFree).map(e => e.firstTicket)`. When `entriesState !== "ready"`, use an empty list; the count is still honest.
- `mine` = every ticket number in `myEntries`.
- `drawn = d.winningTicket` when settled, else −1.

**Marks**, one per ticket number from left to right:

| Ticket | Mark |
|---|---|
| Sold | Ink bar, full height (40px desktop / 34 mobile) |
| Free entry | The same bar, punched through the middle (6px gap) |
| Yours | Raised by 8px (6 mobile) and **blue**: you chose these |
| Drawn (settled) | Raised and **red** (a drawn ticket that is also yours shows red) |
| Unsold | 1px `--rule-2` hairline at 38% height on a 1px baseline |

**Pitch:**
- 3px (2px bar, 1px gap) when `slots × 3 ≤ width`, else 2px (1px bar).
- Above 400 slots (mainnet cap 10,000), one bar = 25 tickets and the key says so.

**Key** (`.t-key`, ink-3), positioned under the bars it names:
- "#0000" at the left;
- "yours" in blue-ink italic Newsreader 14 under your first range;
- "{50} left" at the first hairline;
- "sell-out" right-aligned at the end.

A label is dropped if it would sit within 8px of another one; "yours" wins over "#0000".

**Accessibility:** `role="img"`, with `aria-label="100 of 150 tickets sold, plus 2 free entries. Yours: #0031 to #0040, #0059 and #0097 to #0101."`

**Reused as:**
- the hero meter;
- the past-draw barcode (`slots = taken = nextTicket`, drawn bar red; reference `barcode-past.svg`);
- the mark (§4.12).

### 4.5 Number wheel (replaces SplitFlap)

`<NumberWheel value label />` renders each character in its own span with `overflow: hidden; display: inline-block`. When `value` changes, only the changed characters advance (§2.8). The countdown uses it like this:

| Time left | Shown as |
|---|---|
| ≥ 1 hour | `{d}` *d* `{h}` *h* `{mm}` *min* *left* |
| < 1 hour | `{m}` *min* `{ss}` *s* *left* |

The digits are `.t-fact`; the units and "left" are `.t-label` at 22px in ink-2, with 3px before and 10px after each unit.

Accessibility: `role="timer"`, `aria-live="off"`, and an `aria-label` updated once a minute: "Closes in 2 days, 5 hours and 31 minutes". `SplitFlap.tsx` and `FlapSkeleton` are deleted.

### 4.6 Punch buttons and pen circle

- **Punch** (−/+):
  - 48×48 circle with `--paper` fill and `box-shadow: inset 0 0 0 1.5px var(--ink), inset 0 3px 0 rgba(60,45,20,.12)` (a hole punched through the stub);
  - glyph is a 16px SVG minus/plus with a 2.2px ink stroke;
  - hover and active fill `--paper-2`; disabled at opacity .35;
  - `aria-label` "One fewer ticket" / "One more ticket".
- **Pen circle** (`pen-circle.svg`):
  - an irregular ballpoint loop in `--blue`, 2px non-scaling stroke;
  - drawn around the **chosen quick pick only**, overshooting the button by 6px each side;
  - draw-on per §2.8.
- **Quick picks** 1 / 5 / 10 / 25:
  - each button is **44×44 minimum** (must-fix), with the visible numeral `.t-ui` 17/600 (chosen: 800, ink);
  - the row uses `justify-content: space-between` across the stub;
  - `aria-pressed`; group `aria-label="Quick picks"`;
  - picks above the current maximum are disabled.

### 4.7 Microtext rule and specimen overprint (grafts from Certificate)

- **Microtext rule:**
  - An SVG 6px high: one `<text>` at `.t-micro` (Archivo 75%, 4px, ink, `fill-opacity .75`) repeating `FwM598mwYfusUtpuN66f8bteTTubL9SJJ5RuPiVonuUb · ` (from `PROGRAM_ID`) to fill the width, clipped.
  - It is the lower line of the double rule under the draw ticket's head. At 1x it reads as a dotted hairline; zoom in and it is the real program ID.
  - `aria-hidden="true"`. The program ID is accessible in the footer.
- **Specimen overprint:**
  - "DEVNET SPECIMEN · PLAY MONEY · NO CASH VALUE" in `.t-specimen` and blue-ink.
  - Desktop: `writing-mode: vertical-rl; transform: rotate(180deg)`, 14px left of the perforation centre, vertically centred.
  - Mobile: one horizontal line centred 8px above the horizontal perforation.
  - `aria-hidden` (the strip carries the accessible marker).

### 4.8 Money plate (the misregistration, fixed)

The prototype's `text-shadow` read as a retro drop shadow. It is replaced by a true second plate, used **only on the sheet where money moved**: the reveal total.

- The total figure is rendered twice in one SVG. First comes the red plate: the same text in `--red`, translated `(1.5px, 1px)`, `mix-blend-mode: multiply`. On top of it comes the ink text.
- The same `(1.5, 1)` offset applies to that sheet's other red-plate items: the double rule above the total and the PAID stamp. The whole red plate is shifted consistently, the way a real plate shift would be.
- **The hero "1 SOL" has no misregistration.** It is plain ink, and the LOCKED stamp is its only red. This follows the colour law: the prize is locked, not paid.

### 4.9 Halftone sun (fixed)

The sun is a half disc of red halftone. It rises behind the reveal total and is cut flat by the horizon, a 1px ink rule on the figure's baseline. Reference render: `sun-440.svg` / `sun-280.svg`; algorithm: `sunDots()` in `generate.mjs`.

- **No moiré.** Dot centres sit on an integer 45° lattice (4px grid, checkerboard) and the sun is rendered at 1:1 (`width` = viewBox width; never CSS-scaled). Desktop uses up to 360px (it must fit the 224px slot) and phones 224px, as separate renders. Every dot rasterises identically at 1x and 2x.
- **Clear of the glyphs.** The sun lives in the same SVG as the total text, under a `<mask>`: a white rect, minus the total text stroked with `stroke-width: 16; stroke-linejoin: round` in black. Dots never come within 8px of a glyph, so the numerals are the cleanest thing on screen. This was checked at 1x and 2x.
- **Placement:** the centre sits on the horizon, horizontally under the midpoint of the rendered "0.08 SOL" text box (measured with `getBBox`), then clamped so the whole disc stays inside the main column: it never bleeds into the gutter or off a phone's edge. Opacity .85, multiply. It appears only when wins > 0.
- **"You won"** sits in its own strip above the sun's top edge, on clean paper. It is not part of the mask, so no halo is carved out of the dots around it.
- **Density:** dot radius `0.45 + 1.25 × (1 − d²)` px, denser at the core and fading to the rim.

### 4.10 Receipt bars (graft from Poster)

The receipt is a tear-off slip under the reveal total: stock, perforated top edge, `--shadow-slip`. It holds one bar per ticket, with the algorithm `receipt()` and the reference `receipt-0031-0040.svg`.

- The slip has a fixed width: 300px in the bottom row from 761px, the full column on phones. The pitch spreads the tickets across it: `min(48, inner width / n)`, so the bottom row stays `[300 | 48 | actions]` on every reveal. Bar width 6px (4px below a 17px pitch).
- **Height is proportional within the receipt.** The largest win on this receipt is 48px and every other win scales to it, never under 12px: 0.05 → 48px and 0.01 → 12px; a single 0.01 win is 48px. The labels keep the proportion honest. The plot height is fixed at 48px, so nothing moves while the bars grow.
- A ticket that won nothing is a 1px × 3px ink-3 tick hanging **under** the baseline (losers quiet, winners loud); a ticket still sealed is the same tick in `--rule-2`. The baseline is 1px ink.
- Winning bars are red and carry their amount above in `.t-key` red-ink ("0.05"). Ticket numbers sit under the baseline in `.t-key` ink-3 ("31" … "40").
- Italic label "Your receipt". `role="img"` with a full aria-label listing the wins.

### 4.11 Carbon slip (replaces the "callout" recompute box)

This is a duplicate-book carbon copy, not an admonition box. It has no left border.

**Paper:**
- `--stock` with `grain-stock`;
- blue ruled lines every 32px (`repeating-linear-gradient(180deg, transparent 0 31px, rgba(36,72,176,.16) 31px 32px)`);
- a perforated top edge (`.perf-h`), radius 3, `--shadow-slip`;
- rotated +0.6° on desktop, 0° on mobile.

**Content:**
1. Italic `.t-small` "Carbon copy" in ink-2, then `.t-stub-head` "Recompute Draw Nº 2 in this browser".
2. Four ledger lines sitting on the blue rules. The label is Newsreader 16 on the left; the value is Archivo 85% 600 tabular 15 on the right. Values computed by the browser are written in **blue-ink**, the clerk's pen. Before the run they show "—" in ink-3.
3. Button "Recompute": `--blue` fill, stock text, 44px, `.t-btn` at 15px. After a run it becomes a secondary blue button, "Run it again".
4. Result line: "Match." in blue-ink with the check icon, or "No match." in red-ink, followed by the sentence.
5. ORAO line, then one proof link: "ORAO request on Solscan".

### 4.12 Mark and wordmark (redrawn)

- **Mark** (`mark.svg`, 36×28):
  - a notched paper ticket in ink, printed with a knocked-out barcode (stock);
  - **one bar is vermilion and breaks out through the top edge**: the drawn ticket;
  - it combines ticket, barcode and "drawn" in one object, from the same grammar as the hero meter;
  - sizes 28px (masthead), 20px (footer, mobile mast), 56px+ (favicon source); never below 20px.
  - Also copy it to `app/src/app/icon.svg` for the favicon.
- **Wordmark lockup:**
  - mark, 10px gap, "DrawSol" in Archivo 112% 850 at 21px (18 on mobile, tracking −.01em);
  - on desktop only, a 1px `--rule-2` divider with 12px padding, then italic Newsreader 16 "Ticket office" in ink-2.
  - The lockup is a link to `#top` with `aria-label="DrawSol ticket office, back to the top"`.
- **Removed:** the black ticket glyph with a red dot, and the giant "DrawSol." footer wordmark (a trend trope).

### 4.13 Buttons, links, inputs, errors

| Control | Spec |
|---|---|
| Primary button | Ink fill, stock text, `.t-btn`, radius 3, min-height 56 (stub, confirm), 48 (mobile bar), 44 (inline), `--shadow-btn`. Hover `#000`. Active `translateY(1px)` with no shadow. Disabled: `--paper-2` fill, ink-2 text, no shadow, `cursor: not-allowed` |
| Secondary button | Transparent, `box-shadow: inset 0 0 0 2px var(--ink)`, ink text, same sizes. Hover `rgba(27,24,20,.05)` |
| Text button | `.t-link` in blue-ink, underline 1px with 3px offset. Used for "Change quantity", "Undo", "Replay", "Skip to total", "Show all…", "Claim free entry". Hit area ≥ 44px tall via padding |
| Proof link (`<ProofLink>`) | Like a text button, plus a 0.62em ↗ arrow drawn with a CSS `mask` (not a glyph), `white-space: nowrap`, `target="_blank" rel="noopener noreferrer"`, and an sr-only " (opens Solscan)". **The label is always a phrase that names the thing** ("Check the vault on Solscan", "Payout transaction"), never "verify" |
| Radio row (skill question) | Full-width row, min-height 48, 1px `--rule` under each. Custom 20px ring (1.5px ink-2). Checked: ink ring with a 10px blue dot. Label `.t-ui` 17/500. Keyboard focus: a 2px **ink** ring around the whole row (offset 2px), never a blue ring on the circle, so focus can't be mistaken for a choice. When the confirm step opens, focus goes to the "Check and pay" heading (`tabindex="-1"`), never to an option. The radio ring is used only here: step lists use numbered marks (§5.5, §5.6) |
| Checkbox (18+) | Native 20px, `accent-color: var(--ink)`. The label is the whole row (min-height 44) |
| Busy | 8px ink dot (blinking only while a real request is in flight) followed by the verb: "Confirming on devnet…" |
| `ErrorNote` | No box. 1px red-ink rules above and below with 12px padding. Lead-in "Didn't go through." in Archivo 88% 800 red-ink, then the human message in Newsreader 16 ink. "Dismiss" text button (44px target). `role="alert"` |
| Addresses and number + unit pairs | Always `white-space: nowrap` (class `.nw`): "5zXY…4wAD", "0.08 SOL", "#0031–#0040", "2 d", "Sun 4 Oct". Addresses are `short(addr)` with the full value in `title` |

---

## 5. Components, file by file

Every file in `app/src/components/` is listed below with its new design. **Data-layer rule:** hooks and lib keep their behaviour. The only allowed touch points are listed in §5.19.

### 5.1 `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- **`layout.tsx`:**
  - font imports per §2.2;
  - `metadata.title` "DrawSol · a prize draw you can check on-chain";
  - `description` unchanged in substance;
  - `viewport.themeColor` "#EFE8D9";
  - `<html lang="en">`.
- **`page.tsx` order:**
  1. `<DevnetStrip/>`
  2. `<Header/>`
  3. `<main id="top">`
  4. Hero (`<Lede/>` + `<Board/>`, with `<BuyPanel/>` inside the ticket as its stub)
  5. `<MyTickets/>`
  6. `<EntriesBoard/>`
  7. `<PastDraws/>`
  8. `<Rules/>`
  9. `</main>`
  10. `<Footer/>`
  11. `<MobileBuyBar/>`
  12. `<ConfirmSheet/>` (mobile)
  13. `<RevealSheet/>`

  Wrap everything in `<BuyProvider>` (§5.5). The `DataRoot` fixture gate stays exactly as it is.
- **`globals.css`:**
  - Delete all Night Draw classes: `.eyebrow`, `.display`, `.mono`, `.frame`, `.brass-rule`, `.flap*`, `.lamp`, `.verify`, `.stub*` (old), `.dep-row`, `.stepper`, `.preset`, `.choice`, `.skel`, and the old wallet-modal overrides.
  - Add the tokens (§2.9), type classes (§2.3) and print-kit classes (§4).
  - Global reduced-motion block: `@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}`.
  - `html{scroll-padding-top:calc(var(--strip-h) + 16px)}`.

### 5.2 `Header.tsx` (+ new `DevnetStrip`)

**DevnetStrip:**
- Sticky at the top, z 100, height `var(--strip-h)` (28 desktop, 24 mobile), `--blue` background, stock text, `role="note"`. There is no grain.
- Contents are left-aligned inside the page wrap:
  - **"Devnet demo · play money"** in Archivo 112% 800 13px (12px mobile);
  - on md and up, a 16px gap then "Tickets and prizes have no cash value." in Archivo 88% 500 at 86% opacity.
- In fixture builds only, the FixtureProvider renders its badge at the strip's right end (§5.18). It never sits over page content.
- It stays visible while the confirm sheet and the reveal overlay are open (§3.4).

**Header (masthead):**
- Not sticky. 72px tall desktop, 56px mobile. Flex row: wordmark (§4.12) on the left; nav and wallet on the right with a 32px gap.
- **Nav** (≥ 1024px, only when `load.kind === "ready"`): "Your tickets" (`#my-tickets`), "Past draws" (`#past`), "How it works" (`#rules`) in `.t-ui` 15/500 ink-2. Hover: ink with a 4px-offset underline.
- **Wallet:** `<WalletButton/>` (§5.15).
- On mobile: wordmark at 18px, no "Ticket office", no nav. The wallet shows the address only.
- Removed: the "DEVNET" mono chip, the second mobile marker row and `bg-black`.

### 5.3 `Board.tsx` → the draw ticket (hero)

The file may be renamed `DrawTicket.tsx`; update the imports in `page.tsx`. It renders the ticket anatomy (§4.1). `<BuyPanel/>` renders the stub. A new `<Lede/>` (inside the same file or `Lede.tsx`) renders the left column.

**Data:**

| Shown | Source |
|---|---|
| Serial | `Nº ${pad4(d.id)}` |
| Prize | `sol(d.prizeLamports, 0, 4)` (gives "1", "1.5", "12.25"). Do not use `prizeText()`, which gives "1.00" |
| Vault | `sol(vaultLamports, 2, 3)`. Link: `solscanAccount(vaultPda(d.address))`, which is the real vault PDA (fixture Draw 3: `EiPv…FPPD`) |
| Countdown | `d.closesAt − now` |
| Close time | `utcLabel(d.closesAt)`. Change its format to "Sun 4 Oct, 04:13 UTC" by adding the comma. Local time: `localLabel(...)` shown only when `new Date().getTimezoneOffset() !== 0` |
| Sold | `d.paidTickets`, `d.ticketCap`, `remaining(d)`, `d.freeTickets` |
| Barcode | §4.4 |
| Phase | `phaseOf(d, now)` |

**Lede (left column at xl, below the ticket at lg and sm):**
- `.t-lede-h` h1;
- one `.t-lede` sentence;
- the instant-win odds table: a 2px ink rule on top, then a heading row "Instant wins" (Archivo 88% 700 14) with italic ink-3 "demo odds, boosted" right-aligned;
- one row per `activeTiers(d)`: amount in Archivo 85% 700 16 on the left, `oneIn(t.odds, d.iwDenominator)` right-aligned in ink-2, 1px `--rule` rows 36px tall;
- a sum row "Any instant win · 1 in 5" with the italic label and a bold value;
- one `.t-small` caption.

That is all: the lede plus the odds table. "Anyone can run the draw…" has moved to the back of the ticket (must-fix). In `settled` and `cancelled` the odds table is hidden.

**States.** The stamp, facts, proofline and stub change together. Copy is in §6.

| State (`phaseOf`) | Prize block | Proofline | Facts row | Barcode | Stub (§5.5) |
|---|---|---|---|---|---|
| **open** (`selling`) | "Grand prize" · 1 SOL · LOCKED | Locked sentence + vault total + **Check the vault on Solscan** | Time left + close time + note \| "100 *of 150 sold*" + note | Live, yours raised blue | Buy |
| **open, 0 tickets** (`empty`) | as open | as open | Time \| "0 *of 150 sold*" + "The first ticket is #0000." | 150 hairlines | Buy (ledger shows "No tickets yet") |
| **due** | as open (LOCKED stays: the prize is still in the vault) | as open | "*Closed* Sun 4 Oct, 04:13 UTC" or "*Sold out*" + note \| "100 *of 150 sold*" + "102 tickets in the draw" | Frozen | Run the draw, with a SALES CLOSED stamp on the stub head. 0 tickets: Close the draw |
| **drawing** | as open | as open | *Winning ticket* "#????" in ink-3 + "Waiting for ORAO, usually a few seconds"; once fulfilled "#0067" in **ink** + "Computed from ORAO's randomness. Final once settled." \| "102 *tickets in the draw*" | Frozen | Settle the draw (3 steps) + safety-valve line |
| **settled** | "Grand prize, paid" · 1 SOL · **DRAWN** stamp + **three punched holes** (12px, 20px apart, right-aligned under the serial, `--paper` fill with `inset 0 1px 2px rgba(60,45,20,.25)`) | "Paid to 5ggm…7nnQ on 2 Oct, 08:12 UTC." + **Prize transaction** | *Winning ticket* "#0067" in **red-ink** + "out of 102 tickets" \| *Paid to* 5ggm…7nnQ | Drawn bar raised red | Draw finished + carbon slip |
| **cancelled** | "Prize, not awarded" · 1 SOL in ink-3 · **CANCELLED** stamp | "This draw was cancelled before a winner was drawn. Every paid ticket can claim a full refund from the vault, which holds 3.61 SOL." + **Check the vault on Solscan** | *Refunded so far* 0.37 *of* 1.00 SOL \| *Your refund* 0.15 SOL (or "Connect a wallet to check") | Frozen | Refunds are open |

Removed:
- the `OnAirLamp`;
- the "opened {date}" eyebrow;
- the `Verify` chips on the slate and on `closes_at`;
- the three-up `OddsRow` (odds now live in the lede table and the stub ledger);
- the `Meter`;
- `Stat` labels.

**Proof links on the ticket face:** exactly one per state.

### 5.4 `SplitFlap.tsx` → **delete**

It is replaced by `NumberWheel` (§4.5) for the countdown. The prize, sold count and winning ticket are static figures that only change on real events and need no flap. `FlapSkeleton` is replaced by the loading ticket (§5.14).

### 5.5 `BuyPanel.tsx` + `MobileBuyBar` + **new** `ConfirmStep` + **new** `BuyProvider`

**`BuyProvider`** (new, `components/BuyContext.tsx`). This is UI state only, not data:
- `qty` (default 10, clamped to `maxQ`);
- `step: "pick" | "confirm"`;
- `openConfirm()`, `closeConfirm()`;
- `adultRemembered` (localStorage key `drawsol.adult` = `"yes"`, with every read and write in `try/catch`; it renders correctly when storage throws);
- `focusBuy()`, used by "Buy more tickets" in the reveal.

`maxQ` is computed exactly as today: `walletAllowance(d, player).max` when connected, else `min(d.maxPerTx, remaining(d))`. `BuyPanel` and `MobileBuyBar` share this state, so there is only ever one quantity.

**Stub, open state** (`BuyPanel`, ≥ 761px). Top to bottom, inside the stub:

1. **Head:** `.t-stub-head` "Buy tickets" on the left (sentence case, not expanded caps); `.t-ui` 15 "**0.01 SOL** each, flat" on the right; double rule under it.
2. **Quantity** (margin-top 24): grid `48px 1fr 48px` with punch −, the figure, punch +. The figure is `.t-qty` with `.t-label` "tickets"/"ticket" under it (centred; the one centred element). `<output aria-live="polite">`. There is no free-typing input; the punches and picks cover 1–25.
3. **Quick picks** (margin-top 8): 1 / 5 / 10 / 25 (§4.6).
4. **Total** (margin-top 24, padding-top 24, dashed rule): "10 × 0.01 SOL" in `.t-small` ink-2 on the left; `.t-rowtotal` "0.10 SOL" on the right.
5. **Fee line** (margin-top 6): `<details>`. The summary is `.t-fine` "+ ≈0.003 SOL network & randomness fee" with a 10px chevron and a dotted underline.
   - The value is `costs.oraoFee + costs.entryRent + (player ? 0 : costs.playerRent)`, rounded to 3 decimals, with "≈" prefixed.
   - The expanded detail is one Newsreader 15 paragraph (§6).
   - If `costs` is unavailable: "+ network & randomness fee, shown in your wallet before you sign".
6. **Buy button** (margin-top 24): primary, 56px, "Buy 10 tickets".
7. "Results land about 2 s after you pay." in `.t-small` ink-2 (margin-top 8).
8. **Ledger** (margin-top 24): rows of `.t-small` label and `.t-ui` 15/700 value, 1px rules, 36px rows:
   - "Grand-prize odds, per ticket": "1 in 102 now";
   - "You hold": "16" plus a "see them" text link to `#my-tickets`;
   - "You can still buy": "34".
9. "25 per purchase, 50 per wallet." in `.t-fine` ink-3.
10. **Free entry line** (`.t-fine`): its state text plus a "Claim free entry" text button. It calls `claimFree()`, or opens the wallet modal when disconnected.

Leftover height goes **below** item 10, never between blocks (must-fix: no 80px gap). **No `margin-top: auto`.**

At the wallet limit, the ledger's "You can still buy 0" row is replaced by this wallet's tally: "Your grand-prize odds 1 in 2.0 now", "Spent", "Won so far" (from `player`, as in Your tickets).

**Buy button and bar states**, in priority order:

| Condition | Stub button | Mobile bar button | Helper (stub only, under the button) |
|---|---|---|---|
| No wallet | "Connect wallet to buy" (opens the wallet modal; afterwards continue to confirm) | "Connect wallet to buy" ("Connect wallet" below 385px), keeping the stepper and the quantity | — |
| Wallet limit reached (`allowance.wallet === 0`) | disabled: "Wallet limit reached (50 of 50)" | disabled: "Limit reached" (stepper hidden) | — |
| Balance < subtotal + fees | "Get devnet SOL" (link to `FAUCET_URL`) | "Get devnet SOL" (link to `FAUCET_URL`), note "You have 0.0123 SOL" (4 decimals, as the stub) | "You have 0.0123 SOL. 10 tickets need ≈0.103 SOL with fees." |
| `disabledReason` | disabled: as in normal | disabled | `disabledReason` in `.t-fine` |
| Normal | "Buy 10 tickets" → `openConfirm()` | "Buy 10 · 0.10 SOL" → `openConfirm()` | — |

**Confirm step** (`ConfirmStep.tsx`). It renders inside the stub at ≥ 761px, replacing items 2–10 with a 160ms crossfade, and inside the sheet at ≤ 760px. There is one component and one instance, selected by `matchMedia("(max-width: 760px)")`.

1. **Head row:** `.t-stub-head` "Check and pay" on the left; text button "Change quantity" on the right (`closeConfirm()`, which returns focus to the Buy button).
2. **Summary** (dashed rule above, 12px): "10 tickets × 0.01 SOL" on the left; `.t-rowtotal` 30px "0.10 SOL" on the right.
3. **Fee line**, one line: "+ ≈0.003 SOL network & randomness fee". Details on demand, as above.
4. **Numbering note** (`.t-fine` ink-2): "Numbered from #0102, unless someone buys first." (`ticketNo(d.nextTicket)`).
5. **Skill question**, a `<fieldset>`:
   - `<legend>` in `.t-body` 18/1.35: "Which planet is known as the Red Planet?";
   - italic ink-2 sub-line: "One general-knowledge question, then you pay.";
   - three radio rows (§4.13): **Mars / Venus / Jupiter**, shuffled once each time the step opens;
   - feedback `<p aria-live="polite">`: correct gives "Correct." in blue-ink; wrong gives "Not quite. Have another go." in ink.

   There is exactly one question, the one committed to by `d.termsHash`. It is not a riddle, and it is checked in the app only (the back of the ticket says so).
6. **18+**, asked once:
   - If not remembered: a checkbox row "I'm 18 or older." with ink-2 "Asked once, remembered on this device." Checking it and paying stores `drawsol.adult = "yes"`.
   - If remembered: one `.t-small` line "**18+** confirmed on this device · Undo". Undo clears the key and shows the checkbox again.
7. **Pay button** (primary 56px):
   - "Pay 0.10 SOL", disabled until the answer is right and 18+ is satisfied, with `aria-describedby` → "Answer the question and confirm you're 18+ to pay.";
   - on click it calls `buy(qty)`;
   - busy labels come from `phase.buy`: "Checking with the program…" → "Approve in your wallet…" → "Confirming on devnet…".
8. **Fine print** (`.t-fine` ink-3): "Then sign in your wallet. About 2 s later it asks once more, to reveal your results and pay any wins." This is honest: the live `revealFlow` sends a second, wallet-signed transaction.
9. `errors.buy` renders an `ErrorNote` under the Pay button.

Esc closes the step on desktop and the sheet on mobile.

**Mobile buy bar** (`MobileBuyBar`, ≤ 760px, only while `selling`):
- Fixed to the bottom. Stock background with `grain-stock` and `--shadow-bar` (double-ruled top edge).
- Padding `12px 16px calc(12px + env(safe-area-inset-bottom))`.
- Grid `auto 1fr`, gap 12:
  - left: punch − (48), quantity in `.t-qty` mobile (36px) with min-width 40, punch + (48), gap 4;
  - right: primary button, min-height 48, "Buy 10 · 0.10 SOL" (`aria-label` "Buy 10 tickets for 0.10 SOL").
- The page gets `padding-bottom: 96px + safe area` so nothing is hidden under the bar.

**The in-flow stub on mobile has no stepper, picks or Buy button** (must-fix: one quantity control). It shows only:
- the head ("0.01 SOL each, flat");
- the ledger;
- the limits note;
- the free-entry line.

**Confirm sheet** (≤ 760px):
- `role="dialog" aria-modal="true" aria-labelledby` → "Check and pay";
- stock background, top radius 10, 40×4 grab handle in `--rule-2`;
- padding `24px 16px calc(24px + safe area)`;
- `max-height: calc(100dvh - var(--strip-h) - 8px)` with overflow auto;
- focus trapped; scrim click and Esc close it; focus returns to the bar's Buy button.

**Stub in other states** (`BuyPanel` when `phase !== "selling"`). These replace the old "Tickets / Sales closed" aside:

| State | Stub contents |
|---|---|
| due | Head "Run the draw" at its open-state height (both halves share one head rule) with the SALES CLOSED stamp struck across the head rule at the right, out of the flow (never over text, the steps or a button) · three steps with **numbered** marks (1, 2, 3 in a dashed `--rule-2` circle; never a radio ring) · `.t-body` explanation · primary "Run the draw" (`runDraw`) · `.t-fine` "+ ≈0.0005 SOL randomness fee, paid by you" (`costs.oraoFee`) · busy labels from `phase.run` · `errors.run`. No tickets: head "Close the draw", button "Close the draw". Then a "Your entry" mini-ledger when the wallet holds tickets |
| drawing | Head "Settle the draw" · three-step list: ✓ "Randomness requested from ORAO for 102 tickets" + **Request** link (`d.drawVrfRequest`); ✓ or busy "Randomness landed" / "Waiting for ORAO, usually a few seconds"; "Settle pays 1 SOL to the winning ticket. Anyone can press it." · primary "Settle the draw" (disabled until fulfilled) · `errors.settle` · safety-valve line (`.t-fine`) with "Cancel the draw" secondary button when `canCancel` |
| settled | Head "Draw finished" · your result in `.t-body`: "You hold the winning ticket #0067. 1 SOL was paid to your wallet." (red-ink amount) or "Ticket #0067 won. Not one of yours this time." · `.t-small` "A new draw will appear here when the operator opens one. There isn't one yet." · the carbon slip (§4.11) for this draw |
| cancelled | Head "Refunds are open" · explanation · a refund receipt ledger: one row per paid purchase ("#0031–#0040 · 10 tickets 0.10 SOL", "refunded" once done), "Free entry #0059 · not refundable", then a ruled total "Refundable to you 0.15 SOL" · primary "Go to your refunds" (anchor `#my-tickets`) · `.t-small` "Each refund is its own transaction. Anyone can send it, and it always pays the ticket's owner." No tickets sold: "Closed with no tickets" + explanation; no button |

### 5.6 `RevealSheet.tsx` → reveal overlay

This is the emotional peak. It is a full-viewport overlay below the strip (`top: var(--strip-h)`, z 85, `--paper` with grain, overflow auto), with `role="dialog" aria-modal="true" aria-labelledby="reveal-title"`. Focus moves to "Back to the draw" on open, Esc closes it, and body scroll is locked.

**Top bar** (72px desktop / 48 mobile): the wordmark mark plus "Draw Nº 3" (`.t-ui`) on the left; the text button "Back to the draw ✕" on the right (`closeSession`).

**Desktop layout `[248 | 40 | main]`:**

- **Side column:**
  - `.t-sec` h1 "Your 10 tickets";
  - `.t-small` "Draw Nº 3 · #0031–#0040";
  - receipt steps (2px ink rule on top). Each step is a 22px mark (ring, or an ink-filled circle with a stock check when done, or a busy dot), a bold Archivo 88% 16 title, a Newsreader 15 ink-2 detail and one proof link when it exists:
    Marks: a number in a dashed `--rule-2` circle (to do), an ink circle with a stock check (done), the bare 8px busy dot (in flight), a red-ink ring (failed). Never a radio ring.
    1. "Bought": "10 tickets · 0.10 SOL", **Purchase tx**. For a later reveal: "Bought earlier", **Entry**.
    2. "ORAO randomness": "waiting…" / "landed in 1.8 s", **Request**.
    3. "Revealed & paid": "in one transaction", **Reveal tx**.

    Step state comes from `stepStates(s)`, as today.
- **Main column:**
  1. **Status row:** `.t-voice` 18px ink-2 status on the left ("Waiting for the randomness to land…" → "Tearing off the covers, one at a time" → "All 10 revealed"). On the right, during the reveal only and at every width, the text button "Skip to total". **Nothing appears on the right after the end.** The duplicate "Total 0.08 SOL" is gone (must-fix).
  2. **Strip:**
     - up to 10 stubs per row at 100×212 (`width = min(100, (main − 0)/10)`, min 88), joined by perforations;
     - the strip row is 252px tall so winners can drop;
     - for more than 10 tickets, rows of 10 under horizontal perforations;
     - each stub shows a `.t-serial` 22px serial: ink, or red-ink once won (must-fix: loser serials are ink);
     - the cover (126px) has a "RESULT" tab;
     - after the lift: loser "no win" or winner amount + "SOL won" + WON stamp, plus the **roll line** `.t-key` ink-3 "roll 168 / 1000" at the stub's bottom (graft).
  3. **Roll key** (`.t-fine` ink-3, one line under the strip, visible once the randomness lands): "A roll under 200 wins: under 10 pays 0.20 SOL, under 50 pays 0.05, under 200 pays 0.01. Each roll is sha256(randomness + ticket number), scaled to 1000." The thresholds are the cumulative `d.iwTiers` odds.
  4. **Double rule** (red-plate shifted, §4.8).
  5. **Slot**, 224px tall, the same box during and after the reveal so nothing shifts:
     - *During:* the now-showing ticket (graft from Poster). It shows `.t-now` "#0036" in ink, then a 32px gap, then "+0.05 SOL" in red-ink for a win, or the ticket number in ink-3 with `.t-voice` 40px "no win" in ink-3 for a loss. Under it, `.t-ui` "Won so far **0.06 SOL**" (red-ink amount) as the running tally.
     - *After, with wins:* a grid `[total auto | detail 1fr | stamp 144px]`, gap 48.
       - Total column: `.t-voice` "You won", then the money-plate total `.t-total` "0.08 SOL" on its horizon, with the sun (§4.9).
       - Detail column: `.t-body` "**4 winning tickets:** #0034 +0.01, #0036 +0.05, #0037 +0.01 and #0040 +0.01. Paid to 5zXY…4wAD in the reveal transaction." plus **Payout transaction**. Every address and amount is `nowrap` (must-fix: no mid-string wrap).
       - Stamp column: the PAID stamp (reveal variant), in its own cell so it **can never overlap text** (must-fix).
     - *After, no wins:* `.t-voice` 40px "No instant wins this time." plus `.t-body` "All 10 tickets are still in the grand draw for 1 SOL." No sun and no PAID stamp.
  6. **Bottom row** `[receipt slip 300 | 48 | notes + actions]`. This fills the formerly dead paper (about y 760–900).
     - Receipt slip (§4.10).
     - Actions (only once the reveal has ended; the cell stays empty during it): primary **"Buy more tickets"** (`closeSession()` then `focusBuy()`, keeping the quantity; hidden if sales are no longer open), the text button "Back to Draw Nº 3", and the text button "Replay" (re-runs the animation; not shown under reduced motion).
     - Notes in `.t-fine` ink-3: "All 10 tickets stay in the grand draw for 1 SOL, drawn at sell-out or on Sun 4 Oct, 04:13 UTC." and "Each stamp's ink is printed from that ticket's randomness."

**Announcer** (graft from Studio):
- A visually hidden `<p aria-live="polite">` mirrors the slot.
- It speaks **winners only**, as each lands ("#0034 wins 0.01 SOL."), then the end ("Paid: 0.08 SOL to 5zXY…4wAD, in the reveal transaction."). Losers stay quiet.
- Each stub carries `aria-label` "#0034: won 0.01 SOL" / "#0035: no win" / "#0036: sealed".

**Mobile layout** (≤ 760px). Must-fix: the total and payout link stay in the first viewport.
1. Top bar 48.
2. h1 24px with the ticket range on the same line, right-aligned (the top bar already names the draw; it wraps under the h1 below 360px).
3. Steps as three compact 22px lines (20px marks, 13px text), then **one 44px row of their proof links** ("Purchase tx · Request · Reveal tx"), so no two tap targets overlap.
4. Status (15px).
5. **Strip as a 2-column list** (`repeat(2, minmax(0, 1fr))`, so it never overflows; at ≤ 380px the serial and the result share the top line and the roll line runs underneath): rows 56px tall, serial 18px with the roll line under it on the left, result on the right. Winners become **solid `--red-fill` slips** with stock text, rotated ±1.4° at scale 1.03, with no WON stamp. Losers show "no win" in italic ink-3.
6. Double rule.
7. Slot: now-showing at 64px during; after, "You won" 20px + `.t-total` 96px with a 224px sun and the PAID stamp in a 100px box top-right (no overlap with the figure).
8. Winners sentence + Payout transaction (by about y 765).
9. Receipt slip at full width.
10. Actions stacked at full width.
11. Notes.

**Other stages:**

| Stage | Display |
|---|---|
| `confirming` | All covers on; status "Confirming your purchase on devnet…" |
| `vrf` | Status "Waiting for the randomness to land…" |
| `revealing` | Status "Approve the reveal in your wallet. It pays any wins in the same transaction." |
| `failed` | `ErrorNote` with the human message, plus the text button "Try the reveal again" (`reveal(entry)`) when the entry is unrevealed and paid. Covers stay on |

**Data:**
- tiers, amounts, `vrfMs`, `buyTx`, `vrfRequest`, `revealTx` and `instantPaid` come from `RevealSession`, exactly as today. They are never decided in the client.
- Rolls come from `ticketX(session.randomness, ticket, d.iwDenominator)` (new optional field, §5.19).
- If a computed tier ever disagrees with the on-chain tier, show the on-chain result and add `.t-fine` red-ink "Recomputed roll disagrees with the chain; the chain result stands." This should never happen.
- `initialShown` (fixtures) still pauses the sequence.

### 5.7 `TicketStub.tsx`

- Rewrite `TicketStub` as the strip stub (§4.2): `<Stub serial state amount roll seedBytes size="row|reveal" />`.
- Rewrite `RevealStub` as the reveal stub, with the cover, the lift and the WON slam.
- Delete the split-flap result text ("······", "NO WIN") and the "Tier n · SOL" tag.

### 5.8 `MyTickets.tsx` ("Your tickets")

Section grid `[248 | 40 | 1fr]`, `id="my-tickets"`.

**Left column:**
- `.t-sec` "Your tickets";
- `.t-small` sub "All 16 are in the grand draw. Wallet 5zXY…4wAD.";
- a ledger (2px ink rule on top, `--rule` rows, label `.t-small` ink-2, value `.t-ledger`):
  - "Tickets" 16;
  - "Spent" 0.15 SOL;
  - "Won so far" **0.08 SOL** in red-ink.

  The data is `player.tickets`, `player.spent` and `player.won`, with a fallback to sums over `myEntries` as today.

**Right column:** one **roll** per entry, newest first. A roll is a caption line followed by a strip of stubs (102×132). The caption line uses `.t-ui` 16/800 for the kind, then Newsreader 16 ink-2 parts separated by 16px gaps:
- paid and revealed: "Bought 10" · "#0031–#0040" · "1 Oct, 14:02 UTC" · "won **0.08 SOL**" (red-ink) · **Payout tx** (when known);
- free: "Free entry" · "#0059" · "grand draw only";
- paid but not revealed: "Bought 5" · "#0097–#0101" · "sealed".

  It is followed by one `.t-small` line: "The reveal transaction wasn't sent after this purchase, so these results are still sealed. Anyone can send it; any wins are paid to you." Then the primary 44px button **"Reveal 5 tickets"** (`reveal(e)`).
- Rolls of more than 5 get a row each. The short rolls (5 or fewer, sealed or revealed) and the free entry share one row side by side (`flex`, gap 32) from 761px, before and after a reveal, and stack on mobile. The free entry only stands alone when there is no short roll.
- Mobile strips: stubs at 20% width, 108px tall, wrapping into rows of 5.

**Draw-state overlays on rolls:**
- settled and holds the winner: the winning stub gets a red-ink serial and a small DRAWN stamp, and the caption adds "**Ticket #0067 won the grand prize. 1 SOL was paid to you.**";
- settled otherwise: the caption adds "Not drawn this time.";
- cancelled: each paid roll gets the secondary button "Refund 0.10 SOL" (`refund(e)`, busy labels from `phase["refund:…"]`); once refunded, a REFUNDED stamp across the strip and "Refunded 0.10 SOL"; free rolls say "Free entry: nothing to refund.".

Errors: `ErrorNote` under the roll.

**Empty states:**
- no wallet: `.t-body` "Connect a wallet to see your tickets, instant results and refunds." + secondary "Connect wallet";
- no entries: "No tickets in this draw for 5zXY…4wAD yet. The next ticket is #0102.".

Removed: the three-up `dl` grid of identical cells, the dark stub tone, the per-entry `Verify` chip (the caption carries one proof link at most) and the coloured squares.

### 5.9 `EntriesBoard.tsx` ("Every entry")

Section grid. **Left column:** `.t-sec` "Every entry" and `.t-small` "Each row is an Entry account on devnet. 13 entries, 102 tickets."

**Right column:** a ruled ledger (not a box). It has a 2px ink rule on top and `--rule` rows 44px tall, in `.t-ui` 15 tabular. Column headers are `.t-ui` 14/600 ink-2 in **sentence case**: "Time (UTC)", "Wallet", "Tickets", "Instant result".

| Column | Value |
|---|---|
| Time | `clock()` today, else `shortDate()` |
| Wallet | `short(owner)`. Your rows add blue-ink italic "you" |
| Tickets | `ticketRange` + ink-3 "×10". Hidden at ≤ 760px; "×10" moves after the wallet |
| Instant result | "+0.05 SOL" (red-ink), "no win" (italic ink-3), "sealed" (italic ink-3), "free entry" (italic ink-2) |

- Each row is a link to its Entry on Solscan. On hover the row background is `--stock-2`; on focus the focus ring shows. There is no per-cell chip.
- Show the latest 12, then the text button "Show all 13 entries" / "Show the latest 12".

**States:**
- loading: rows with ink-3 "…" (no shimmer, no fake widths);
- error: "Can't load entries from devnet right now." + text button "Try again" (`refresh`);
- empty: "No tickets yet. The first entry gets ticket #0000.".

Removed: `.dep-row` and `bg-board`.

### 5.10 `PastDraws.tsx`

Section grid `id="past"`.

**Left column:**
- `.t-sec` "Past draws";
- `.t-small` "Draw Nº 2 is settled. Here is its ticket, and the arithmetic to check it.";
- a ledger: "Settled" 20 Sep / "Winning ticket" **#0006** (red-ink) / "Winner" 9goW…639n (link to the account) / "Prize" 1 SOL, paid;
- **Settlement transaction** proof link (`findSettleTx`). While searching, a busy dot; if not found, ink-3 "transaction not indexed".

**Right column**, for the most recent settled draw:
- **The old ticket:**
  - 512px, rotate −1.2°, radius 5, `--shadow-ticket`, grid `[body | stub 132]`;
  - body: head (`.t-ticket-head` 12px + serial "Nº 0002" in ink), "1 SOL" at 112px `.t-prize`, `.t-small` "Grand prize, paid to 9goW…639n", the DRAWN stamp, the three punched holes and the past barcode (§4.4) along the bottom;
  - stub: italic "Winning ticket", `.t-serial` 40px "#0006" in red-ink, and the PAID stamp (past variant).
- **The carbon slip** (§4.11) beside it at xl, under it below 1336px.

**Older draws** follow as a ruled list, one row each:
- "Draw Nº 1" (`.t-ui` 16/800) · "closed 14 Sep" · "No tickets sold; the prize went back to the operator.", or
- "Refunded 0.42 of 0.50 SOL" · **Draw account**.

A settled older row has the text button "Show its ticket", which expands the same old-ticket and slip pair inline.

Empty: `.t-body` "No finished draws yet. When one settles, its ticket, winner and randomness stay here, with the arithmetic to check it."

Removed: SplitFlap serials, `Verify` chips and the "Proof / Hide proof" ghost buttons.

### 5.11 `WinnerCard.tsx` (+ `Recompute`)

- `WinnerCard` becomes `SettledTicket` (the old ticket in §5.10). The hero settled state reuses its parts: the DRAWN stamp, the holes and the red serial.
- The randomness hex is shown inside the carbon slip, line 1: the first and last 8 hex characters in Archivo 85% 600 14, plus the text button "Show all 64 bytes", which expands the full hex in groups of 8 (each group `nowrap`, wrapping between groups).
- `Recompute` becomes the carbon slip. Logic is unchanged: `drawRoll`, `winningTicket` and `readOrao` from fairness.ts and the data layer. This is real SHA-256 in the browser; fixture Draw 2 yields #0006, verified.

| Line | Label | Value after the run |
|---|---|---|
| 1 | "ORAO randomness" | `c4f5d789…8aeadcfa` |
| 2 | "sha256(randomness + "draw"), first 8 bytes as a number" | `r = {res.r}` (digits grouped with thin spaces) |
| 3 | "r × 102 tickets ÷ 2⁶⁴" | `= ticket #0006` |
| 4 | "Winner stored on-chain" | `#0006` |
| result | — | "**Match.** This browser got #0006, the ticket the program paid." / "**No match.** On-chain says #0006; this browser got #00xx." |
| ORAO | — | "ORAO's request account holds the same randomness." / "…holds different randomness." (red-ink) / "ORAO's request account isn't readable right now; compare it on Solscan." |

### 5.12 `Rules.tsx` ("The back of the ticket")

`id="rules"`. The back of the ticket is one stock object: radius 6, `--shadow-ticket`, padding 48 (24 on mobile).

**Head:** `.t-sec` "The back of the ticket" in **sentence case** (must-fix: no uppercase tracked heading), `.t-small` "Six promises, and where to check each one.", then a double rule.

**One ledger table** (graft from Studio: a single "check every claim" ledger, not a 2×3 card grid):
- columns "Promise" (`.t-ui` 17/800, 32%), "How it holds" (`.t-small` ink-2, 46%) and "Check it" (one proof link, 22%), with `--rule` rows and 16px vertical padding;
- on mobile each row stacks: promise, explanation, then link;
- the six rows are in §6.

**House rules** (under a double rule): `[248 head "House rules" | 1fr list]` at ≥ 1024px, with the list in 2 columns. Items are `.t-small` ink-2, each with a 6px ink dot bullet. The items are in §6; one item holds the text button "Claim free entry" and another the BeGambleAware link.

**Terms hash line** (`.t-fine` ink-3): "The question and these terms are committed on-chain as {first 8…last 8 of `toHex(d.termsHash)`}." with the text button "Show full hash".

Removed:
- the 2×2 bordered guarantee grid with numbered mono indices;
- the mono odds table with its uppercase brass header (odds live in the lede and the stub);
- `eyebrow` headings.

### 5.13 `Footer.tsx`

A colophon, not a billboard:
- 1px ink rule on top, padding 48 / 48 + mobile bar space;
- at ≥ 1024px a grid `[248 | 40 | 1fr | auto]`:
  1. mark (20px) + "DrawSol" (`.t-ui` 16/800);
  2. `.t-small` ink-2 "A prize draw on Solana, built for the Colosseum hackathon. Devnet demo · play money. Every number on this page is read from Solana devnet; when it can't be read, it isn't shown.";
  3. links in `.t-link` ink (not blue: navigation, not proof):
     - "Program FwM5…nuUb" (the Solscan account; full ID in `title`);
     - "Source on GitHub";
     - "How it works".

Removed: the giant "DrawSol." wordmark and the brass logotype.

### 5.14 `StatePanels.tsx` (loading, error, no draw)

All three are paper objects in the hero's place, with no numbers.

- **`BoardSkeleton` (loading):**
  - the draw ticket shape (body and stub, perforation, notches) with head "DRAWSOL · GRAND DRAW" and "Nº ––––";
  - the prize area shows `.t-voice` "Reading the draw from devnet…";
  - the facts and barcode areas are empty double rules;
  - the stub is empty except its head "Buy tickets" in ink-3;
  - `aria-busy="true"`, no shimmer, no flap skeletons.
- **`RpcError`:**
  - a ticket-shaped blank with head "DRAWSOL · GRAND DRAW";
  - `.t-sec` "Can't reach devnet." and `.t-body` "We couldn't read the draw from the Solana devnet RPC, so we're not showing any numbers. Nothing you hold is affected.";
  - primary "Try again" (`refresh`); `role="alert"`;
  - no lamp, no stamp (stamps only mark on-chain facts).
- **`NoDraw`:**
  - an **unprinted ticket blank**: stock, a 1.5px dashed `--rule-2` outline instead of the shadow, head "DRAWSOL · GRAND DRAW" and "Nº ––––";
  - `.t-sec` "No draw is open yet." plus the reason sentence and "When one opens, its prize is locked in the vault before the first ticket sells, and this page shows it straight from the chain.";
  - "Every draw promises", a 4-row ruled list (no numbered mono indices):
    - "The prize is locked before the first ticket sells."
    - "It is drawn at sell-out or a fixed deadline."
    - "Nobody chooses the randomness (ORAO VRF)."
    - "Anyone can run and settle it."
  - the proof link "Program on Solscan" and the secondary button "Read the source".
- **Empty open draw:** not a separate panel. It is the open ticket with the zero copy in §5.3.

### 5.15 `WalletButton.tsx` + wallet-adapter modal

**Disconnected:** secondary button "Connect wallet" (44px tall; mobile 40px visual with a 44px hit area), or "Connecting…" while `connecting`.

**Connected:**
- a plain button, not a box: an 8px `--blue` dot (you), the address `.t-ui` 15/700 tabular, and on md and up the balance `.t-ui` 15 ink-2 "4.213 SOL";
- a 2px ink underline 6px below; min-height 44;
- `aria-expanded`; on hover the underline turns blue.

**Menu:**
- a stock slip (radius 3, `--shadow-slip`, `grain-stock`), 240px wide, opening 8px below and right-aligned;
- items are 44px rows with `--rule` separators:
  - italic "Devnet balance" + `.t-ui` "4.2137 SOL";
  - "Your tickets (16)" → `#my-tickets`;
  - "View wallet on Solscan" (proof link style);
  - "Copy address" → "Copied" for 2s;
  - "Change wallet";
  - "Disconnect" in ink-2;
- closes on outside click and Esc; arrow keys move between items.

**Wallet-adapter modal** (`globals.css` overrides on `@solana/wallet-adapter-react-ui` classes):

| Selector | Style |
|---|---|
| `.wallet-adapter-modal-overlay` | `background: rgba(27,24,20,.45)` |
| `.wallet-adapter-modal-container` / `-wrapper` | `--stock` + grain, radius 6, `--shadow-ticket`, max-width 400, padding 32 24 24, `font-family: var(--grot)`, ink text, no border |
| `.wallet-adapter-modal-title` | Archivo 112% 850 24/1.2, sentence case "Connect a wallet", left-aligned, ink, margin 0 0 16 |
| `.wallet-adapter-modal-button-close` | A 44px punch-style circle (paper fill, ink ring) top-right; the icon is ink |
| `.wallet-adapter-modal-list .wallet-adapter-button` | 56px rows, transparent, `.t-ui` 17/600 ink, `--rule` between rows, 28px wallet icon, hover `--stock-2`; "Detected" in italic Newsreader 15 ink-2 |
| `.wallet-adapter-modal-list-more` | Text button style, blue-ink |
| `.wallet-adapter-button-trigger` (if used anywhere) | Primary button style |

### 5.16 `bits.tsx`

| Old | New |
|---|---|
| `Verify` ("verify ↗" chip) | **`ProofLink`** `{ account?, tx?, children }`. Its children are the phrase. It renders the proof-link style (§4.13). Every call site must pass a phrase |
| `Addr` | Unchanged API. Archivo 88% tabular, `nowrap`, ink. A link only where it is the proof (winner in Past draws, wallet menu) |
| `OnAirLamp` | **Delete** |
| `SectionHead` (with "02" index) | **`SectionGrid`** `{ id, title, sub, aside?, children }`: the `[248 | 40 | 1fr]` grid, title `.t-sec`, sub `.t-small` |
| `Stat` | **Delete**. Labels are italic `.t-label` or sentences |
| `Check` | Keep: 12px check for the receipt steps and the recompute "Match." |
| `Spinner` | **Replace** with `Busy`, the 8px ink dot (§4.13). No spinning circles |
| `ErrorNote` | Restyle per §4.13; API unchanged |

### 5.17 `WalletProvider.tsx`

Unchanged. Keep importing `@solana/wallet-adapter-react-ui/styles.css`, which is overridden in `globals.css`.

### 5.18 Fixtures (`app/src/fixtures/*`, fixture builds only)

1. **Badge** (`FixtureProvider`):
   - move it into the strip's right end, z 101, height `var(--strip-h)`;
   - text "Fixture data · ?fx=open" (mobile "Fixture · open") in Archivo 88% 700 12px, stock on `--ink` with no radius;
   - it must never cover page content (fixes the baseline's hazard tape);
   - at 360px and below it shrinks to "Fx" plus a 2–3 letter code ("Fx rd"), so it never covers the honesty marker.
2. **`FxState.entryRandomness`:** expose `FxWorld.entryRandomness` so the provider can reveal any entry.
3. **`reveal(e)`** (fixes "Reveal replays #0031–#0040"): open a session for **that** entry:
   - `stage "revealed"`, `vrfRequest e.vrfRequest`, `vrfMs 1800`;
   - `revealTx fxSig("reveal-" + e.seq)`;
   - `tiers = rollEntry(rand, e.firstTicket, e.count, d.iwDenominator, d.iwTiers)`, `instantPaid` summed from those tiers;
   - `randomness = rand`, `tierAmounts`.

   For the fixture's sealed entry (#0097–#0101) this yields rolls 209, 153, 337, 722 and 763, so **#0098 wins 0.01 SOL**. That is computed by fairness.ts, not invented.
4. **Scenarios** (added to `Scenario` and `scenario()`):

   | Scenario | Contents |
   |---|---|
   | `confirm` | `open` data. Because the `?fx` value is folded at build time, `page.tsx` (in its existing `FIXTURES` gate) passes `initialStep="confirm"` to `BuyProvider` when `fx === "confirm"`. 18+ is not remembered |
   | `reveal` | As today, but `initialShown: 6`, so the still frame pauses on #0036, a 0.05 win: the loud moment. Also set `randomness` |
   | `reveal-done` | Same session with `initialShown: 10` |
   | `reveal-5` | The session from item 3 for the #0097–#0101 entry |

5. **Timeline:** a scenario that moves `closesAt` into the past (due, drawing, settled, cancelled, and past Draw Nº 2) slides the whole purchase history, and the draw's `createdAt`, back so the newest entry lands a minute before the close (`fitBeforeClose`). No ticket is ever shown bought after the close or the payout.
6. The fixture `buy`, `claimFree`, `runDraw`, `settle`, `cancel` and `refund` keep failing with "Fixture build — nothing is sent to devnet.", shown in an `ErrorNote`.

### 5.19 Data-layer touch points (the only allowed changes)

| File | Change | Why |
|---|---|---|
| `hooks/context.ts` | `RevealSession.randomness?: Uint8Array` | Rolls and WON stamp seeds on the reveal |
| `hooks/LiveProvider.tsx` | In `revealFlow`, keep the value returned by `waitForRandomness(...)` and `patchSession(entry.address, { randomness })` | Same |
| `lib/format.ts` | `utcLabel` → "Sun 4 Oct, 04:13 UTC" (comma) | Copy deck |
| `lib/print.ts` (new) | `stampPrint(bytes, baseAngle)`, `sunDots(width)` and `barcodeMarks(...)`, ported from `generate.mjs` | Print kit |
| `fixtures/*` | §5.18 | Shots and the reveal fix |

Nothing else in `hooks/`, `lib/` (chain, tx, fairness, errors, derive, orao, pdas, config) or `idl/` changes. `app/src/idl` is never edited.

---

## 6. Copy deck

**Voice:** a good ticket clerk. Plain, exact, a little dry, warm. Facts first, short sentences.

Rules for all copy:

- Sentence case everywhere. UPPERCASE appears only on printed objects: ticket head, stamps, the cover tab and the specimen.
- Amounts are figures plus a no-break space plus SOL: "0.10 SOL". There is no USD. If a live price is ever added, it is shown only as "≈ $X" and hidden when unavailable.
- Tickets: "#0034". Ranges: "#0031–#0040" (en dash). Draws: "Draw Nº 3" (U+2116).
- Times: "Sun 4 Oct, 04:13 UTC"; local time as "That's Sun 4 Oct, 06:13 your time."
- Durations in prose: "2 d 5 h 31 min". On figures the units are italic.
- "≈" only for estimates. "About 2 s" for the reveal.
- "We" means only the operator ("if we disappear"). Speak to "you".
- Every odds figure for instant wins sits next to "demo odds, boosted".
- When something can't be read, say so and show no number.
- Never use: "verify", "trustless", "seamless", "unlock", "experience", "revolutionary", "web3", "jackpot", "guaranteed win", "don't miss out", exclamation marks or emoji.

### Global

| Key | Copy |
|---|---|
| Strip | **Devnet demo · play money**  Tickets and prizes have no cash value. |
| Wordmark | DrawSol \| *Ticket office* |
| Nav | Your tickets · Past draws · How it works |
| Wallet | Connect wallet · Connecting… · 5zXY…4wAD 4.213 SOL |
| Wallet menu | *Devnet balance* 4.2137 SOL · Your tickets (16) · View wallet on Solscan · Copy address / Copied · Change wallet · Disconnect |
| Wallet modal title | Connect a wallet |
| Fixture badge | Fixture data · ?fx=open |

### Lede

| State | h1 | Sentence |
|---|---|---|
| open | Draw Nº 3 is open. | One prize of 1 SOL, locked away before the first ticket sold. 150 tickets at 0.01 SOL, and every ticket gets an instant result. |
| due | Draw Nº 3 has closed. | Sales are over: {the deadline passed at Sun 4 Oct, 04:13 UTC \| every ticket sold}. The draw is due, and anyone can run it. |
| drawing | Draw Nº 3 is being drawn. | Randomness has been requested from ORAO. Once it lands, anyone can settle the draw and pay the winner. |
| settled | Draw Nº 3 is settled. | Ticket #0067 won 1 SOL, paid to 5ggm…7nnQ on 2 Oct. |
| cancelled | Draw Nº 3 was cancelled. | The randomness never arrived in time, so every paid ticket can be refunded in full. |

| Key | Copy |
|---|---|
| Odds head | Instant wins  *demo odds, boosted* |
| Odds rows | 0.20 SOL — 1 in 100 · 0.05 SOL — 1 in 25 · 0.01 SOL — 1 in 6.7 |
| Odds sum | *Any instant win* — **1 in 5** |
| Caption | Decided by ORAO randomness about 2 s after you pay. Wins are paid in the reveal transaction. |

### Draw ticket

| Key | Copy |
|---|---|
| Head | DRAWSOL · GRAND DRAW  Nº 0003 |
| Prize label | *Grand prize* · settled: *Grand prize, paid* · cancelled: *Prize, not awarded* |
| Proofline (open, due, drawing) | **Locked in the program vault before the first ticket sold.** The vault holds 3.61 SOL: the prize, the instant-win reserve and sales so far. [Check the vault on Solscan] |
| Proofline (settled) | **Paid to 5ggm…7nnQ on 2 Oct, 08:12 UTC.** [Prize transaction] |
| Proofline (cancelled) | **This draw was cancelled before a winner was drawn.** Every paid ticket can claim a full refund from the vault, which holds 3.61 SOL. [Check the vault on Solscan] |
| Time (≥ 1 h) | 2 *d* 5 *h* 31 *min left* |
| Time (< 1 h) | 31 *min* 08 *s left* |
| Close | Closes Sun 4 Oct, 04:13 UTC |
| Close note | or when the last ticket sells, whichever comes first. That's Sun 4 Oct, 06:13 your time. |
| Sold | 100 *of 150 sold* |
| Sold note | 50 left, plus 2 free entries · zero: The first ticket is #0000. |
| Barcode key | #0000 · *yours* · 50 left · sell-out |
| Specimen | DEVNET SPECIMEN · PLAY MONEY · NO CASH VALUE |
| due facts | *Closed* Sun 4 Oct, 04:13 UTC · or *Sold out* · note: 102 tickets in the draw |
| drawing fact | *Winning ticket* #???? — Waiting for ORAO, usually a few seconds. → #0067 — Computed from ORAO's randomness. Final once settled. |
| settled facts | *Winning ticket* #0067 — out of 102 tickets · *Paid to* 5ggm…7nnQ |
| cancelled facts | *Refunded so far* 0.37 *of* 1.00 SOL · *Your refund* 0.15 SOL / Connect a wallet to check |
| Stamp labels (aria) | Stamped: prize locked in the vault · Stamped: sales closed · Stamped: drawn 20 September · Stamped: paid · Stamped: won 0.05 SOL · Stamped: cancelled, refunds open · Stamped: refunded |

### Stub and buy

| Key | Copy |
|---|---|
| Head | Buy tickets  **0.01 SOL** each, flat |
| Quantity | 10 *tickets* / 1 *ticket* · aria: One fewer ticket / One more ticket · Quick picks |
| Total | 10 × 0.01 SOL — **0.10 SOL** |
| Fee (summary) | + ≈0.003 SOL network & randomness fee |
| Fee (detail) | ORAO randomness fee 0.0005 SOL, rent for your ticket record 0.0023 SOL{, and a one-time player record 0.0015 SOL on your first purchase}. The Solana network fee is a fraction of that. Your wallet shows the exact total before you sign. |
| Fee (unknown) | + network & randomness fee, shown in your wallet before you sign |
| Buy | Buy 10 tickets · Connect wallet to buy · Wallet limit reached (50 of 50) · Not enough devnet SOL |
| Low balance help | You have 0.0123 SOL. Get free devnet SOL from the [Solana faucet]. |
| After button | Results land about 2 s after you pay. |
| Ledger | Grand-prize odds, per ticket — 1 in 102 now · You hold — 16 [see them] · You can still buy — 34 · zero tickets: Grand-prize odds — No tickets yet |
| Guest ledger | Connect a wallet to see your tickets. |
| Limits | 25 per purchase, 50 per wallet. |
| Free entry | Free entry: one per wallet, grand draw only. 13 of 15 left. [Claim free entry] · Free entry claimed: #0059. · All 15 free entries are claimed. |
| Mobile bar | − 10 + · Buy 10 · 0.10 SOL · Connect wallet · Limit reached · Get devnet SOL |

### Confirm

| Key | Copy |
|---|---|
| Head | Check and pay  [Change quantity] |
| Summary | 10 tickets × 0.01 SOL — **0.10 SOL** |
| Fee | + ≈0.003 SOL network & randomness fee |
| Numbering | Numbered from #0102, unless someone buys first. |
| Question | Which planet is known as the Red Planet? |
| Question sub | *One general-knowledge question, then you pay.* |
| Options | Mars · Venus · Jupiter (shuffled) |
| Feedback | Correct. / Not quite. Have another go. |
| 18+ (first time) | I'm 18 or older. *Asked once, remembered on this device.* |
| 18+ (remembered) | **18+** confirmed on this device · [Undo] |
| Pay | Pay 0.10 SOL · Checking with the program… · Approve in your wallet… · Confirming on devnet… |
| Disabled hint | Answer the question and confirm you're 18+ to pay. |
| Fine print | Then sign in your wallet. About 2 s later it asks once more, to reveal your results and pay any wins. |

### Stub in other states

| Key | Copy |
|---|---|
| due | **Run the draw** · Sales closed {Sun 4 Oct, 04:13 UTC \| when the last ticket sold}. Anyone can run the draw: it asks ORAO for randomness nobody can choose, us included. · [Run the draw] · + ≈0.0005 SOL randomness fee, paid by you · busy: Approve in your wallet… / Confirming… |
| due, no tickets | **Close the draw** · No tickets were sold. Closing returns the prize and reserve to the operator. Anyone can do it. · [Close the draw] |
| drawing | **Settle the draw** · ✓ Randomness requested from ORAO for 102 tickets [Request] · ✓ Randomness landed / Waiting for ORAO, usually a few seconds · Settle pays 1 SOL to the winning ticket. Anyone can press it. · [Settle the draw] |
| drawing safety | If randomness hasn't arrived by Tue 6 Oct, 04:13 UTC, anyone can cancel and every paid ticket is refunded. · after: Randomness never arrived within 48 h. Anyone can cancel now; every paid ticket becomes refundable. [Cancel the draw] |
| settled | **Draw finished** · You hold the winning ticket #0067. **1 SOL** was paid to your wallet. / Ticket #0067 won. Not one of yours this time. · A new draw will appear here when the operator opens one. There isn't one yet. |
| cancelled | **Refunds are open** · The randomness never arrived within 48 h of closing, so the draw was cancelled. Every paid ticket can be refunded in full. There's no deadline. · *Your refund* 0.15 SOL · [Go to your refunds] |
| cancelled, empty | **Closed with no tickets** · Nobody bought a ticket, so the prize and reserve went back to the operator. |
| Your entry (due, drawing) | You hold 16 tickets · won **0.08 SOL** instantly. |

### Reveal

| Key | Copy |
|---|---|
| Top bar | Draw Nº 3 · [Back to the draw ✕] |
| Title | Your 10 tickets / Your ticket · Draw Nº 3 · #0031–#0040 |
| Steps | **Bought** 10 tickets · 0.10 SOL [Purchase tx] / Bought earlier [Entry] · **ORAO randomness** waiting… / landed in 1.8 s [Request] · **Revealed & paid** in one transaction [Reveal tx] |
| Status | Confirming your purchase on devnet… · Waiting for the randomness to land… · Approve the reveal in your wallet. It pays any wins in the same transaction. · Tearing off the covers, one at a time · All 10 revealed |
| Skip | Skip to total |
| Cover tab | RESULT · sealed (Your tickets): SEALED |
| Stub | no win · 0.05 *SOL won* · roll 27 / 1000 |
| Roll key | A roll under 200 wins: under 10 pays 0.20 SOL, under 50 pays 0.05, under 200 pays 0.01. Each roll is sha256(randomness + ticket number), scaled to 1000. |
| Now showing | #0036  +0.05 SOL · #0035  *no win* · Won so far **0.06 SOL** |
| Announcer (sr) | #0034 wins 0.01 SOL. … Paid: 0.08 SOL to 5zXY…4wAD, in the reveal transaction. |
| End, wins | *You won* **0.08 SOL** · **4 winning tickets:** #0034 +0.01, #0036 +0.05, #0037 +0.01 and #0040 +0.01. Paid to 5zXY…4wAD in the reveal transaction. [Payout transaction] |
| End, no wins | *No instant wins this time.* All 10 tickets are still in the grand draw for 1 SOL. |
| PAID stamp | DRAW Nº 3 · PAID · SAME TX |
| Receipt | *Your receipt* |
| Actions | [Buy more tickets] · Back to Draw Nº 3 · Replay |
| Notes | All 10 tickets stay in the grand draw for 1 SOL, drawn at sell-out or on Sun 4 Oct, 04:13 UTC. · Each stamp's ink is printed from that ticket's randomness. |
| Failure | **Didn't go through.** {human message} [Try the reveal again] · VRF timeout: ORAO hasn't delivered randomness yet. Your tickets are safe; reveal them later from Your tickets. |

### Your tickets / Every entry / Past draws

| Key | Copy |
|---|---|
| Your tickets | **Your tickets** · All 16 are in the grand draw. Wallet 5zXY…4wAD. · Tickets 16 · Spent 0.15 SOL · Won so far **0.08 SOL** |
| Roll captions | **Bought 10** #0031–#0040 · 1 Oct, 14:02 UTC · won 0.08 SOL [Payout tx] · **Free entry** #0059 · grand draw only · **Bought 5** #0097–#0101 · sealed |
| Sealed explanation | The reveal transaction wasn't sent after this purchase, so these results are still sealed. Anyone can send it; any wins are paid to you. [Reveal 5 tickets] |
| Settled | **Ticket #0067 won the grand prize. 1 SOL was paid to you.** / Not drawn this time. |
| Cancelled | [Refund 0.10 SOL] → Refunded 0.10 SOL · Free entry: nothing to refund. |
| Empty | Connect a wallet to see your tickets, instant results and refunds. [Connect wallet] · No tickets in this draw for 5zXY…4wAD yet. The next ticket is #0102. |
| Every entry | **Every entry** · Each row is an Entry account on devnet. 13 entries, 102 tickets. · Time (UTC) · Wallet · Tickets · Instant result · *you* · no win · sealed · free entry · Show all 13 entries / Show the latest 12 · No tickets yet. The first entry gets ticket #0000. · Can't load entries from devnet right now. [Try again] |
| Past draws | **Past draws** · Draw Nº 2 is settled. Here is its ticket, and the arithmetic to check it. · Settled 20 Sep · Winning ticket #0006 · Winner 9goW…639n · Prize 1 SOL, paid · [Settlement transaction] · transaction not indexed |
| Old ticket | DRAWSOL · GRAND DRAW  Nº 0002 · 1 SOL · Grand prize, paid to 9goW…639n · *Winning ticket* #0006 |
| Older rows | Draw Nº 1 · closed 14 Sep · No tickets sold; the prize went back to the operator. / Refunded 0.42 of 0.50 SOL · [Show its ticket] |
| Past empty | No finished draws yet. When one settles, its ticket, winner and randomness stay here, with the arithmetic to check it. |
| Carbon slip | *Carbon copy* · **Recompute Draw Nº 2 in this browser** · ORAO randomness — c4f5d789…8aeadcfa [Show all 64 bytes] · sha256(randomness + "draw"), first 8 bytes as a number — r = … · r × 102 tickets ÷ 2⁶⁴ — = ticket #0006 · Winner stored on-chain — #0006 · [Recompute] / [Run it again] · **Match.** This browser got #0006, the ticket the program paid. · ORAO's request account holds the same randomness. · [ORAO request on Solscan] |

### The back of the ticket

| Promise | How it holds | Check it |
|---|---|---|
| The prize is locked before the first ticket sells. | `create_draw` moves the 1 SOL prize and the 2 SOL instant-win reserve into the program's vault in the same instruction that opens the draw. Only the winning ticket can collect the prize; if the draw is cancelled, every paid ticket can claim a full refund. | [Vault account] |
| Fixed tickets, fixed close. | 150 tickets, closing Sun 4 Oct, 04:13 UTC. Both are written into the draw account and can't change. The draw happens at sell-out or the deadline, whichever comes first. | [Draw account] |
| Nobody chooses the randomness. | Every result comes from ORAO VRF. The request seed is fixed by program state, so the buyer, the operator and whoever runs the draw get no say, us included. | [ORAO VRF program] |
| An instant result on every ticket. | About 2 s after you buy, the reveal transaction works out each ticket's result and pays any win from the reserve in that same transaction. | [Your last reveal] (when known), else [ORAO VRF program] |
| Anyone can run and settle the draw. | Running, settling, revealing and refunding are open to any wallet. If we disappear, anyone can finish the job and the winner still gets paid. If the randomness never arrives within 48 h, refunds open. | [Program] · [Source] |
| Every result can be recomputed. | Instant results and the winning ticket follow from the randomness by plain arithmetic, so this page can redo it in your browser. | [Recompute Draw Nº 2] (anchor) |

| House rules (list) |
|---|
| 18+ only. You confirm it once on each device. |
| One general-knowledge question before each purchase. It's asked here in the app, not checked on-chain. |
| Up to 25 tickets per purchase and 50 per wallet per draw, enforced on-chain. |
| One free entry per wallet, grand draw only (13 of 15 left). [Claim free entry] |
| Instant-win odds are boosted for this demo. Grand-prize odds are 1 in 102 per ticket right now, and never worse than 1 in 165. |
| Priced and paid in SOL. Nothing is converted. |
| Devnet only: play money with no cash value. |
| If it stops being fun, [BeGambleAware] can help. |

### Footer and state panels

| Key | Copy |
|---|---|
| Footer | DrawSol · A prize draw on Solana, built for the Colosseum hackathon. Devnet demo · play money. Every number on this page is read from Solana devnet; when it can't be read, it isn't shown. · Program FwM5…nuUb · Source on GitHub · How it works |
| Loading | *Reading the draw from devnet…* |
| Error | **Can't reach devnet.** We couldn't read the draw from the Solana devnet RPC, so we're not showing any numbers. Nothing you hold is affected. [Try again] |
| No draw | **No draw is open yet.** {The DrawSol program isn't deployed on devnet yet. \| The program is deployed but not set up yet. \| The program is live, but no draw has been opened yet.} When one opens, its prize is locked in the vault before the first ticket sells, and this page shows it straight from the chain. · *Every draw promises* … · [Program on Solscan] · [Read the source] |
| ErrorNote lead | Didn't go through. |

---

## 7. Banned (instant fail): rules

Each banned item below has its rule. Lint by grep and by eye before every review.

1. **No purple, violet or Solana gradient.** No hue between 250° and 320° anywhere; the only blue is `#2448B0` / `#1F3F9E` (hue 225°). No `linear-gradient` with more than one hue.
2. **No glow blobs, radial "light" or coloured shadows.** Shadows come only from §2.7.
3. **No floating particles, confetti or decorative animation.** Motion only per §2.8.
4. **No glassmorphism.** No `backdrop-filter`, no translucent panels.
5. **No gradient text.** No `background-clip: text`.
6. **No shimmer** on skeletons or idle elements. Nothing loops except the busy dot during a real request.
7. **No emoji icons.** Icons are limited to: check, ↗ arrow (mask), chevron, minus, plus, ✕. Grep for emoji code points.
8. **Nothing centred** as a layout default. Everything is flush-left on the 248-column grid. The only centred things are stamp text, the stub quantity figure, the mobile sheet handle and the punch glyphs.
9. **No uniform grids of identical bordered or rounded cards,** and no 2×2 or 2×3 "feature" grid. Lists are ledgers (ruled rows); objects are paper. Stub strips are perforated, joined objects, not card grids.
10. **No monospace, and no UPPERCASE letter-spaced micro-labels above values.** Labels are italic Newsreader (`.t-label`) or written into sentences. Uppercase exists only in `.t-ticket-head`, `.t-specimen`, stamps and the cover tab.
11. **No decorative corner brackets.**
12. **No pills or badges.** Radius ≤ 6 except circles that are physical (punch, stamp, notch, pen loop).
13. **No "verify ↗" chips** and no link on every fact. At most one proof link on the ticket face, one per ledger row, one per receipt step and one payout link at the reveal end. The word "verify" never appears.
14. **No generic Inter / Plus Jakarta / system-UI look.** Only Archivo (at defined widths, never 100%) and Newsreader.
15. **No generic copy:** "Seamless", "Unlock", "Experience", "Revolutionary", "Next-gen", "Web3", exclamation marks.
16. **No stock 3D coins, trophies, illustrations or images.** Every graphic is drawn in SVG or CSS from this kit.
17. **No dark mode, and no slate-900 + one-accent dashboard.** The page is paper. `color-scheme: light`.
18. **Colour law** (§2.1): red only for money moved or state changed; blue only for check, choice or the honesty marker. A red losing serial or a blue heading fails review.
19. **No invented data.** No activity feed, viewer counts, fake winners, fallback numbers or USD. Fixture data exists only in fixture builds.

---

## 8. Acceptance criteria

Check with the fixture build (`NEXT_PUBLIC_FIXTURES=1`) and the extended shoot script (§8.7), then with the production build.

### 8.1 First viewport, desktop 1440×900 (`?fx=open`)

The bottom of the bounding rect of each of these is ≤ 900, without scrolling:

- [ ] The prize figure "1 SOL".
- [ ] The LOCKED stamp. It does not intersect the prize figure.
- [ ] Exactly **one** proof link on the ticket face, "Check the vault on Solscan", with `href` containing `solscan.io/account/EiPverAxDWsGF6jzcEwA8r97NSMqhU6mSuQnPN1SFPPD?cluster=devnet` (the real vault PDA of fixture Draw 3).
- [ ] The countdown "2 d 5 h 31 min left" and the absolute "Sun 4 Oct, 04:13 UTC".
- [ ] "100 of 150 sold" and the barcode (152 slots, 16 raised blue bars, 2 punched free entries).
- [ ] The quantity control (−, 10, +), the quick picks, the total "0.10 SOL", the one-line fee "+ ≈0.003 SOL network & randomness fee", and an **enabled** "Buy 10 tickets" button.
- [ ] The devnet strip is visible.
- [ ] No horizontal scroll at 1440, 1280, 1024, 768, 390 and 320.

### 8.2 First viewport, mobile 390×844 (`?fx=open`)

- [ ] Vertical order of the top edges: prize < time left < close time < lock line < sold. The prize and time are the first two facts after the masthead.
- [ ] The LOCKED stamp's box intersects neither the prize figure nor the countdown, with ≥ 16px clearance to the countdown.
- [ ] The sticky bar is visible with − and + at **≥ 48×48** and "Buy 10 · 0.10 SOL" at ≥ 48px tall.
- [ ] Exactly **one** quantity control on the page: the in-flow stub has no stepper, picks or Buy button.
- [ ] The devnet strip stays visible while scrolling and while the confirm sheet is open.
- [ ] The "Fixture" badge (fixture builds) sits inside the strip and covers no content.

### 8.3 Purchase flow

- [ ] Choose a quantity, press Buy, and the confirm step appears in place (desktop) or as a sheet (mobile). There are no other steps before Pay.
- [ ] Exactly one plain question with three options (Mars, Venus, Jupiter, shuffled). It is not a riddle.
- [ ] First time: the 18+ checkbox with "Asked once, remembered on this device.". After paying once, or with `localStorage['drawsol.adult']="yes"`: "18+ confirmed on this device · Undo" and no checkbox. Undo restores the checkbox.
- [ ] Storage throwing (private mode) still renders and works; it just asks every time.
- [ ] The fee is one line, with detail behind a disclosure. Pay is disabled until the answer is right and 18+ is satisfied.
- [ ] All hit targets are ≥ 44×44 (picks, punches, text buttons, wallet, radio rows, checkbox row).
- [ ] Guest, low-balance and wallet-cap states show the copy in §6 in both the stub and the bar.

### 8.4 Reveal

- [ ] Tickets reveal one by one. Losers stay in place with a quiet italic "no win" and an **ink** serial. Winners drop out of the strip, get a WON stamp slam, red-ink serial and amount, and a line in the aria-live announcer.
- [ ] Every revealed stub shows its roll ("roll 168 / 1000"), and the roll key is shown once.
- [ ] It ends on a clear total ("You won 0.08 SOL", `.t-total`) with the money plate, the sun clear of the glyphs, the PAID stamp in its own cell (overlapping no text), and **one** "Payout transaction" link.
- [ ] No duplicate total remains at the top right.
- [ ] The receipt slip fills the space below the total.
- [ ] "Buy more tickets" is the primary action.
- [ ] Mobile 390×844 (`?fx=reveal-done`): the total and the payout link are inside the first viewport; winning rows are solid red slips; no address wraps mid-string.
- [ ] "Reveal 5 tickets" under #0097–#0101 opens a 5-ticket reveal of **that** entry (`?fx=reveal-5` shows #0098 +0.01).
- [ ] Reduced motion: the final state appears as soon as the tiers are known; no transforms.

### 8.5 Proof and honesty

- [ ] One consolidated proof area: the back of the ticket ledger plus the carbon slip. No "verify" text anywhere (`grep -ri "verify" app/src/components` returns nothing user-facing).
- [ ] Recompute really runs `fairness.ts` (SHA-256) in the browser and shows "Match." for fixture Draw 2 (#0006).
- [ ] Every Solscan link targets a real account or transaction (vault PDA, draw PDA, entry, ORAO request, tx signature). There are no generic devnet roots.
- [ ] The countdown comes from `d.closesAt` and `now`, never a snapshot.
- [ ] "demo odds, boosted" is next to every instant-odds figure. No USD anywhere.
- [ ] The live provider shows no number it did not read from chain. Loading and error states show no numbers.

### 8.6 Craft and accessibility

- [ ] Fonts verified with `document.fonts.check` (§2.2) before every screenshot. Only Archivo and Newsreader load. No requests to fonts.googleapis.com or fontshare.
- [ ] axe (or equivalent) reports zero contrast violations on `open`, `confirm`, `reveal-done`, `settled` and `cancelled`, on desktop and mobile.
- [ ] Spacing values come only from §2.4. Text is never smaller than 13px, except the two `aria-hidden` print details (specimen 11px, microtext 4px) and the printed ticket head, which is 12px uppercase Archivo 125% on phones (§2.3).
- [ ] Tabular figures on every changing number; equal advance widths are checked on the countdown.
- [ ] Every stamp has `role="img"` and an `aria-label`, and its own filter id. No two stamps on a page share a seed.
- [ ] Focus is visible (2px blue ring) on every interactive element. The sheet and the reveal trap focus and restore it on close. Esc closes them.
- [ ] `prefers-reduced-motion: reduce` removes every transform and transition (§2.8).
- [ ] Every banned rule in §7 passes.

### 8.7 Build and shots

- [ ] `cd app && NEXT_PUBLIC_FIXTURES=1 npx next build` passes.
- [ ] `npx next build` (production) passes.
- [ ] `grep -r "FIXTURE" app/out` and `grep -rE "fixture-rand|fxRand" app/out` return nothing.
- [ ] Extend the existing `shoot.cjs` (a copy) with:
  - scenarios `confirm`, `reveal-done` and `reveal-5`;
  - interaction shots: desktop confirm (click "Buy 10 tickets", choose Mars, tick 18+); `confirm-remembered` (`addInitScript` sets `drawsol.adult`); mobile sheet (tap the bar's Buy); reveal mid (`?fx=reveal`).
  - Every shot waits for `document.fonts.ready` plus the check, logs horizontal overflow, and is viewed before sign-off.

---

## 9. Assets (`app/src/design-assets/`)

| File | What | How the app uses it |
|---|---|---|
| `mark.svg` | **New** mark: notched ticket, knocked-out barcode, red drawn bar breaking the top edge | Inline SVG in `Mark.tsx`; copy it to `app/src/app/icon.svg` for the favicon |
| `stamp-locked.svg` | LOCKED IN THE VAULT (from the prototype) | Drawing source for `Stamp kind="locked"` (inline; per-instance filter) |
| `stamp-closed.svg` | **New** SALES CLOSED | `Stamp kind="closed"` |
| `stamp-drawn.svg` | DRAWN date stamp (from the prototype) | `Stamp kind="drawn"` |
| `stamp-paid.svg` | Round PAID with arc text (from the prototype) | `Stamp kind="paid"` (two text variants) |
| `stamp-won.svg` | Small round WON (from the prototype) | `Stamp kind="won"` |
| `stamp-cancelled.svg` | **New** CANCELLED / REFUNDS OPEN | `Stamp kind="cancelled"` |
| `stamp-refunded.svg` | **New** REFUNDED | `Stamp kind="refunded"` |
| `pen-circle.svg` | Ballpoint loop (from the prototype) | Inline in quick picks |
| `grain-paper.svg` | Counter grain, capped strength | `body` background via `url(../design-assets/grain-paper.svg)` in `globals.css` |
| `grain-stock.svg` | Card-stock fibre, capped strength | Background of `.ticket`, `.stub`, `.slip`, `.sheet`, `.buybar` |
| `sun-440.svg`, `sun-280.svg` | **Regenerated** halftone sun on an integer 45° lattice (replaces the prototype's moiré-prone `sun.svg`) | Reference render. `Sun.tsx` generates the same dots inline (via `sunDots`) inside the total's SVG so it can be masked |
| `barcode-open.svg`, `barcode-open-mobile.svg`, `barcode-past.svg` | Reference renders of the meter from fixture data | Visual target for `Barcode.tsx` |
| `receipt-0031-0040.svg` | Reference receipt bars for the fixture reveal | Visual target for `ReceiptBars.tsx` |
| `generate.mjs` | Reference algorithms: `sunDots`, `barcode`, `receipt`, `stampPrint` (run with node, no deps) | Port to `lib/print.ts`. Not bundled or type-checked by Next |

The SVG stamps carry their text as `<text>` in Archivo, so in the app they must be inline (not `<img>`) to use the page font. Each instance gets its own filter (§4.3).

The prototype's HTML, CSS and screenshots are kept for reference in `docs/design/ticket-office-prototype/`. Its `sun.svg`, the `text-shadow` misregistration, its shared `#ink` filter, its wordmark and its colour values for `--ink-3` and `--red-ink` are **superseded** by this document.

---

## 10. Traceability: judges' must-fixes and grafts

### 10.1 Must-fixes (all three judges, deduplicated)

| # | Must-fix | Resolved in |
|---|---|---|
| 1 | Misregistration reads as a drop shadow | §4.8: true red plate (multiply, 1.5/1px), only on the reveal sheet, applied to the total, rule and PAID together. The hero "1 SOL" is plain ink |
| 2 | Halftone sun moiré and crowding of "0.08" | §4.9: integer lattice at 1:1, glyph knockout mask (8px), horizon on the baseline, only when wins > 0 |
| 3 | Duplicate top-right total after the reveal | §5.6 main item 1: nothing on the right after the end |
| 4 | Dead paper below the total (y ≈ 760–900) | §5.6 main item 6: receipt slip, actions and notes row |
| 5 | Every serial red | §2.1 colour law and §4.2: loser serials ink; red-ink only for winners, the drawn ticket and #0006 |
| 6 | Generic wordmark; giant footer wordmark | §4.12 new mark (`mark.svg`); §5.13 footer wordmark removed |
| 7 | LOCKED stamp too large; crowds "31 min" on mobile | §4.1 and §4.3: 200px (−18%) desktop, beside the figure; mobile 120px to the right of "SOL", ≥ 16px from the countdown (§8.2) |
| 8 | Stamps share one turbulence seed; no accessible names | §4.3: per-instance filters seeded from real bytes, varying pressure and angle, `role="img"` + `aria-label` |
| 9 | Two quantity controls on mobile; 40px targets | §5.5: the in-flow stub is info-only; bar punches 48px; picks 44×44 |
| 10 | 80px gap in the desktop stub | §5.5: fixed rhythm, no `margin-top: auto`, leftover space below |
| 11 | Lede column too copy-heavy | §5.3: lede plus odds table only; "Anyone can run…" moved to the back of the ticket |
| 12 | Archivo at 100% in the UI drifts generic | §2.2: UI pinned to 85–88% width; 100% is banned |
| 13 | Recompute box reads as a callout | §4.11: carbon-copy slip, no left border |
| 14 | Vault link generic; #0097–#0101 contradicts "2 s"; Reveal replays #0031 | §5.3 (`vaultPda`), §5.8 sealed explanation, §5.18 fixture `reveal(e)` + `reveal-5` |
| 15 | Uppercase "THE BACK OF THE TICKET…" header; 2×3 card grid | §5.12: sentence-case title, single ledger table |
| 16 | "BUY TICKETS" and the repeated "DRAWSOL · GRAND DRAW" caps | §2.3: caps only on the draw ticket head (hero and past tickets); stub head in sentence case |
| 17 | Address wraps mid-string | §4.13 `.nw` on every address and number + unit |
| 18 | PAID seal overlapping text | §5.6: PAID in its own 132px grid cell |
| 19 | Reveal stub amounts overflow at 0.20 | §2.3 `.t-stubamt` 46px for every tier (fits "0.20" in 100px) |
| 20 | One clear primary next action after the reveal | §5.6: "Buy more tickets" primary (quantity kept), others as text buttons |
| 21 | Countdown is a bare text swap | §4.5 NumberWheel advance on the real minute tick; off under reduced motion |
| 22 | Devnet strip hidden on mobile or under the sheet | §3.4: z 100, sheet height capped under the strip |
| 23 | Recompute must be real; countdown from the real close time | §5.11 (fairness.ts, verified #0006) and §5.3 (`d.closesAt − now`) |
| 24 | Re-check contrast; grain behind small text | §2.1 recomputed against worst-case grain (`--ink-3` and `--red-ink` darkened); §2.7 grain capped |

### 10.2 Grafts from the other prototypes

| From | Graft | Where |
|---|---|---|
| Certificate | Each ticket's real roll on the reveal stubs, plus the threshold key | §5.6 main items 2–3 |
| Certificate | "Devnet specimen · play money" printed on the ticket | §4.7 specimen overprint |
| Certificate | Program-ID microtext as a hairline rule | §4.7 microtext rule |
| Certificate | Three punched cancellation holes on paid tickets | §5.3 settled, §5.10 old ticket |
| Certificate | Stamp ink seeded from ORAO bytes, captioned once | §4.3 |
| Certificate | Real PDAs; working WebCrypto/fairness recompute; "new tickets start at #0102" | §5.3, §5.11, §5.5 confirm item 4 |
| Poster | Your 16 tickets raised in the barcode | §4.4 (blue = you chose these) |
| Poster | Wordmark built from the system's data (barcode with one raised bar) | §4.12 |
| Poster | Receipt bars with heights proportional to SOL won, as a tear-off slip | §4.10 |
| Poster | "18+ confirmed on this device · Undo" | §5.5 confirm item 6 |
| Poster | Ticket being revealed shown at display size; "Skip to total" | §5.6 main items 1 and 5 |
| Poster | Mobile sticky bar with quantity only in the bar and the total on the button | §5.5 |
| Studio | aria-live announcer naming each winner, then the payout | §5.6 announcer |
| Studio | Stats as sentences ("100 of 150 sold", "2 d 5 h 31 min left") | §5.3, §6 |
| Studio | One consolidated "check every claim" ledger | §5.12 |
| Studio | "Asked once, remembered on this device"; "1 in 102 right now" with its explanation | §5.5, §6 house rules |
| Studio | Mobile reveal total and payout link kept in the first view | §5.6 mobile, §8.4 |

Not taken, deliberately:
- Poster's orange "flood" on each win: red is rationed, and the WON slam plus the now-showing slot are loud enough.
- Certificate's guilloche: a second ornamental system would compete with the stamps.
- Studio's split-flap: the founder has already rejected that concept.
