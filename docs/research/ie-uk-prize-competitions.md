# How Irish and UK prize-competition operators run their businesses, and what DrawSol should copy

**Research date:** 2 October 2026
**Written for:** the DrawSol founder (Colosseum hackathon, devnet demo at https://djbigzzz.github.io/drawsol/)
**Operators covered (10):** McKinney Competitions, Blaa Giveaways, Ooosch, Lucky Day Competitions, R Kings Competitions, Omaze UK, BOTB (Best of the Best), Elite Competitions, Dream Car Giveaways (DCG), Rev Comps.

**How to read this**
- Every operator claim comes from something we saw on 2 Oct 2026: live pages, public APIs, shipped JavaScript, T&Cs, Companies House, Trustpilot or press. Section 7 lists the sources. "Not found" means we looked and did not find it.
- We made no payments, so no operator's post-payment screen was observed. Where we describe one, the source is FAQ text or shipped code, and we say so.
- Numbers we worked out ourselves from observed data are marked **(calculated)**.
- DrawSol facts come from `docs/SPEC.md` and, where noted, the current app code (`app/src/components/`). Where the current app build differs from the SPEC, this report says so.
- Regulatory citations in [n] map to the numbered list in section 7.1.
- This is product research, **not legal advice**.

---

## 1. Executive summary

### The picture in five lines

1. **This is a big, consolidating market.** Omaze UK made £196.6m revenue in 2024 (City AM). Jumbo Interactive bought DCG at an A$109.9m enterprise value, on A$36.5m revenue. Winvia (owner of BOTB) bought Rev Comps in July 2026 for £11.8m; Rev Comps had more than £80m revenue. R Kings says it is owned by Nasdaq-listed GMGI. McKinney and Blaa run on the same white-label platform, WebsiteNI.
2. **Most operators promise a guaranteed draw and a random winner, but few can show it.** Only R Kings, DCG and Rev Comps publish entry lists. Outside checks are limited: BOTB has PromoVeritas letters for House and Dream Car draws, McKinney has a one-off GLI certificate for its RNG, and Ooosch has a Grant Thornton letter. Elite, DCG and Lucky Day make no claim to independent draws. The recurring 1–2 star Trustpilot themes vary by operator. "Rigged" or "lands on nothing" comes up at Blaa and Ooosch, "pre-recorded draws" at R Kings and Lucky Day, and slow or hard-to-find results at McKinney, Lucky Day and Omaze. "Instant wins only pay credit or points" comes up at McKinney, Ooosch and Lucky Day, and repeat winners at DCG. Proof the draw was real is the gap an on-chain draw fills.
3. **Some operators quietly break their own promises.** R Kings fills unsold tickets with a placeholder entrant ("Redra W"), so entry lists show 100% sold; on one draw 71.2% of tickets were filler. Ooosch's competition pages say "always the prize advertised", but T&C 8.8 allows four 7-day extensions and then a prize of 70% of takings. Lucky Day hides its instant-win numbers; on one game none of the 118 tool prizes had dropped at 10.1% sold, where about 12 were expected (the profile puts the probability at about 3.5×10⁻⁶).
4. **DrawSol's technology is already ahead on proof.** The prize is escrowed before sales, the close time can't change, randomness comes from ORAO VRF and anyone can recompute it, entries are public accounts, and instant wins are paid in SOL by a separate, permissionless `reveal_entry` transaction once the VRF result is in (SPEC §2.4).
5. **DrawSol's real gaps are not technical.** They are the free-entry route, the skill-question model, responsible-play tools, catalogue and cadence, and keeping players informed. These are what the regulator and the best operators care about most.

### The ten things the best operators do, in priority order for DrawSol

| # | What the best operators do (who) | What it means for DrawSol |
|---|---|---|
| 1 | **Offer free entry right next to paid entry, with an equal chance at every prize.** McKinney (equal-weight "Free Postal Entry" tab), Lucky Day (tab), BOTB (modal tab with a "same chance per entry" line), DCG (tab in the entry modal), Rev Comps (toggle in the buy box), Omaze (Postal is the *first* tab). Postal entries can win instant prizes under the T&Cs of BOTB (15.2), Elite (5.1(b)), Lucky Day (4.1B: free entrants get an RNG-chosen number) and R Kings (4.1(b)), and DCG accepts instant-win postal entries. Ooosch's T&C 0.2 says free entries are "treated in exactly the same way as paid entries", and Blaa turns a postal entry into site credit usable on instant wins. Elite allows as many postal entries as paid ones. | This is DrawSol's biggest gap. Free entry is 1 per wallet, grand draw only, separately capped at 5% of tickets, and shown as fine print. That conflicts with GB Schedule 2 para 8 [2], DCMS Code 1.10, 2.2 and 2.4 [11], and the ASA's Team HARD Racing ruling [19]. Fix first. |
| 2 | **State the guaranteed draw in one sentence, and never break it.** Blaa ("Draw goes ahead regardless of sales!"), Rev Comps ("PRIZE DRAWN REGARDLESS OF SELL OUT"), DCG ("GUARANTEED DRAWS Regardless of how many tickets sold"), Lucky Day, Elite, and McKinney ("Guaranteed Draw" badge on 58 of 92 competitions). Required by DCMS Code 2.5 [11]. | DrawSol already *enforces* this in the program for the grand prize. Say it in one line beside Buy and link it to the vault. Nobody else can prove it, and Ooosch's T&C 8.8 shows how hollow the promise can be elsewhere. Keep "never reduced" to the grand prize: instant wins can be paid short if the reserve runs out. |
| 3 | **Run as an honest prize draw rather than a pretend skill contest (GB/NI).** 7 of 10 ask no question in the buy flow. McKinney switched its question off, and Lucky Day, R Kings, Omaze, Elite and Rev Comps ask none ("ANSWERING A QUESTION IS NO LONGER REQUIRED"). DCG has questions in its data but never shows them. BOTB runs a real judged skill game (Spot the Ball) for Dream Car only. The two that still ask, Blaa and Ooosch, leak the answer to the browser, and Ooosch accepts wrong answers. This is common practice, not proven best practice: 6 of the 7 no-question operators sell into the Republic of Ireland, where ASAI 5.53 says a purchase-based prize promotion "requires a test of skill" [41]. | DrawSol's question gives no legal cover. It is multiple choice, UI only, gives right/wrong feedback with unlimited retries ("Not quite. Have another go."), and ships the answer in the client bundle (`const ANSWER = "Mars"` in `ConfirmStep.tsx`). That is the same leak criticised at Blaa and Ooosch. The GC says "Multiple choice questions, or questions that allow a second chance if your first answer is wrong, rarely meet this criteria" [6]. Instant wins are also decided by chance at purchase, before any answer could be checked, which looks like a s.14 "complex lottery" [1]. For GB/NI, pick the prize-draw-with-free-entry model and say so plainly. Ireland is different (ASAI 5.53 [41]), so get Irish counsel. |
| 4 | **Publish the instant-win prize table with live won/left counts.** McKinney, Blaa, Ooosch, R Kings and DCG publish every winning ticket number in advance. BOTB, Elite and Lucky Day show won/left counts only. DCG prints the odds outright: "Odds of winning an instant win prize: 1 in 1.79 tickets". | DrawSol's per-ticket VRF rolls are fairer than hidden numbers. Show the tier table, the odds per tier, wins so far against expected, the reserve left, and every win with its proof. Market that DrawSol's smallest instant win equals the ticket price, paid in SOL, with no site credit. |
| 5 | **Publish proof after every draw.** R Kings (searchable entry list plus CSV, 7,773 lists), DCG (searchable list with "Tickets sold: x / max"), Rev Comps (list with the draw time to the second), BOTB (a signed PromoVeritas verification letter for House and Dream Car draws; Easy Win results have none). McKinney publishes no per-draw proof; its GLI certificate is a one-off certification of the RNG. Most publish no entry list: McKinney, Blaa, Lucky Day ("coming soon"), Omaze, BOTB, Elite, and Ooosch (only for logged-in buyers). | DrawSol's Entry accounts *are* the entry list. Give every draw a permanent page with the full searchable list, a CSV, the VRF proof, the settle transaction and a "recompute" button. This is the single strongest differentiator. |
| 6 | **Build a nightly habit plus a weekly show.** McKinney (YouTube live at 10:30pm with presenters; autodraws about 11pm), Rev Comps (Monday live show; 274 auto draws closing at 22:00/23:00), Elite (live Tue/Wed/Fri 9pm; daily draws at 10pm), DCG (automated draws at 21:00, 22:00 and 23:00; live on Sunday), Blaa (daily 9pm cash autodraw, now at series #48). | DrawSol runs one draw at a time. Add small, short, cheap draws every night and one weekly headline draw where "Run the draw" and "Settle" are pressed live on stream. |
| 7 | **Make buying take two taps.** A stepper, slider, presets and a "Max" button, with the live total in the button and the per-person cap visible: R Kings ("Add To Basket \| £17.60"), BOTB ("MOST CHANCES"), Rev Comps ("CHOOSE MAX TICKETS (50)"). Quick Buy straight from the card: Lucky Day. McKinney's "QUICK BUY" (straight to the cart) is on the competition page; its homepage cards say "ENTER TODAY". A sticky mobile buy bar: McKinney, Elite, Rev Comps, DCG. | The buy panel is close. It already has a stepper, presets (1/5/10/25), a total row and "You can still buy N" in the ledger. New: a "Max (N)" preset and the total inside the button. **Change the default from 10 tickets (today, `BuyContext.tsx`) to 1**, rather than copying the £8–£20 defaults at BOTB, DCG and R Kings. Wallet-connect as the only gate already beats the login walls at Ooosch, R Kings, BOTB, Elite and Lucky Day. |
| 8 | **Ship real responsible-play tools.** BOTB (limits down to £0, cooling-off on increases, 6- or 9-month suspension), R Kings (monthly limit, take-a-break, freeze, closure), Elite (weekly limit with a 7-day lock, self-exclusion), Omaze (£500/month cap enforced at checkout, £0 lock for 6 months), DCG (spend limits, pause, suspension), Rev Comps (limits, take-a-break, suspension). Ooosch has monthly spending limits only. Required by DCMS Code 1.4 and 1.5 [11]. | DrawSol has per-draw wallet caps only. Add a wallet-level spend cap, cool-off and self-exclusion, enforced in `buy_tickets`. For mainnet the cap must be fiat-equivalent and tied to a verified person, because SOL prices swing and multiple wallets bypass a per-wallet cap. |
| 9 | **Use retention loops, but lightly.** BOTB Pass, Omaze subscriptions, Elite Club, DCG Dream Points and tiers, Rev Comps 1% cashback and 5% referral credit, Ooosch Points (5%, doubled on Saturdays). Overdone, these drive the worst reviews: BOTB Game Credit expiring in 72 hours, Omaze subscription and cancellation complaints, Elite's stacked checkout upsells. | Keep paying instant wins in withdrawable SOL. Add cashback or loyalty later. Do **not** copy refer-a-friend schemes without advice: the FCA bans refer-a-friend bonuses in cryptoasset promotions [46]. |
| 10 | **Make social proof feel live.** BOTB ("Another winner. Now." plus 24-hour counters), DCG (live winners feed and a UK map), Blaa (WebSocket "Live Winners" feed), a Trustpilot bar on every page (Ooosch, Omaze). Their numbers are often stale or inflated: Ooosch's own pages show 403k, 414k and 425k winners, and its Trustpilot "About" text still says 68k; BOTB's badges are static images; Elite's "14.1M+ prizes" counts every 1p credit. | Counters and feeds computed from chain can't go stale. Show winners as short wallets with a transaction link, plus opt-in display names. |

### What the field gets wrong (DrawSol's openings)

- **Padded instant wins.** Elite's 1p Jackpot Jumble has 498,000 of 500,000 prizes as "Have another go! (1p Credit)". 377,508 of DCG's 380,000 "instant prizes" are Dream Points worth 5p–£1. BOTB's "Prize Every Time" has about 2.23M × £0.75 Game Credit on a £1.79 ticket. Blaa's Spin 'N Win counts 50,000 × 35c wins on a 49c ticket.
- **Hidden odds.** Elite shows only "% SOLD" on jackpots, with caps of 7M–30M in the description text. DCG hides the cap in a collapsed panel.
- **Fake sell-outs.** R Kings' "Redra W" filler held up to 79% of a draw.
- **Contradictory terms.** Ooosch (on-page guarantee vs T&C 8.8). Blaa (cart says wrong answers are refunded; T&Cs say no refunds). McKinney (the FAQ still explains a question it switched off). Rev Comps (three different live-draw times).
- **Data leaks.** McKinney and Blaa expose `total_revenue` per competition through a public endpoint. R Kings' API exposes winners' full surnames. Elite shows instant-win winners as first name plus initial, but its public prize-group API (`/instant-prizes/groups/{id}/winners`) returns full names ("Matthew Smith", ticket 5782226, £100,000 cash). McKinney and Blaa publish instant-win winners' full names on the page.

---

## 2. Operators at a glance

The table is split in two so it stays readable. DrawSol is the last row for comparison.

### 2a. Business and draw rules

| Site | Country / market | Platform | Ticket price range | Typical ticket count (cap) | Draw trigger | Undersold policy |
|---|---|---|---|---|---|---|
| **McKinney Competitions** | Northern Ireland; sells UK + ROI, GBP/EUR switch | WebsiteNI (custom multi-tenant PHP, CodeIgniter 4) | £0.05–£9.99 (most 9p–99p; house £2.99) | Autodraws 599–44,399; headline draws 300k–1.7M | Fixed date; a sell-out brings the draw forward to the next working day | Drawn anyway ("Guaranteed Draw" on 58 of 92; "No rollovers, no extensions"). T&Cs are silent and reserve the right to "void, suspend, cancel, or amend" (11.3) |
| **Blaa Giveaways** | Republic of Ireland (Waterford); IE + UK, EUR/GBP | WebsiteNI (same platform as McKinney) | €0.08–€5.99 | Small prizes 255–1,995; cars 220k–350k; instant-win games 579k–1.5M | Fixed date regardless of sales; sales close 15 min before | "Draw goes ahead regardless of sales!" T&Cs: no minimum, no voiding for lack of entries, no extensions |
| **Ooosch** | ROI market (EUR), plus a separate UK site; Irish promoter with an NI agent | Custom SvelteKit + tRPC on Cloudflare | €0.59–€4.99 (mostly €0.99–€2.99) | 999 (small); 99,999 (car); 500k–1M (instant win) | Fixed date at 22:00; a sell-out stops sales | Page: "Winner announced regardless of a sellout… always the prize advertised". T&C 8.8: up to four 7-day extensions, then 70% of takings. 8.5: early termination with site credit |
| **Lucky Day Competitions** | Northern Ireland; UK + ROI, GBP/EUR/USD | WordPress + WooCommerce + custom competition plugin | £0.12–£19.97 (median £1.97) | 597–24,997 typical; instant win up to about 2M | Live draws on a fixed date ("may be pulled forward"); "(Auto Draw)" at sell-out or close | Guaranteed on the date; no extension, no minimum (T&C 3.2, 11.3) |
| **R Kings Competitions** | Northern Ireland; UK + ROI | Next.js front end + Laravel API | £0.19–£34.99 | Small 99–14,999; headline 200k–525k | Sell-out or close, whichever is first (T&C 4.1(c)) | "Guaranteed draw" with no extension, but unsold tickets are assigned to a placeholder "Redra W", so lists read 100% sold |
| **Omaze UK** | UK only (ROI excluded) | Shopify + Recharge (subscriptions) | £10 for 15 entries up to £150 for 320 (46.9p–75p per entry); subscriptions 7.8p–15.4p per entry | No cap | Fixed calendar date only | Guaranteed winner and a guaranteed £1M charity donation; may extend or withdraw only for "circumstances beyond our control" |
| **BOTB** | UK (UK residents; free competitions UK & IRL) | ASP.NET on Umbraco, AngularJS 1.7.8 + React | 1p–£6.15 | Easy Wins 9,999–400k; house 3.15M; instant win 1.4M–2.5M; Dream Car uncapped | Sell-out or end of promotion (T&C 9.2) | Drawn at the deadline; extensions only for technical or fraud problems; early closure refunded as Game Credit |
| **Elite Competitions** | England (Blackpool); delivers UK + IE | Next.js + REST API on Google Cloud Run, Firebase | 1p–£5 (jackpots 3p–19p) | Free comp 15,000; jackpots 7M–30M; instant win 500,000 (Prize Every Time, 1p Jackpot Jumble) to 20M (Life Changer) | Timer, or sell-out (rare at these caps) | Prizes awarded in full regardless of entries (6.9). T&C 2.6: the timer will "never have time added on", but Elite may end a promotion early if it stays open at least 3 clear days after the announcement. 4.12: "a minimum of nine (9) Entries" per competition |
| **Dream Car Giveaways (DCG)** | England; UK + ROI | Next.js on Vercel + API Platform (Symfony) | 3p–£1.99 | Tech and cash 949–269,999; cars 31,999 (Nova), 99,999 (Harley), 110,000 (Defender), 1,649,999–1,999,999 (BMW M5, camper, R34); instant win 50,000–1,865,999 | Fixed close; earlier if sold out | T&C §13: no minimum, no extension or amendment "due to a lack of entries"; the prize is awarded "regardless". The FAQ adds "never change the prize". §13 also allows voiding for causes "out of its control", with refunds |
| **Rev Comps** | England brand (Devon), Gibraltar promoter; UK, ROI, NI, IoM, Channel Islands | Next.js white-label shared with Click Competitions | 15p–£29.97 (median £3.27) | 49–149,999 (median 389) | Fixed date; early draw if sold out | "PRIZE DRAWN REGARDLESS OF SELL OUT" in the FAQ and on-page copy, not the T&Cs. T&C 8.5 lets it extend, shorten or cancel "for any reason beyond our reasonable control" |
| *DrawSol (today)* | *Devnet demo* | *Anchor program + static Next.js* | *0.01 SOL devnet; 0.015 SOL production plan* | *150 devnet; 10,000 production plan* | *Sell-out or deadline* | *Prize escrowed at creation; `closes_at` immutable; drawn if ≥1 ticket; zero tickets returns the prize; VRF timeout after 48h leads to refunds* |

### 2b. Instant wins, skill, free entry, draws, reviews

| Site | Instant-win model | Skill question | Free entry route | Live draw method | Trustpilot (2 Oct 2026) |
|---|---|---|---|---|---|
| **McKinney** | Pre-allocated; every winning number published per tier; winners' full names shown; small wins paid as site credit | None (switched off, `showQuestion = 'N'`); FAQ still describes it | Postcard to a Dungannon PO Box; equal-weight "Free Postal Entry" tab | YouTube live nightly at 10:30pm with presenters; GLI-certified "WNI True RNG"; autodraws about 11pm | 4.8 from 40,037 |
| **Blaa** | Pre-allocated, published; full names; unbought numbers go unwon; €50+ cash, smaller amounts as site credit | 3-option multiple choice in the basket ("Who is the Founder of Apple?"); correct option readable in the HTML class | Post to Waterford; small text link opens a modal; for instant wins, postal entry gives site credit | Facebook/YouTube; Google RNG on screen over the full cap; 9pm autodraws by software | 4.8 from 2,240 |
| **Ooosch** | Pre-allocated, published as ticket chips; first name + last initial; spin and scratch reveal; heavy points padding | 3-option multiple choice in the entry modal; wrong answer accepted; correct answer shipped in the page payload | Post to Newry, account required; outlined button on desktop, accordion only on mobile; T&C 0.2: free entries "treated in exactly the same way as paid entries" | Physical ball machines on YouTube/Facebook at 10pm; RNG reviewed by Grant Thornton (NI) LLP | 4.9 from 8,439 |
| **Lucky Day** | Pre-allocated but **not** published; only won numbers shown (first name + initial); "every ticket wins" credit and free entries | None anywhere | Postal tab equal to "Online entry"; stamp parity (91p); account required; free entrants get an RNG-chosen number in instant-win games (T&C 4.1B) | Google RNG on Facebook Live (observed Tue/Fri/Sun about 11:15pm); auto draws by system | 4.7 from 23,318 |
| **R Kings** | Pre-allocated, published (Available / Won tabs); prizes on unsold numbers never paid | None (`quiz` null on all 44) | Handwritten post to Newry; accordion link; stamp parity (87p); account required; postal entries get an RNG-chosen number, which can match an instant-win number (T&C 4.1(b)) | Filmed Google RNG; 1,383 draw videos on site; the How-to-play page says draws livestream on Facebook (the FAQ only says "A random number generator then selects the winning ticket") | 4.7 from 252 |
| **Omaze UK** | None | None (prize draw) | Post to the Civica scrutineer; first tab on the entry page; no limit | Not streamed; vendor software RNG; winning 13-digit Entry Code published | 4.5 from 723,632 |
| **BOTB** | Pre-assigned, not published; Won/Left per prize and a winners list | Spot the Ball (judged) for Dream Car only; none on chance draws | Handwritten post to London; tab in the purchase modal; eligible for instant wins | No live stream; PromoVeritas certified RNG, with a signed letter for House and Dream Car draws (none for Easy Wins); Onside Law witnesses judging | 4.0 from 11,534 |
| **Elite** | Pre-allocated, encrypted, not published; won groups show name + ticket | None | Postcard to Blackpool; small link to a T&C anchor; up to as many as paid; eligible for instant wins | In-house ball machine on Facebook/YouTube 9pm Tue/Wed/Fri; undisclosed "Auto Draw" | 4.5 from 18,529 |
| **DCG** | Pre-allocated; every number published ("Show numbers"), won ones greyed; odds stated | In data for 23 of 67 competitions; never shown in the flow | PO Box in Pershore; tab in the entry modal; stamp parity (9p = 10 entries); account required | 65 of 67 automated (PHP `random_int`); live presenter draw Sunday 21:00 | 4.3 from 8,337 |
| **Rev Comps** | None live (the platform supports it) | None ("ANSWERING A QUESTION IS NO LONGER REQUIRED") | A6 postcard to a Torquay PO Box; toggle in the buy box; account required | Physical ball machines, Monday 21:00 on Facebook/Instagram/YouTube; auto draws by `rngWithoutDelay` | 4.8 from 9,654 |
| *DrawSol* | *Independent ORAO VRF roll per ticket, paid in SOL from an escrowed reserve by a separate `reveal_entry` transaction after VRF fulfilment* | *3 options in the confirm step, UI only; right/wrong feedback with unlimited retries; answer shipped in the client bundle* | *1 per wallet, grand draw only, separate cap; on-chain claim needs a wallet and fees* | *Anyone can run `request_draw` and `settle_draw`; VRF recomputable in the browser* | *n/a* |

### 2c. Entity, Code status and player protection

"Listed" means named as an operator signatory in the 1 Sep 2026 version of the DCMS Code [11]. "Not listed" means we found no match for the operator in that list.

| Site | Legal entity (company no.) and inconsistencies seen | DCMS Code | Per-person cap | Responsible-play tools | Public entry list | Payments |
|---|---|---|---|---|---|---|
| **McKinney** | Top Gear Autos N.I. Ltd t/a McKinney Competitions (NI667309). The Terms of Use say "registered in England and Wales" under the NI number | Listed (the site never mentions it) | None (`enforce_max` "N") | Take a break, permanent self-exclusion; no spend limit found | No | Pay.com: card, Apple Pay, Google Pay, PayPal |
| **Blaa** | Pleo Media Ltd t/a Blaa Giveaways, CRO 756201 (T&Cs, Terms of Use). The postal-entry modal says "665869" | Not listed | None | One FAQ sentence | No | Pay.com: card, Apple Pay, Google Pay; wallet balance |
| **Ooosch** | Promoter OG Media & Management Ltd (IE, 641692); disclosed agent Ooosch Giveaways Ltd (NI677339) | Not listed | 100–2,000 per competition; €500 per order | Monthly spending limit only | Logged-in buyers only | Checkout.com, Cashflows or BR-DGE; Apple Pay, Google Pay |
| **Lucky Day** | ACE COMPETITION LTD (NI659574), also written "Ace Competitions Ltd" (footer) and "Ace Competition Ltd" (T&Cs) | Not listed | None observed (1,000 tickets, £1,576, accepted into one basket) | None found; one FAQ sentence | "Coming soon" | DNA Payments card, Apple Pay, Google Pay, PayPal, Trustly |
| **R Kings** | R Kings Competitions Limited (NI656489; Companies House name "RKINGSCOMPETITIONS LTD") | Not listed | 4–9,999 | Monthly limit, take-a-break, freeze, closure | Yes, searchable plus CSV | Checkout.com, PayPal, Apple Pay, Google Pay; wallet top-up |
| **Omaze UK** | Omaze UK Limited (12056935) | Listed ("founding signatory" per its FAQ) | No entry cap; £500/month spend cap | £500/month cap (£250 on credit card), enforced at checkout; £0 limit locked for 6 months | No | Shop Pay, PayPal, Google Pay |
| **BOTB** | Winvia Entertainment Plc, formerly Best of the Best Limited (03755182) | Listed | 75 (Dream Car); 1,000 on most others | Limits down to £0 with cooling-off on increases; 6- or 9-month suspension; closure. Credit cards £250/month and none on instant wins (9.31) | No | Card, Apple Pay, Google Pay, Game Credit; Trustly Direct Debit (Pass) |
| **Elite** | Hydro Solutions Fylde Ltd t/a Elite Competitions (09612888) | Listed | Per competition (e.g. Porsche 25,000; Prize Every Time 1,500) | Weekly spend limit with a 7-day lock; self-exclusion 1/3/6 months; £250/month credit-card limit; Apple Pay and Google Pay debit-only. No instant-win credit-card ban found | No | Checkout.com Flow, Apple Pay, Google Pay |
| **DCG** | Dream Car Giveaways Limited (11320154), a subsidiary of Jumbo Interactive UK Ltd | Listed | 1–18,750 | Monthly spend limits, pause, suspension. Credit cards £250/month and none on instant wins | Yes, searchable with sold/max | Checkout.com Frames, Cashflows, PayPal |
| **Rev Comps** | Rev Competitions Limited, Gibraltar (126588). The FAQ still cites Rev Corp Ltd (11981806), since renamed 2SAVI LTD | Listed | 1–500 | Spend limits, take-a-break, 6/9-month suspension, closure, self-assessment; £250/month credit-card cap. Runs no instant wins | Yes (`/ticket-numbers/{id}`) | Checkout.com (per FAQ); Pay.com and DNA in config; Apple Pay, Google Pay |
| *DrawSol (today)* | *No promoter named* | *No* | *25 per purchase, 50 per wallet (devnet)* | *Per-draw wallet cap; BeGambleAware link in the Rules* | *Every Entry is a public account* | *SOL from a wallet* |

---

## 3. How they run it, by topic

### 3.1 Catalogue and pricing psychology

**How many draws are live at once.** Rev Comps had 280, McKinney 92, DCG 67, Lucky Day 45, R Kings 44, BOTB 43 and Blaa about 38. Elite had 16 listings plus daily draws, and Ooosch at least 26. Omaze runs a handful of draw types around one house campaign a month. DrawSol runs one.

**Three product layers almost everyone uses**
1. **Headline "life-changers"** (houses, supercars) at pennies with huge caps. Examples: Elite's Porsche 911 Turbo S at 4p with 6,999,999 tickets; DCG's camper at 9p with 1,999,999; McKinney's motorhome at 23p with 543,999; BOTB's £1.3M Surrey house at £1 with 3,149,999.
2. **Instant-win "prize pools"** with an end prize. Examples: McKinney's Peters Pachinko; Blaa's Spin 'N Win; Ooosch's €1.2M Halloween spin; DCG's Fall Into Fortune; BOTB's £1m+ Instant Wins; Lucky Day's Million Pound Cash Vault; R Kings' 29p Instant Win.
3. **Small, cheap, frequent draws** with small caps that sell well and create lots of winners. Examples: McKinney Autodraws (DeWALT leaf blower, 799 tickets); Blaa's daily €500 Friday (995 tickets); Rev Comps' median cap of 389; DCG's "Only 999 Entries" tech; Ooosch's €2K Cash #28 (999 tickets).

**Pricing levers**
- **Cash alternative in the title.** McKinney ("X or £Y"), R Kings ("£50,000 or 2026 Toyota Hilux…"), DCG ("Camper & £3,000 or £55,000 Tax Free"), BOTB ("OR TAKE £900,000 CASH" under the title; the T&C default is 70% of RRP), and Rev Comps (151 of 280 prizes). McKinney and Blaa default property cash alternatives to 50% of value. Lucky Day promises a cash alternative "for all prizes" but shows no amount. Omaze offers none at the winner's option.
- **Volume discounts.**
  - McKinney: 17 of 92 competitions, 5–30% (house 5/10/25/50 tickets for 5–20% off).
  - Blaa: 5–20%.
  - Ooosch: 15–30% via time-boxed multibuys.
  - Lucky Day: 5/10/20% at 3/5/10 tickets.
  - Elite: up to 40% ("SAVE 40% 3000+").
  - Flat pricing: BOTB, DCG, and R Kings (bar one competition).
  - Rev Comps instead uses an **early-bird** price: 10% off "until [date] OR 50% TICKETS SOLD", and says it will "never discount prizes in the last hours".
- **Strike-through "Sale!" prices.** These are near-universal: McKinney on every competition (which contradicts its own "no last-minute discounts" copy), Blaa, R Kings, Elite ("Flash Sale!"), and Ooosch (launch sale €3.99 → €1.99 for the first 300,000 tickets). Ooosch's post-launch 50% discounts made earlier full-price buyers angry on Trustpilot.
- **Default quantity as an anchor.**
  - R Kings opens the Hilux at 80 tickets (£17.60).
  - BOTB pre-fills about £7–£8.50 (800 tickets on 1p competitions).
  - DCG pre-fills about £20 (222 × 9p).
  - Elite sets the default to the first discount tier (150 tickets).
  - Ooosch preselects 10 or 15 tickets (2 on its €2K cash draw); on the VW Golf, 10 is the first discount tier.
  - DrawSol's current build also preselects 10 tickets (`useState(10)` in `BuyContext.tsx`), i.e. 0.1 SOL on devnet. The SPEC does not set a default.
- **Per-person caps.**
  - Rev Comps: 1–500, enforced across basket and account ("you cannot exceed this number by using additional accounts").
  - R Kings: 4–9,999.
  - DCG: 1–18,750, which is £45–£979 of maximum spend per competition (median £135).
  - Elite: caps work out at about £1,000–£2,000 per competition.
  - Ooosch: 100–2,000.
  - BOTB: 75 for Dream Car, 1,000 on most others.
  - None: McKinney, Blaa, Lucky Day (Lucky Day accepted 1,000 tickets, £1,576, into one basket). Omaze has no entry cap but a £500/month spend cap.
- **Currency.** McKinney toggles GBP/EUR. Blaa converts at a fixed 0.86. At Lucky Day the EUR figure equals the GBP figure (Kubota £1.97 becomes €1.97). Ooosch runs separate IE and UK sites with different offers, which confuses customers ("Ooosch.co.uk or Ooosch.com??").
- **Series and themed days.**
  - Numbered series: Blaa (daily autodraw #48), Lucky Day ("Flash Cash £1,000 #150"), Ooosch ("€2K Cash #28", "Money Monday Instant Scratch #6").
  - Themed days: Ooosch ("99c Car Friday", "Money Monday", "Travel Thursday"), McKinney ("CASH MONDAY", "CASH WEDNESDAY").
  - Presenter- and influencer-branded games: McKinney ("Peters Pachinko", "Logies TNT Wheel"), Blaa ("Seths Cash Cyclone").
- **Niche curation.** Lucky Day's farm machinery, cattle sheds and heating oil speak directly to rural Irish and NI buyers. Ooosch and McKinney sell sports and music hospitality (rugby, Oasis at Slane). Blaa sells local Irish hotel breaks.

**Value for money (calculated)**

| Draw | Calculation | Share of revenue returned at sell-out |
|---|---|---|
| Blaa instant-win games (from the profile's published tier counts) | — | about 37% (Cyclone) to 60% (Spin 'N Win) of maximum revenue |
| DCG Fall Into Fortune | (£277,294.80 instant + £2,000 end prize) ÷ (678,999 × £0.89 ≈ £604k) | about 46% |
| Elite Porsche | £128k prize ÷ (6,999,999 × 4p = £280k) | about 46% |
| McKinney (leaked `total_revenue` field) | Penthouse: £122,889 revenue against a £150k cash alternative | Some undersold draws appear to run at a loss for the operator |

**DrawSol comparison**
- DrawSol's flat price is deliberate (SPEC: "Every lamport buys the same odds").
- At the production parameters, a sell-out raises 150 SOL. The prize is 100 SOL and the expected instant wins are 20 SOL, so about **80% is returned at sell-out (calculated)**.
- The smallest instant tier equals the ticket price (0.015 SOL in production, 0.01 SOL on devnet). So DrawSol never counts a sub-ticket "win" as a prize.

### 3.2 The purchase flow, step by step

| Step | Best example | Worst example | DrawSol today |
|---|---|---|---|
| **1. Discover** | **R Kings** cards show the price, a tag ("DRAW TODAY"), the absolute draw time ("Draw Today 10PM"), the cap and sold/total. **Lucky Day** has a "⚡ QUICK BUY" modal straight from the card. **McKinney** and **Blaa** group draws by urgency: Spotlight / Going Today / Going Tomorrow. **BOTB** uses tabs: Ends Today / Ends Tomorrow / Instant Wins / Free Comps. | **DCG**: a Bloomreach "WIN TONIGHT" countdown pop-up covers the sold stats on mobile. **Rev Comps**: a push-notification soft-ask on first load, plus a 13.9 MB HTML page. **Ooosch**: "Ending Soon" shows a FINISHED draw, and a SOLD OUT card still says "ENTER NOW". | One draw on one page; no catalogue. |
| **2. Competition page** | **DCG**: sticky tabs (Overview / Prize Options / Key Features / Previous Winners / FAQ), prize options lettered A/B, and previous winners of the same model. **Rev Comps**: a black rule box ("LIVE DRAW… PRIZE DRAWN REGARDLESS OF SELL OUT", cap, per-person max). **Omaze**: sells the prize (tour, floor plans, rent estimate). | **Elite**: jackpot pages show only "% SOLD"; the 6,999,999 total sits in the description. **DCG**: the exact cap is inside a collapsed "Competition Details" panel. | Hero board with the prize, vault link, countdown, sold/cap, odds per ticket and instant hit rate. |
| **3. Quantity** | **BOTB**: typed input, 1-to-max slider, −/+, three presets plus the max labelled "MOST CHANCES", and a live total. **R Kings**: the total is inside the button ("Add To Basket \| £17.60") and the slider maximum is the buyer's remaining allowance. **Rev Comps**: "CHOOSE MAX TICKETS (50)". **Elite**: "Hold the plus button to speed up". | **McKinney** mobile sheet: after "Buy 100" it showed "Total (1 tickets) £0.06"; the cart correctly charged £5.40. **Omaze**: fixed bundles only, and the £15/20-entry tier is worse value than £10/15. High defaults at R Kings, BOTB and DCG. | Stepper plus presets (1/5/10/25), clamped to per-transaction and per-wallet limits; **default 10**. The total sits in a row under the presets and "You can still buy N" is in the ledger. No "Max" preset; the button says "Buy N tickets" without the total. |
| **4. Skill question** | Common practice is not to ask one: 7 of 10 don't in the buy flow. That is not shown to be best practice, because ASAI 5.53 says a purchase-based prize promotion in Ireland "requires a test of skill" [41], and 6 of those 7 sell into ROI. If you keep skill, do it properly like **BOTB**'s judged Spot the Ball (judges, a solicitor witness, an independent verifier). | **Ooosch**: a wrong answer is accepted and the correct answer is in the page payload. **Blaa**: the answer is readable from the HTML class, and the cart promises refunds for wrong answers while the T&Cs say "No refunds… in any event". | "Which planet is known as the Red Planet?" (Mars / Venus / Jupiter) in the confirm step; UI only. A wrong pick shows "Not quite. Have another go." with unlimited retries, and the answer ships in the client bundle (`const ANSWER = "Mars"`). |
| **5. Add to basket and upsell** | **Lucky Day**: one targeted "Don't miss this one!" card. **R Kings**: "Quick Picks" adds 5 tickets of a related draw in one tap. **McKinney**: "Quick Buy" on the competition page skips the modal. | **Omaze**: 2 basket upsells for a single purchase and 3 for a subscription, with "~~£20~~ 75% DISCOUNT" anchors and declined add-ons marked "Removed" in red. **Elite**: order bump, round-up, Golden Ball (+20%), Elite Club and bonus draws stacked in one basket. **Blaa**: add-to-basket fails on a stale CSRF token. | No basket; a direct buy. |
| **6. Identity** | Guest checkout at **McKinney** (`enforce_login` "N"), **Blaa** and **Omaze** (Shopify). **Rev Comps** has guest checkout with a later "claim your account". | **Elite**: a login modal appears as soon as you press Add to basket, and registration needs DOB, phone and full address. **R Kings**: you build a basket, then get "Please Login to complete orders". **BOTB** and **Ooosch**: checkout redirects to login. **Lucky Day**: a mandatory password and email typed twice. | Wallet connect is the only gate. This is a genuine advantage. |
| **7. Consents** | **Rev Comps** and **Ooosch**: separate, unticked email and SMS opt-ins. | **Lucky Day**: the T&Cs box is pre-ticked. **R Kings**: the privacy/terms box is pre-ticked. **Omaze**: marketing opt-in pre-ticked and tied to a free £10k "Dream List" draw. **DCG**: marketing is opt-out. | 18+ asked once and remembered on the device ("Asked once, remembered on this device"); nothing pre-ticked. |
| **8. Payment** | **McKinney**: Pay.com with card, Apple Pay, Google Pay and PayPal, plus an order-expiry countdown. **Omaze**: Shop Pay, PayPal and Google Pay. **Lucky Day**: Trustly open banking plus PayPal. Credit-card rules per DCMS 1.3: **BOTB** and **DCG** (£250/month and no credit cards on instant wins); **Elite** (a £250/month default credit-card limit and debit-only Apple Pay and Google Pay; no instant-win ban found); **Rev Comps** (£250/month; it runs no instant wins); **Omaze** (£250 of its £500/month cap). | **DCG**: checkout returned an empty HTTP 204 for a non-UK, logged-out session, with no message. Trustpilot complaints about failed-but-charged payments at **Elite**, and about PayPal taking six attempts at **Lucky Day**. | SOL from the wallet; fees shown. No fiat. |
| **9. Confirmation, numbers, reveal** | Not observed, as we made no payment; these come from FAQ text and shipped code. **DCG**: reveal mini-games in the code (Prize Reel, Card Packs…) with "Skip & Reveal Wins"; the FAQ says "All outcomes are already decided when you place your order". **Elite**: FAQ says results show on screen; the code has confetti hooks and an "InstaWin result" replay under Transactions. **R Kings**: code for an order page with a grid of winning tickets or "Better luck next time!". | **Omaze**: one 13-digit Entry Code stands for N entries ("You don't get to see your tickets"). **Lucky Day**: results can take until the next morning. **Rev Comps**: numbers "allocated shortly after purchase". | Reveal sheet: VRF requested, ticket stubs flip, total won, payout transaction. Already best-in-class on proof. |

### 3.3 Instant wins

**Four models in the market**

| Model | Who | Strength | Weakness seen |
|---|---|---|---|
| Pre-allocated winning numbers, **published** in advance | McKinney, Blaa, Ooosch, R Kings, DCG | Fixed liability; "N winning tickets" marketing; buyers can watch numbers drop | Prizes on unsold numbers are never paid. At R Kings' 39p draw, 7,187 instant wins (£78,265 cash + £21,470 credit, including 2 × £10,000) sat on filler tickets while the banner promised "OVER 10,000 PRIZES!". Blaa's T&Cs say unbought winners are "deemed unwon". There is no proof the numbers weren't changed. |
| Pre-allocated, **hidden** | Lucky Day, BOTB, Elite | Fixed liability | Unverifiable. At Lucky Day's Tradesman's Treasure, 0 of 118 tool prizes had dropped at 10.1% sold, against about 12 expected. Reviewers ask for "the winning number beside them". |
| No instant wins | Omaze; Rev Comps (none live) | Simple | Less "instant gratification"; Rev Comps substitutes nightly auto draws |
| **Independent VRF roll per ticket** | **DrawSol** | Every ticket gets the advertised odds whatever sells; no "big prizes never drop" suspicion; provable | Payout varies. The reveal pays `min(total, reserve remaining)`, so a late winner could be paid less if the reserve runs dry. This must be disclosed. Production reserve: 32 SOL against an expected 20 SOL per 10,000 tickets (calculated) |

**Prize padding.** Instant-win "prizes" worth less than or equal to the ticket price are the norm, and they drive the "rigged" and "only won credit" reviews.

| Operator / draw | Ticket | Prize mix |
|---|---|---|
| Elite 1p Jackpot Jumble | 1p | 498,000 of 500,000 prizes are "Have another go! (1p Credit)" |
| Elite Prize Every Time | £1 | 400,000 of 500,000 are 10p credit |
| DCG Fall Into Fortune | 89p | 377,508 of 380,000 are Dream Points worth 5p–£1 |
| BOTB Prize Every Time | £1.79 | about 2.23M of 2,499,999 are £0.75 Game Credit, which expires in 72 hours (T&C 15.4) |
| Blaa Spin 'N Win ("1 in 8 Chance to WIN") | 49c | 50,000 wins of 35c credit |
| Blaa Piggy Bank | 8c | 200,000 wins of 5c |
| Blaa Cyclone | 15c | 223,500 wins of 10c credit |
| Lucky Day Million Pound Cash Vault | 97p | 1,948,165 tickets (97.4%) "win" a free entry into a £5k draw capped at 2,499,997 |
| Ooosch 40/40/40 | €0.59 | 46,700 of 50,014 instants are free entries |

**What good transparency looks like**
- **McKinney**: an accordion per tier ("£20 Site Credit 441 / 500 Remaining"), every number shown as "Available" or the winner's name, and a "Hide claimed" toggle.
- **DCG**: "Odds of winning an instant win prize: 1 in 1.79 tickets", "357,014 Still available / 22,986 Already won", and car winning numbers printed on the cards.
- **Ooosch**: "€10 Cash 49 of 65 to be won", plus a spin disclaimer: "Spin results are determined by our secure backend system before the wheel animation begins".
- **R Kings**: Available / Won tabs styled as ticket stubs.
- **BOTB**: a "Won / Left / Max Tickets" header and a DETAILS popup per prize.
- **Elite**: "1725/2000 PRIZES REMAINING".

**How the buyer learns the result**
- On screen after payment, according to FAQ text and shipped code (not observed, as we made no payment): DCG, Elite, R Kings, Ooosch, and Lucky Day (FAQ: "Our website will notify you immediately"; its theme ships a tsparticles confetti routine).
- In the confirmation email: McKinney and Blaa (per their FAQs).
- **Ooosch**: one Trustpilot reviewer reported identical spin sequences across two purchases; Ooosch replied that it was a caching issue. We could not confirm either account.

**What happens to instant prizes nobody wins**
- Ooosch (/rng-certification FAQ): "The value of prizes not won are allocated towards future free community giveaways".
- DCG: unclaimed instant prizes can be "add[ed] back to the prize pool". §8: "There is no guarantee that all such Prizes will be won".
- Elite (T&C 7): "There will be no Instant Win Prizes to be won after the Promotion Period."
- Blaa: winning numbers not bought by the close are "deemed unwon" and not reallocated.
- R Kings: prizes on unsold numbers are never paid (see the table above).
- **DrawSol:** `withdraw` returns the unspent reserve (`iw_reserve - iw_paid`) to the draw authority. It can do so once every paid entry is revealed, or 7 days after close (`RESERVE_UNLOCK_SECS`) even if some entries are still unrevealed. After that, `reveal_entry` fails, so a late entry loses its instant-win payout (SPEC §2.1, §2.4, §2.7). We found no copy in the current app that explains this. The R Kings profile's "avoid" list asks for exactly this disclosure.

**How winnings are paid**
- **Site credit:**
  - McKinney: small wins.
  - Blaa: under €50.
  - R Kings: "RK Site Credit".
  - BOTB: Game Credit, 72h expiry.
  - Elite: Elite Credit, 12-month expiry, non-withdrawable.
  - DCG: Dream Points, 12-month expiry.
  - Lucky Day: account funds.
- **Cash:** usually after ID checks.
  - Ooosch: Verify → Claim → Withdraw, a €1 test payment and 5–7 working days.
  - Elite: to a verified bank account.
  - R Kings: cash wallet, withdrawals from £10.
- DrawSol pays SOL to the wallet in the reveal transaction, with no expiry and no KYC on devnet.

**Rules that bite**
- DCMS Code 1.3: no credit cards on instant-win draws [11].
- DCMS 1.10: free entry must be equivalent in instant-win draws, and instant-win draws should not be the majority of an operator's competitions [11].
- Gambling Act s.14 "complex lottery": an arrangement whose first process relies wholly on chance [1]. Per-ticket instant wins are decided by chance at purchase, before any skill answer could be marked, so a skill question cannot rescue an instant-win product.
- CAP 8.25: instant wins need "an independently audited statement" that prizes were distributed fairly [13].
- CAP 8.17.6: distinguish prizes that "could be won" from those that will be [13].
- London Economics warned that free-route gaps "could mean that some instant win products may constitute illegal lotteries" [12].

### 3.4 Draw mechanics and undersold policies

**When sales stop and the draw happens**

| Rule | Who |
|---|---|
| Sales close shortly before a fixed draw time | Blaa closes 15 min before the draw (cutoff 21:45, draw 22:00). Rev Comps' live draws close "during the live draw" when the host presses "End Draw" |
| Sell-out brings the draw forward, but not instantly | McKinney: "date always brought forward to next working day after all tickets are designated". Lucky Day live draws "may be pulled forward" |
| Draw at sell-out or close, whichever is first | R Kings (T&C 4.1(c)), Lucky Day auto draws (4.1C), BOTB (9.2), Elite (4.12), DCG, Rev Comps ("EARLY AUTO DRAW IF SOLD OUT SOONER"). This is DrawSol's rule too. |
| Fixed date only | Omaze (no cap) and Ooosch (a sell-out stops sales; the draw keeps its date) |
| A gap after close so posted entries can arrive | BOTB T&C 10.2: "the actual date of the draw will be no earlier than the second business day following the end of the Promotion Period". Omaze: postal cut-off at 17:00 two days after the online close, and the draw four days after the online close (Yorkshire IV: online close 25 Oct, postal 27 Oct, draw 29 Oct). DCG accepts instant-win postal entries up to 48h after close. DrawSol has no gap: a sell-out can be drawn at once |

**Undersold draws happen all the time, and the good operators draw anyway**
- McKinney's Rollerteam motorhome drew "Tonight 10:30pm" at 40–41% sold.
- Blaa's Kenmare cottage was 0.9% sold five weeks out.
- Lucky Day's Liverpool tickets were 31% sold on the day they were due to close (the close itself was not observed).
- Elite drew £99,999 Cash at 56.1% and the £2M Dream Home at 77.1%.
- Rev Comps drew a Tiguan R at 33,391 of 39,999.
- R Kings' real sell-through had a median of 67%, and 15 of its last 60 draws were under 50%.

**How the winner is picked, and how believable it is**

| Method | Who | Credibility issue observed |
|---|---|---|
| Google RNG on screen | Blaa, Lucky Day, R Kings | Blaa set the range to the full cap (Min 1, Max 749999), not to tickets sold; what happens on an unsold number was not observed. R Kings' filler suggests a redraw when the number lands on filler (inference). Reviewers call R Kings and Lucky Day draws "pre recorded". |
| Physical ball machines | Ooosch, Elite, Rev Comps | Good theatre, but unverifiable afterwards. Ooosch's T&Cs (8.1) describe an RNG instead. |
| Certified or audited RNG | McKinney (a one-off GLI certificate for the RNG only; no per-draw proof), BOTB (PromoVeritas signed letter for House and Dream Car draws; none for Easy Wins), Ooosch (Grant Thornton letter, 2 Dec 2024) | The best of the off-chain options; still trust-based |
| Server RNG | DCG (PHP `random_int`, 65 of 67 draws), Elite, Rev Comps, McKinney and Blaa auto draws, Omaze (vendor not named) | "Now that draws are mostly automated, it's harder to feel confident everything is done fairly" (DCG review). DCG's FAQ says `random_int` picks "within the range of 1 to the number of tickets on sale", while its ticket numbers are allocated at random across the whole range; what happens on an unsold number was not found. Elite's bonus-draw API has both `drawTicketNumber` and a "real ticket number" field, which suggests the drawn number is mapped to a real ticket (inference) |
| **ORAO VRF, recomputable by anyone** | **DrawSol** | Winner index drawn over tickets actually issued (`next_ticket`), so there are no filler or unsold-number problems |

**Cancellation and refunds**
- Ooosch refunds as site credit (8.5).
- BOTB refunds as Game Credit (11.9, 22.5).
- Elite refunds by the original method, or as credit if the entrant chooses (7.1).
- DCG refunds if it has to cancel (§13).
- Lucky Day and R Kings give a full refund if they void (11.3).
- Rev Comps refunds if it cancels before the draw (19.1).
- DrawSol: zero tickets returns the prize to the operator; a VRF timeout (48h after close) allows anyone to cancel, and then every paid entry can claim a refund.

**Winner claim windows**

| Operator | Window |
|---|---|
| Omaze | 96 hours |
| Ooosch | 5 days |
| Elite | 5 working days |
| BOTB | 5 days to reach, 30 days to accept |
| McKinney | 14 days |
| R Kings | 14 days |
| DCG | Notified within 7 days, 14 days to claim |
| Rev Comps | 10 days to reach, 30 days to claim |
| Blaa | 28 days |
| **DrawSol** | Settlement pays the winner directly, so no claim step is needed |

**Unclaimed prizes**
- BOTB 11.8: if a winner is not reached in 5 days or does not accept in 30, BOTB may redraw, roll the prize over, or "permanently void and withdraw the prize".
- Rev Comps 9.4: it may "select an alternative winner …, roll the prize over to a future Competition, or otherwise deal with the prize".
- McKinney 7.2: the prize may go to the next eligible entrant after 14 days. Blaa: after 28 days.
- DrawSol has no unclaimed state: `settle_draw` pays the winning wallet.

**Regulatory pressure on undersold draws**
- DCMS 2.5: never reduce the prize, change the end date or cancel for low sales [11].
- ASA rulings:
  - Amazing Giveaways (2025): prize not awarded for low sales.
  - KS Competitions: 70% of sales paid instead of the prize.
  - Win a Mega Home: £110,070 cash paid instead of a £3m house.
  - Team HARD Racing: a clause allowing four closing-date extensions.

  [16][17][19][21]

### 3.5 Winners, results and proof

| Operator | Winners and results page | Public entry list | Per-draw proof | Privacy |
|---|---|---|---|---|
| McKinney | Recent Draws grid: ticket number, full name, county, prize, "WATCH LIVE DRAW" or "AUTO DRAW"; filters | No | YouTube replay; GLI certificate (RNG only) | Full names, including instant wins per ticket number |
| Blaa | /winners, 70 pages, searchable | No (T&Cs say "may be published"; /entries returns 404) | YouTube replay; nothing for autodraws | Full names |
| Ooosch | OG Winner Club with a calendar of all winners, including instant wins | Logged-in buyers only | A specific YouTube video for top winners; Grant Thornton letter | Full name in the log; first name + initial on chips |
| Lucky Day | /draw-results (76 pages), /past-winners (109), /live-draws (118) | "Entry lists coming soon" | Facebook videos | Full names; finished competition pages return 404 |
| R Kings | Photo grid without names; 1,383 draw videos | Yes: searchable plus CSV, 7,773 lists | Video | First name + initial (the API leaks full surnames); "Redra W" filler |
| Omaze | Monthly draw results showing the winning Entry Code; winner reveal videos | No | None published | Full name and town after verification |
| BOTB | Winners hub by category; Dream Car results show judge and winner coordinates | No (winners list only by email for one month) | PromoVeritas letter for House and Dream Car; nothing for Easy Wins | Full names |
| Elite | Past competition page with winner, ticket and "Watch live draw"; /all-winners with filters | No | Video | Full names for jackpots. Instant wins show first name + initial on the page, but the public prize-group API returns full names ("Matthew Smith", ticket 5782226, £100,000) |
| DCG | Winners page with map and live feed; drawn page "WON BY … Ticket number 791017" | Yes: searchable, with sold/max | `random_int` explanation only | Full names in the entry list (opt-out by email) |
| Rev Comps | /results by day with ticket number and town | Yes: /ticket-numbers/{id}, winner pinned on top, "DRAW CONDUCTED (LIVE) AT 8:19:53 PM" | Video for live draws | Masked on request ("GRA*** KELL***") |

**Customer complaints about results**
- McKinney: "12 hours after a draw i cant find the winners names".
- Omaze: customers "want to see the winning code as soon as it is drawn!!".
- Lucky Day: results take "over 8 hours".
- DCG: "same names win repeatedly".
- Postal entries with no receipt: several R Kings 1-star reviews (2022–2023) say postal entries never appeared in the entry lists, and its T&C 3.11(h) says receipt is not acknowledged. A Rev Comps reviewer complained of no confirmation that a postal entry arrived. McKinney (3.10) and Ooosch (16.5) also say they will not acknowledge receipt.

**What the rules ask for**
- CAP 8.24: a "verifiably random" computer process [13].
- CAP 8.28.5: publish, or make available, the surname and county of major winners [13].
- ASAI 5.34 (Ireland): winners' names and counties [41].
- DCMS 2.2: "verifiably random and auditable" results; publish the draw mechanism [11].

### 3.6 Trust signals

- **Trustpilot everywhere.** Usually a header bar or carousel, and often stale:
  - BOTB's static badges read "4.1 \| 8,967" and "4.2 \| 9,416"; the live score is 4.0 from 11,534.
  - Rev Comps' footer is hard-coded to 9,327 reviews; the live count is 9,654.
  - McKinney's widget shows "our 5 star reviews" only.
  - Lucky Day sends automatic review invitations after purchase.
- **Big counters with soft definitions.**
  - Elite's "14.1M+ PRIZES" is, per its own API schema, a "Baseline plus" figure that includes every instant credit win.
  - DCG says 318,000 winners on the homepage but 140,000 on About Us.
  - Lucky Day says both £85M and £75M.
  - Ooosch's own pages show 403k, 414k and 425k winners; its Trustpilot "About" text says 68k.
- **Independent verification:**
  - BOTB: PromoVeritas letters, Onside Law, Azets.
  - McKinney: GLI "Certificate of Integrity" badge.
  - Ooosch: Grant Thornton RNG letter on /rng-certification.
- **Corporate weight:**
  - BOTB: AIM-listed parent Winvia.
  - R Kings: "wholly owned subsidiary of Nasdaq listed Golden Matrix Group". Companies House shows a Nevada company as the person with significant control since Dec 2025.
  - DCG: Jumbo Interactive.
  - Omaze: Fundraising Regulator registration.
- **Responsible-play pages and logos:** BOTB's support links (Citizens Advice, Money Advice Trust, National Debtline, Samaritans, Mind), R Kings (GamCare), McKinney (GambleAware).
- **Charity:**
  - Omaze: £1M guaranteed per house.
  - Rev Comps: £1,220,862, itemised.
  - Ooosch: €422,027.
  - McKinney: £1M+.
  - Blaa: €80K+, with a community page.
  - R Kings: per-charity totals.
- **Local identity and faces:**
  - Blaa's sloth mascot and Waterford "blaa" bread roll.
  - Lucky Day's "Sammy & the Lucky Day Team".
  - McKinney's presenters (Peter, Cliodhna, Logie).
  - Elite's founders on camera ("Everyone at Elite Competitions is on camera"); a "Dragons' Den" string in its code.
- **Weak spots in identity** (full entity details are in table 2c):
  - McKinney's Terms of Use say "registered in England and Wales" under an NI company number.
  - Blaa shows two company numbers (756201 vs 665869), and its About page reads "Welcome to Lake District Giveaways".
  - Lucky Day spells its company name three ways.
  - Rev Comps' T&Cs name a Gibraltar promoter while the FAQ cites the old UK company.

**For DrawSol**
- The on-chain proofs (program ID, vault, VRF, recompute) are stronger than any letter or badge.
- The human signals are missing: a named promoter with a postal address (CAP 8.17.9 [13]), a complaints route (DCMS 1.2 [11]), and an independent audit statement (CAP 8.25 [13]).

### 3.7 Marketing and retention

**The live-draw ritual**

| Operator | Live draw | Audience (where found) |
|---|---|---|
| McKinney | Nightly, 10:30pm, YouTube, with presenters | YouTube 4.71K; TikTok 40.8k |
| Blaa | 8–11pm several nights; 10 competitions in one stream | YouTube 16.5K; Instagram 35K+ (press) |
| Ooosch | 10pm, Facebook/YouTube; themed days | Claims 26K+ YouTube |
| Lucky Day | Tue/Fri/Sun about 11:15pm, Facebook | Not found |
| R Kings | 22:00 several nights, Facebook | Facebook 422,493; TikTok 28,200 |
| Elite | Tue/Wed/Fri 9pm, Facebook/YouTube; draw-day sales went from 65.4% to 97% sold in about 3 hours | TikTok 158.6k; YouTube 25.4k |
| Rev Comps | Monday 21:00; winners phoned live on air | Facebook 376,273; TikTok 5,972 |
| DCG | Sunday 21:00 (the rest automated) | YouTube 19.5K |
| Omaze / BOTB | No live draws; winner-reveal and judging videos instead | Omaze YouTube 21K |

**Habit loops**
- Daily autodraws: Blaa 9pm, McKinney about 11pm, Elite 10pm, Rev Comps 22:00/23:00, DCG three times a night.
- Free daily or recurring draws:
  - Rev Comps: free £1,000 daily draw, "5x the cash to £5000" if you also spend £2+.
  - Elite: app-only free ticket every 2 hours.
  - Omaze: £10k monthly "Dream List" for marketing opt-ins.
  - DCG: app-only free competitions.
  - BOTB: a sign-up ticket.
- **Early Bird secondary prize (Omaze).** A mid-campaign draw over every entry made before a fixed cut-off: for Yorkshire IV, £100,000 plus a BMW M3 Touring, entries 17 Sep to 11 Oct (postal to 13 Oct), drawn 15 Oct. It rewards entering early without fake scarcity, and a timestamp cut-off is easy to enforce on-chain.

**Subscriptions**
- Omaze: the Subscription tab is selected by default, and entries are 4–6× cheaper per entry. This is its biggest source of 1-star reviews (unexpected renewals, price rises, cancellation friction).
- BOTB Pass: from £9.99.
- Elite Club: £10–£100 a month.
- DCG: basic/plus/luxe tiers.
- Ooosch: "PLUS" on a waitlist.

**Loyalty and credit**
- Ooosch Points: 5%, 10% on Saturdays.
- DCG Dream Points: 1 per £1, 200 on your birthday.
- Rev Comps: 1% cashback plus a £5 birthday credit.
- McKinney: "GET 2% CASHBACK" banner.
- BOTB: "Perks for Playing".

**Referral**
- Rev Comps: 5% of the referee's first order plus a monthly referral draw.
- Elite: £5 each, plus an influencer programme.
- DCG: 50 Dream Points.
- R Kings: affiliate commission.
- BOTB: Awin affiliates.
- For DrawSol, the FCA bans refer-a-friend bonuses in cryptoasset promotions [46], so get advice first.

**Notifications and apps**
- Web push: Lucky Day (asks on page load), Rev Comps (soft-ask), DCG (Bloomreach), R Kings (Braze).
- Apps: DCG iOS (4.86★ from 25,529 ratings), BOTB (iOS, Android, Galaxy), Elite (iOS/Android), Lucky Day (iOS plus a sideloaded APK with "ignore any security warnings").

**Paid acquisition**
- Meta and TikTok pixels everywhere.
- Omaze's attribution dropdown lists Disney+, Netflix, ITVX and others, which suggests heavy TV and streaming spend.

**Over-marketing is a top complaint**
- McKinney: "Two emails a day, every day afterwards".
- Rev Comps: emails continue after unsubscribing.
- BOTB: "Spam emails every day".
- Elite: "they hound and hound you".

### 3.8 Tech stack and payments

| Operator | Front end | Back end / hosting | Payments | Notable |
|---|---|---|---|---|
| McKinney | WebsiteNI PHP (CodeIgniter 4), jQuery, Foundation, Lottie | Cloudflare (Turnstile, Images) | Pay.com (card/Apple Pay/Google Pay/PayPal); Checkout.com and Cashflows code paths; saved cards | `/cart/simulate-payment` ships in production JS; `total_revenue` exposed; Matomo, Klaviyo |
| Blaa | Same WebsiteNI platform | Cloudflare; own WebSocket for live sold counts and winners | Pay.com, Checkout.com, Cashflows; a "zero-payment" gateway for wallet-paid orders | Another tenant's copy and assets leak through; fixed 0.86 FX rate |
| Ooosch | SvelteKit + tRPC | Cloudflare Workers (Durable Objects inferred), separate admin | Checkout.com, Cashflows, BR-DGE; Apple Pay/Google Pay | Spending-limit feature flag on; Mixpanel, Sentry, Survicate |
| Lucky Day | WordPress 7.1.2 + WooCommerce 11.1.2 | nginx behind CloudFront | DNA Payments, Apple Pay/Google Pay, PayPal, Trustly | Firebase push; AI chatbot; 10+ trackers |
| R Kings | Next.js (server-rendered) | Laravel API, CloudFront, S3, Bunny Stream | Checkout.com, PayPal, Apple Pay/Google Pay; wallet top-up | Entry-list CSVs on public S3; Braze CRM |
| Omaze | Shopify theme (Tailwind, Vue) | Shopify | Shop Pay, PayPal, Google Pay (Apple Pay capable) | Spend limit enforced by a checkout extension; PostHog, Optimizely, Dynamic Yield |
| BOTB | Umbraco + AngularJS 1.7.8 + React micro-frontends | CloudFront, Azure App Insights | Card, Apple Pay/Google Pay, Game Credit, Trustly Direct Debit (Pass), Stripe for subscriptions (inferred) | Smartico gamification; 906 KB obfuscated bundle; client-rendered |
| Elite | Next.js + MUI | REST API on Cloud Run, Firebase Realtime DB, Cloudflare | Checkout.com Flow, Apple Pay/Google Pay (debit only) | 20+ trackers; "Connection lost" modal when Firebase drops; instant-win winners' full names via a public API |
| DCG | Next.js App Router on Vercel | API Platform (Symfony) behind Caddy | Checkout.com Frames, Cashflows, PayPal; channel kill-switches | Public JSON API; Bloomreach; A/B tests |
| Rev Comps | Next.js white-label (with Click Competitions) | REST + socket.io | Pay.com/DNA in config; the FAQ says Checkout.com | Romanian iGaming strings ("operated by Sport.com"); 13.9 MB homepage HTML |

**Patterns worth knowing**
- **Gateways are hedged.** Most operators keep two or three card gateways wired up behind switches: DCG's `paymentChannelDisabled*` flags, Ooosch's `activeProvider`, and the Checkout.com code paths at McKinney and Blaa.
- **Real-time is expected.** Blaa (WebSocket), Rev Comps (socket.io), Elite (Firebase) and Ooosch (polling) all update sold counters live.
- **Accidental transparency is common:**
  - McKinney and Blaa: revenue via a public endpoint.
  - R Kings: surnames via its API.
  - Elite: instant-win winners' full names via `/instant-prizes/groups/{id}/winners`, although the page shows first name + initial.
  - Blaa and Ooosch: skill answers in the HTML. DrawSol's current build does the same (`const ANSWER = "Mars"` in the client bundle).
  - Rev Comps: white-label strings.

  DrawSol's transparency should be deliberate.
- **Mainstream buyers expect Apple Pay and Google Pay.** Every operator offers them. DrawSol is wallet-only. That keeps it clear of the credit-card rules (DCMS 1.3), but card-funded on-ramps are an open question [11], and onboarding friction is real.

---

## 4. Regulation

This is research, not legal advice. GB means England, Wales and Scotland.

### 4.1 Great Britain

**The law: Gambling Act 2005**
- **What makes a lottery.** An arrangement is a lottery if people pay, and prizes are allocated by a process that relies wholly on chance [1].
- **The skill test.** A skill process still counts as chance unless it "can reasonably be expected to prevent a significant proportion" of people from winning [1].
- **Complex lottery.** An arrangement is a "complex lottery" if the first of a series of processes relies wholly on chance [1]. This matters for DrawSol: each ticket's instant win is decided by VRF at purchase, before any answer could be checked, so no skill question placed after it can stop the instant-win layer from looking like a lottery. Any future skill model would have to mark the answer before any chance process, or drop instant wins.
- **Offence.** Running an unlicensed lottery is an offence (s.258) [4].
- **The free-entry safe harbour (Schedule 2 para 8)** [2]. A paid scheme is not treated as requiring payment if all four conditions hold:
  1. each person has a real choice to pay or to enter by communication;
  2. the free method is ordinary post, or something "neither more expensive nor less convenient" than paying;
  3. the free route is publicised so it reaches entrants;
  4. prize allocation does not differentiate between paid and free entrants.
- **Paying includes money's worth.** Paying to find out whether you won, or to claim a prize, counts as paying [2].

**Gambling Commission guidance**
- The free route must be promoted "at the same level" as paid [6].
- "Multiple choice questions, or questions that allow a second chance if your first answer is wrong, rarely meet this criteria" [6]. DrawSol's question is both: multiple choice, with unlimited retries.
- From its 2009 paper [7]:
  - pay-after-correct-answer schemes cannot be run as prize competitions (3.18);
  - organisers should be able to prove a skill test works, e.g. with records showing a significant proportion answered wrongly (3.11);
  - all entry methods should be "equally publicised together on the same page" (4.3);
  - web-only free routes should allow three working days, or offer post where there is doubt (4.6);
  - the GC may use the share of entries that came through each route as a starting point when it looks at a scheme (4.7).
- The GC "police[s] the boundary… very closely" (May 2026) [10]. The London Economics report for DCMS said in June 2025 that the GC "has not prosecuted any such cases to date" [12]; we did not check for later cases.

**DCMS Voluntary Code of Good Practice for Prize Draw Operators** [11]
- First published 20 Nov 2025, last updated 1 Sep 2026. Signatories had to comply fully by 20 May 2026.
- Scope: prize draws "in Great Britain" with both paid and free routes. It does **not** cover operators that run only skill-based competitions. So if DrawSol ever went skill-only, the Code would not apply, but the question itself would have to pass the s.14(5) test.
- 189 operator signatories. Named among them: **McKinney, Omaze, BOTB, Elite, DCG and Rev Comps**. **Blaa, Ooosch, Lucky Day and R Kings are not listed.**
- The Code is voluntary, but DCMS "will consider all available options" if it is not followed. Bird & Bird notes the threat of legislation [24].
- The Prize Competition Council (launched 1 Jul 2026, 50+ operators) supports compliance [25].

**Advertising (CAP Code Section 8, enforced by the ASA)** [13]
- 8.15.1: award prizes as described, or a reasonable equivalent, normally within 30 days.
- 8.21.1: no cost to claim a prize.
- 8.15.1 and 8.21.1 now reflect prohibited practices in DMCCA Schedule 20; the Codes were updated on 6 Apr 2025 [13][21].
- 8.17.2: the free route explained "clearly and prominently" in the ad.
- 8.17.4: a prominent closing date that isn't changed.
- 8.17.6: prizes that "could be won" distinguished from those that will be.
- 8.17.9: promoter name and address.
- 8.20: don't exaggerate chances.
- 8.24: "verifiably random" draws.
- 8.25: an "independently audited statement" for instant wins.
- 8.28: entry limits, cash alternatives and winner notification stated before entry; surname and county of major winners published or available.
- CAP also says chance promotions should not be called "competitions" [18].

**Enforcement examples**
- Free route not prominent enough: Omaze (2020), HMV (2018), KS Competitions (2020) [14].
- Team HARD Racing (2021): one free entry against unlimited paid entries, plus four closing-date extensions [19].
- KS Competitions: 70% of sales paid instead of the prize [17].
- Win a Mega Home (2019): £110,070 cash paid instead of a £3m house [16].
- I Can Have It (2018): no closing date disadvantaged consumers [16].
- Raffle House (2019): changing the entry route mid-promotion was upheld [18]. Relevant if DrawSol changes the question or free route on a draw that is already open.
- Royalux (2025): T&Cs changed after the draw [20].
- Amazing Giveaways (2025): prize not awarded because of low sales [21].
- Raffleaid (2022): "insane odds" claims [22].

**What operators actually do with credit cards and spend limits (observed)**
- £250/month credit-card cap and no credit cards on instant wins: BOTB (T&C 9.31) and DCG (Compliance Statement).
- Elite: a £250/month default credit-card limit, and Apple Pay and Google Pay reject credit cards. We found no ban on credit cards for instant wins.
- Rev Comps: £250/month on credit cards; it runs no instant wins, so the instant-win rule does not arise.
- Omaze: £500/month total (£250 on a credit card).
- McKinney is a signatory, yet we found no spend-limit tool on its site.

**Records a regulator or the ASA may ask for** [7][11][13]
- The share of entries from each route (GC 2009 paper 4.7).
- Skill pass/fail evidence, if a question is ever used (3.11).
- Postal-entry logs: received, credited, rejected and why.
- Age and identity checks, and complaints.
- Winners' surname and county for major prizes (CAP 8.28.5), to give the ASA on request.
- Personal data in these records falls under UK GDPR and the DPA 2018.

### 4.2 Northern Ireland

- **The law** is the Betting, Gaming, Lotteries and Amusements (NI) Order 1985, as amended in 2022 [26][27][28]. The GB Gambling Act and GC guidance do not apply; the PSNI enforces [30].
- **Prize competitions (Art. 168).** A paid competition is unlawful unless success depends "to a substantial degree on the exercise of skill" [26].
- **Since 2022, payment is what matters.** An arrangement is not a lottery or competition unless payment is required. Schedule 15A sets out the same four free-entry conditions as GB [27][28].
- **Department for Communities guidance** points to the GB GC tests: multiple-choice questions "rarely seem to meet" them. Penalties go up to a fine plus 2 years in prison [29].
- **Advertising and the Code.** The CAP Code applies UK-wide [13]. The DCMS Code is written for GB, but NI-based McKinney has signed it [11].
- **NI operators in this report:** McKinney, Lucky Day and R Kings all run paid draws with a postal free route and govern their T&Cs by English law.

### 4.3 Republic of Ireland

- **The law today is still the Gaming and Lotteries Act 1956** (as amended in 2019).
  - "Lottery" is broad, and promoting one needs a permit or licence.
  - The Garda permit caps prizes at €5,000 and tickets at €10.
  - The District Court licence is charitable only, with at least 25% of proceeds to good causes.
  - Exemptions: s.26A (charitable, prizes ≤ €1,000, tickets ≤ €5, ≤ 1,500 tickets) and s.27A product promotions (prizes up to €2,500, no charge other than buying the product, nothing to pay to redeem the prize) [32].
  - There is **no GB-style free-entry safe harbour** in the Act text reviewed [32].
- **Practitioners' view.** Organisers "typically seek to avoid this prohibition by making entry to the competition free or by requiring a test of skill" [40].
- **ASAI Code (Irish advertising code)** [41]
  - 5.53: "a prize promotion which involves purchase requires a test of skill".
  - 5.33: low entries are no basis to extend or withhold prizes "unless that right was explicitly reserved at the outset". So in Ireland, a clause reserved up front, like Ooosch's T&C 8.8 (four extensions, then 70% of takings), is not ruled out by 5.33 alone; it still contradicts Ooosch's own on-page promise. The UK position is stricter (DCMS 2.5; Team HARD Racing; KS Competitions) [11][17][19].
  - 5.34: publish winners' names and counties.
  - 5.37: "an independent observer should supervise the draw".
- **Gambling Regulation Act 2024 (GRA)**
  - Signed 23 Oct 2024; the regulator (GRAI) was set up in March 2025.
  - Remote betting licences started on 1 Jul 2026.
  - Gaming and lottery licence applications open "throughout 2027 and 2028" [35].
  - S.I. 31/2026 did **not** commence the GRA's game and lottery prohibitions, nor the repeal of the 1956 Act [34].
  - Licensed games will be capped at €10 stakes and €3,000 winnings (variable by the GRAI). Credit cards are banned. ID and age must be verified before an account opens, and players must be able to set spend limits [33][37][38].
  - Exemptions in the GRA: s.92 charitable lotteries (winnings up to €2,000, entry ≤ €5, ≤ 1,500 tickets) and s.93 lotteries run alongside selling or marketing a product (winnings up to €5,000, paid within 6 months) [33].
  - Enforcement and advertising, per A&L Goodbody: fines up to €20m or 10% of turnover, a 5:30–21:00 broadcast watershed, and social-media ads only to people who follow the account [37].
  - Whether *paid skill competitions* count as GRA "games" is **unresolved**; Ogier says skill or free entry avoids a licence but cites no section [39].
- **How Irish operators structure it (observed).**
  - Blaa and Ooosch, the two Irish-run operators, are the ones that still ask a skill question, alongside a postal free route.
  - Blaa takes the answer before payment, excludes wrong answers without a refund (per its T&Cs), and calls the question "deliberately… tough".
  - Ooosch frames its draws as UK s.14 prize competitions with a Schedule 2 free route, through an NI agent.
- **Irish guidance or enforcement specific to online prize competitions** (GRAI, CCPC or Gardaí): not found.

### 4.4 Crypto

- **Paying in SOL is still payment, and SOL prizes are still prizes.** Paying "includes transferring money's worth" in GB [2] and NI [28]. Whether crypto is "money" under Ireland's GRA: not found; get advice [33].
- **The Gambling Commission rates cryptoassets "high-risk"** for money laundering, and expects full source-of-funds evidence and handling of value swings [44][44b]. Guidance specific to crypto prize draws: not found.
- **Promotions.**
  - UK cryptoasset promotions must use one of four lawful routes (FSMA s.21); refer-a-friend bonuses are banned [45][46].
  - Whether a prize-draw ad offering SOL prizes is a "financial promotion": not found; get advice.
  - The UK cryptoasset authorisation regime fully commences on 25 Oct 2027 [47].
  - MiCAR applies in Ireland [48].
  - ASA crypto rulings require disclosure of wallets, gas fees and volatility [23].
- **The devnet demo** may truthfully claim what can be checked on-chain: escrow, an immutable close, recomputable VRF, and permissionless settle and refund. It should say "Devnet demo – play money (devnet tokens are not real)" [49]. It should **not** claim legality, compliance, DCMS signatory status, "free entry compliant", "skill competition" or "competition" [18], or use investment framing [23]. SPEC §4.1 already bans "not a lottery" and "legal" claims [50].

### 4.5 DCMS Code checklist mapped to DrawSol

Status key: **Meets** / **Partial** / **Gap** / **N/A** (for a devnet demo). "Who does it well" points at observed operators.

| Clause | Requirement (short) | DrawSol today | Status | Who does it well / fix |
|---|---|---|---|---|
| 1.1 | 18+ only, with reasonable age verification | 18+ checkbox in the confirm step | **Gap** (Partial for a demo) | KYC or age verification at account level on mainnet. Irish GRA s.169 requires photo-ID verification for licensees [33] |
| 1.2 | Transparent complaints process plus dispute resolution | None | **Gap** | Omaze (2 days to acknowledge, 28 to respond, escalation), Ooosch (5 business days, 4 weeks), R Kings (5 working days) |
| 1.3 | Credit card ≤ £250/month; none for instant win, including via money service businesses | No cards (SOL only) | **N/A / unclear** | Card-funded on-ramps may count as a "money service business" route [11]; get advice |
| 1.4 | Monthly spend limits across all draws; £0 allowed | Per-draw, per-wallet ticket cap only | **Gap** | BOTB (£0 limit, cooling-off on increases), Omaze (£500/month enforced at checkout), R Kings, Elite, DCG, Rev Comps, Ooosch |
| 1.5 | Suspension ≥ 6 months plus permanent closure | None | **Gap** | BOTB (6 or 9 months), Elite (1/3/6 months), R Kings (closure wizard), Rev Comps |
| 1.6 | Monitor for harm from account opening | None (wallets are pseudonymous) | **Gap** | Omaze says it monitors "for potentially unhealthy patterns" |
| 1.7 | Proportionate intervention, up to stopping play | None | **Gap** | Mainnet operations |
| 1.8 | Signpost support services | BeGambleAware link in the Rules | **Partial** | BOTB lists Citizens Advice, Money Advice Trust, National Debtline, Samaritans, Mind |
| 1.9 | An appropriate period between opening and conclusion | A sell-out can end a draw at any time | **Partial** | Set a minimum open period; draw at a published time (see P1-3) |
| 1.10 | Instant-win draws: free entry equivalent; instant wins not the majority of competitions | Free entries get no instant roll; every draw has instant wins | **Gap** | BOTB (15.2), Elite (5.1(b)), Lucky Day (4.1B) and R Kings (4.1(b)) give postal entries instant-win chances; DCG takes instant-win postal entries. Run some draws with no instant tiers |
| 1.11 | Socially responsible marketing (CAP/BCAP) | Honesty rules in SPEC §4.1; no campaigns yet | **Partial** | Avoid the over-messaging at McKinney, Rev Comps and BOTB |
| 2.1 | Clear summary of how each draw works, including that prizes are awarded by chance | Rules section with four guarantees | **Partial** | Add an explicit "prizes are awarded by chance" line |
| 2.2 | Verifiably random and auditable; equal chance of *each* prize for paid and free entries; publish the mechanism | ORAO VRF, browser recompute, mechanism published; but free entries can't win instant prizes | **Partial** | VRF exceeds every operator's method; fix free-entry equality |
| 2.3 | Likelihood of winning before entry | Odds per ticket, cap and instant hit rate on the board | **Meets** | DCG's "1 in 1.79" line is the model |
| 2.4 | Free entry clear and prominent before purchase; post or equally cheap and convenient; time for entries to arrive | Fine-print line under the buy panel (SPEC puts it in Rules); needs a wallet and fees; 1 per wallet; separate 5% cap; an instant draw at sell-out leaves no time | **Gap** | McKinney, Lucky Day, BOTB, DCG, Rev Comps (tab beside paid), Omaze (first tab) |
| 2.5 | Award the advertised prize; never reduce it, move the end date or cancel for low sales | Prize escrowed; `closes_at` immutable; draws with ≥1 ticket | **Meets** for the grand prize (better than the field: enforced by code). Instant wins can be paid short if the reserve runs out | Disclose the zero-ticket and VRF-timeout cancellation paths, the instant-win reserve rule, and that the unspent reserve returns to the operator |
| 2.6 | Charity transparency | No charity element | **N/A** | — |
| 3.1 | Monitor own compliance | None | **Gap** (ops) | — |
| 3.2 | Third parties (affiliates) bound by contract | No affiliates | **N/A** | — |
| 3.3 | Share best practice | — | **N/A** | Prize Competition Council [25] |
| 3.4 | Publish measures on the website | Rules section and fairness proofs | **Partial** | DCG compliance statement; Rev Comps Mindful Play page |
| 3.5 | Work with DCMS | — | **N/A** | Contact prizedrawcode@dcms.gov.uk only if seeking signatory status [11] |

**Other rules with DrawSol gaps:**
- CAP 8.17.9: promoter name and address [13].
- CAP 8.25: an independently audited statement for instant wins [13].
- CAP 8.28.5 and ASAI 5.34: surname and county of major winners; a wallet address is not enough [13][41].
- ASAI 5.37: an independent observer [41].
- Team HARD Racing: free entries limited to 1 while paid entries can reach 50 [19].
- Record keeping (GC 4.7 and 3.11; postal logs; age/ID checks under UK GDPR): DrawSol keeps none off-chain today [7][11].

---

## 5. DrawSol vs the field

### 5.1 Where on-chain lets DrawSol beat them

| Area | The field | DrawSol | Why it matters |
|---|---|---|---|
| **The guaranteed draw** | A promise in copy. Ooosch's T&C 8.8 allows extensions and then 70% of takings. Rev Comps' guarantee is only in the FAQ, and its T&C 8.5 allows extending, shortening or cancelling for causes beyond its control. McKinney's T&Cs reserve "void, suspend, cancel, or amend". Elite's T&C 2.6 lets it end a promotion early on 3 clear days' notice. | The prize is escrowed at `create_draw`; `closes_at` can't change; anyone can trigger the draw | Turns DCMS 2.5 and CAP 8.17.4 from a promise into a property. Sidesteps the Amazing Giveaways, KS and Win a Mega Home failure modes |
| **Entry lists** | Only R Kings, DCG and Rev Comps publish them, and R Kings pads them with "Redra W". Ooosch gates its list; the rest publish none. | Every Entry is a public account; the live entries board already exists | Answers the most common complaint ("can't find who won", "rigged"). Shows the real sold count at close, never filler |
| **Randomness** | Google RNG on a laptop (Blaa, Lucky Day, R Kings); ball machines (Ooosch, Elite, Rev Comps); letters and certificates (BOTB, McKinney, Ooosch); PHP `random_int` (DCG) | ORAO VRF; anyone can recompute the winner and every instant roll with `fairness.ts` | Exceeds CAP 8.24 and DCMS 2.2 "verifiably random and auditable" without needing trust |
| **Instant-win fairness** | Hidden numbers with statistically odd results (Lucky Day); published numbers that can sit on unsold tickets (R Kings, Blaa); no proof the numbers weren't changed | Every ticket gets an independent, provable roll at the advertised odds, whatever the sales | No "big prizes never drop" suspicion, and no unwon prizes on unsold numbers |
| **Instant-win value** | Padded with sub-ticket credit; site credit that expires (BOTB 72h, Elite and DCG 12 months) | Smallest tier equals the ticket price, paid in SOL to the wallet in the reveal transaction | A clean "every instant win is at least your ticket back, in real money" message |
| **Payout speed** | Ooosch: Verify → Claim → Withdraw, a €1 test payment, 5–7 days. Elite: 48h for cash. Omaze: £1M paid in 12 instalments. | Winner paid in the settle transaction; instant wins in the reveal transaction | Removes the payout-friction complaints |
| **Operator risk** | You trust the company to draw and pay | Permissionless `request_draw` / `settle_draw`; refunds if VRF times out | "If the operator disappears, the winner still gets paid" (SPEC §1) |
| **Live draw** | A filmed RNG, which reviewers call "pre recorded" (R Kings, Lucky Day) | Pressing "Run the draw" on stream *is* the draw; the VRF fulfilment and settle transaction are public | The live show becomes evidence, not just theatre |
| **Stats and counters** | Stale or inflated (Ooosch, BOTB, Elite, DCG, Rev Comps) | All numbers come from chain (SPEC §4.1) | Can't drift |
| **Privacy** | Full names published (McKinney, Blaa, DCG); full names via API behind a masked page (R Kings surnames; Elite instant-win winners); revenue leak (McKinney, Blaa) | Wallet addresses; deliberate transparency | Less PII risk. But CAP 8.28.5 still needs surname and county *available* for major winners |
| **Friction** | Login walls before checkout (Ooosch, R Kings, BOTB, Elite, Lucky Day) | Wallet connect is the only gate | Fewer steps for crypto-native users |

### 5.2 Where DrawSol is behind

| Area | The field | DrawSol gap |
|---|---|---|
| **Free entry** | A postal route on every draw, usually as a sibling tab. Instant-win eligible under the T&Cs of BOTB, Elite, Lucky Day and R Kings; DCG takes instant-win postal entries; Ooosch treats free entries "in exactly the same way as paid". As many entries as paid (Elite). Stamp-value parity (Lucky Day, R Kings, DCG). Weak spot: receipt is rarely confirmed, and R Kings reviewers say postal entries never reached the lists | 1 per wallet, grand draw only, a separate 5% cap, needs a wallet and fees, shown as fine print. No postal route. A sell-out draws immediately, so posted entries can't arrive |
| **Skill / legal model** | Most have dropped the question and run as prize draws with a free route; BOTB uses real skill where it claims skill | A UI-only multiple-choice question with unlimited retries and the answer in the client bundle; it buys no legal cover, and instant wins are decided before it anyway |
| **Responsible play** | Spend limits plus breaks or self-exclusion at 6 of 10 operators (BOTB, R Kings, Elite, DCG, Rev Comps, and Omaze with its £0 limit locked for 6 months). Ooosch offers monthly spending limits only. McKinney offers breaks and self-exclusion but no spend limit; Blaa and Lucky Day offer one FAQ sentence | Per-draw wallet caps only; multiple wallets bypass them |
| **Catalogue and cadence** | 16–280 live draws; nightly autodraws; weekly live shows | One draw at a time; no schedule |
| **Keeping players informed** | Emails, web push and apps (DCG, Elite, Rev Comps, R Kings) | Players must come back to check; nothing tells them the draw settled |
| **Payments** | Apple Pay, Google Pay, PayPal and cards everywhere | Wallet-only SOL; real onboarding friction for mainstream IE/UK buyers |
| **Human trust signals** | Named company, address, phone, complaints SLA, Trustpilot, winner photos and videos, presenters | Program ID and proofs only; no promoter identity, complaints route or audit statement |
| **Instant-win liability** | Fixed pre-allocated tables cap the payout. Some say where unwon value goes (Ooosch: future free giveaways; DCG: back into the prize pool) | Independent rolls can, in theory, drain the reserve; the reveal then pays `min(total, reserve remaining)`, which must be disclosed. The unspent reserve goes back to the operator via `withdraw`, also undisclosed |
| **Winner records** | Surname and county published or available (CAP 8.28.5) | Wallet address only |
| **Age verification** | DOB at registration (Ooosch, R Kings, Elite, DCG); ID for big winners | Checkbox only |

---

## 6. Recommendations (prioritised backlog)

**Effort:** S is under a day, M is 1–3 days, L is more than 3 days or needs an outside party.
**Type:** FE = frontend only; PROG = program change (redeploy, IDL update); OPS = operations, marketing or legal.

### P0: before the demo link goes in front of judges or users

| ID | Change | Rationale (who does it / which rule) | Effort | Type |
|---|---|---|---|---|
| P0-1 | **Make free entry a sibling tab in the buy panel** ("Buy tickets / Free entry"), equal visual weight, with plain rules. Mirror it on mobile. Ship it in the same release as P0-2 so the tab can say "A free entry has the same chance as one paid ticket". If P0-1 ships first, the line must read "the same chance of the grand prize as one paid ticket; free entries don't get an instant-win roll yet", because that is what the program does today. | McKinney, Lucky Day, BOTB, DCG and Rev Comps (tab beside paid), Omaze (first tab). Ooosch hiding it on mobile is the anti-pattern. GC "equally publicised together on the same page" [6][7]; CAP 8.17.2 [13]; DCMS 2.4 [11]; ASA Omaze/HMV/KS [14] | S | FE |
| P0-2 | **Give free entries an instant-win roll, and keep the reserve solvent.** `claim_free_entry` requests ORAO VRF like `buy_tickets`, creates the Entry unrevealed, and `reveal_entry` accepts free entries. Free entries have `paid_lamports = 0`, so their rolls are a cost with no matching revenue. Specify: (a) reserve sizing at `create_draw` that covers paid **and** free tickets (today's check, expected payout per ticket < `ticket_price`, assumes every ticket is paid); (b) who pays the ORAO fee and Entry rent for a free claim (the operator or a sponsor, not the claimant, so the free route costs the entrant nothing); (c) whether that rent is ever reclaimed, since the SPEC has no instruction that closes an Entry. | BOTB (T&C 15.2: postal entries generate instant-win participation), Elite (5.1(b), including wheel spins), Lucky Day (4.1B) and R Kings (4.1(b)) (RNG numbers for free entrants), DCG (instant-win postal entries), Ooosch (0.2), Blaa (postal gives instant-win credit). Schedule 2 para 8(1)(d) [2]; DCMS 1.10 and 2.2 [11]; London Economics warning [12] | M | PROG + FE |
| P0-3 | **Stop leaning on the UI-only skill question.** For the demo, remove it from the confirm step and describe DrawSol as a "prize draw concept with a free entry route". Apply this from the next `create_draw`: publish new terms without the question and commit their hash as `terms_hash` (SPEC: it commits to "the published terms + skill question + odds"). Leave any already-open draw on the terms its hash commits to, because changing the entry route mid-promotion is what the ASA upheld against Raffle House [18]. Keep a written decision. Revisit only with real skill (judged or non-searchable, answer marked before payment *and* before any chance process, wrong answers excluded from *all* prizes, pass/fail records kept) or for Ireland on counsel's advice. | Today's question fails on its own facts: multiple choice, unlimited retries with right/wrong feedback, and the answer (`"Mars"`) in the client bundle. The GC says multiple-choice questions, "or questions that allow a second chance if your first answer is wrong, rarely meet this criteria" [6]. Instant wins are decided by VRF at purchase, before any answer, which looks like a s.14 complex lottery [1]. McKinney, Lucky Day, R Kings, Omaze, Elite and Rev Comps ask no question; Blaa's and Ooosch's leak the answer, and Ooosch accepts wrong ones. NI "substantial degree" [26][29]; CAP: don't call chance promotions "competitions" [18]; the DCMS Code does not cover skill-only operators [11]; ASAI 5.53 for IE [41] | S | FE |
| P0-4 | **One-line guarantee beside Buy, scoped to the grand prize:** "Drawn at {closes_at, absolute time} or when all {cap} tickets sell, whichever comes first. Grand prize already locked: {X} SOL ↗. The draw is never extended and the grand prize is never reduced." Do not extend "never reduced" to instant wins: the reveal pays `min(total, reserve remaining)`, so they can be paid short (see P0-5). | Rev Comps, Blaa, DCG, Elite, Lucky Day. DCMS 2.5 [11]; CAP 8.17.4 [13]. DrawSol can link proof; nobody else can | S | FE |
| P0-5 | **Honest instant-win table.** Per tier: amount, odds, wins so far against expected, reserve left. State the reserve rule ("if the reserve runs out, wins are paid up to what's left") and "Smallest instant win = your ticket price back". Show the hit rate as "1 in N tickets", like DCG. Say what happens to the reserve nobody wins: it returns to the operator, who can withdraw it 7 days after close even if some tickets are unrevealed; after that withdrawal those tickets can no longer be paid (SPEC `RESERVE_UNLOCK_SECS`). Prompt holders to reveal before then. | DCG ("1 in 1.79"), McKinney, R Kings, BOTB and Elite counters. Ooosch (unwon value to free giveaways) and DCG (back into the prize pool) say where unwon value goes. CAP 8.17.6 and 8.20 [13]; ASAI 5.40–5.41 [41]; DCMS 2.3 [11]. Avoids the "1 in 8" padding at Blaa | S | FE |
| P0-6 | **A permanent page per draw** (never 404): winning ticket, winner wallet, VRF request and fulfilment, settle transaction, "recompute", sold vs cap at close, and the **full searchable entry list with a CSV download**. | R Kings (CSV), DCG (search, "Tickets sold x / max"), Rev Comps (winner pinned on top, draw time to the second), BOTB (verification letter for House and Dream Car draws). Lucky Day's 404s are the anti-pattern. CAP 8.24 [13]; DCMS 2.2 [11] | S–M | FE |
| P0-7 | **Buy-panel polish.** Already built: stepper, presets 1/5/10/25, a total row, "You can still buy N" in the ledger, and no pre-ticked consents. New: **change the default from 10 to 1** (`useState(10)` in `BuyContext.tsx`); add a "Max (N)" preset equal to the remaining allowance; put the live total inside the Buy button ("Buy 5 tickets · 0.05 SOL"). | R Kings (total in CTA, max = allowance), BOTB ("MOST CHANCES"), Rev Comps ("CHOOSE MAX"). Avoid the high defaults at R Kings, BOTB, DCG and Elite, and the pre-ticks at Lucky Day and R Kings | S | FE |
| P0-8 | **Honest framing check:** "Devnet demo – play money (devnet tokens are not real)"; never "competition", "legal", "compliant" or "DCMS"; demo odds labelled boosted. | [49][50][18][23]; SPEC §4.1 | S | FE |

### P1: next, and before any mainnet planning

| ID | Change | Rationale | Effort | Type |
|---|---|---|---|---|
| P1-1 | **Free-entry parity, staged.** Full parity (free entries up to the same per-person maximum as paid, inside one ticket cap, no separate `free_cap`) only works once one person cannot farm wallets, so it ships with verified accounts (P2-2). On devnet until then: (a) give each wallet free entries up to its paid maximum; (b) keep free claims from triggering the sell-out (today `request_draw` already keys off `paid_tickets`, so keep it that way); (c) keep a published ceiling on the free share, and list it as a known gap, because a ceiling that runs out removes the "genuine choice" [2][11]. Do **not** add a per-period rate limit on free claims: a wait that paid buyers don't face may fail Schedule 2's "neither more expensive nor less convenient" test [2]. | Elite (as many postal entries as paid), McKinney and Blaa (multiple postal entries, each sent separately), stamp parity at Lucky Day, R Kings and DCG. Team HARD Racing [19]; Schedule 2 para 8(1)(a) and (b) [2]; DCMS 2.4 ("no genuine choice") [11] | M (interim) / L (with P2-2) | PROG |
| P1-2 | **A postal free-entry route run by DrawSol, with on-chain receipt.** Postcard with name, address and wallet; the operator credits the entry on-chain (a new operator-signed `credit_free_entry`, fees and rent paid by the operator, with an instant-win roll as in P0-2). Publish a postal log: received, credited (with the transaction link) or rejected and why, so every entrant can check their own entry. | All ten operators offer post. Most don't confirm receipt (McKinney 3.10, Ooosch 16.5, R Kings 3.11(h)), and R Kings and Rev Comps reviewers complain about it. Schedule 2 allows ordinary post [2]; the GC advises post where in doubt [7]; DCMS 2.4 [11]; GC 4.7 (route share of entries) [7] | M | PROG + OPS |
| P1-3 | **Separate "sales close" from "draw time".** A sell-out ends paid sales; the draw runs at a published time **at least 2 business days after paid sales end**, so posted entries from P1-2 can arrive and be credited. Set a minimum open period too. | BOTB T&C 10.2 (draw "no earlier than the second business day following the end of the Promotion Period"); Omaze (postal cut-off two days after the online close, draw four days after it); DCG (instant-win postal entries accepted up to 48h after close); McKinney (next working day after sell-out). DCMS 1.9 and 2.4 [11]; GC three working days for web routes [7] | M | PROG + FE |
| P1-4 | **Many draws and a schedule:** small nightly draws (low caps, short windows) plus one weekly headline draw where "Run the draw" and "Settle" are pressed live on stream at a fixed time. Homepage rails: Draws tonight / Just launched / Sold out. Run some draws with **no** instant tiers (the program already allows unused tiers). | McKinney, Blaa, Rev Comps, Elite and DCG cadence; Rev Comps' Monday show. DCMS 1.10: instant-win draws should not be the majority [11] | M | FE + OPS |
| P1-5 | **Wallet-level responsible play:** a per-wallet profile account across draws with a self-set monthly spend cap (decreases immediate, increases after a cooling-off; £0 allowed), take-a-break and self-exclusion, checked in `buy_tickets`. Prompt for a limit after the first purchase. Denominate the cap in fiat (e.g. GBP/EUR converted with an on-chain oracle price at purchase), not SOL, so it holds through SOL price swings. A per-wallet cap is only a demo: for mainnet it depends on P2-2, because multiple wallets bypass it. | BOTB, R Kings, Elite, DCG, Rev Comps (limit prompt after purchase), Omaze; Ooosch (limits only). DCMS 1.4 and 1.5, which the regulation research reads as needing fiat-equivalent limits for crypto [11][44]; Irish GRA s.164 [33] | L | PROG + FE |
| P1-6 | **Tell people the result.** Show "your draw settled" in My tickets; opt-in email or wallet notification on settle; at most one draw-day reminder. | Complaints at McKinney, Lucky Day and Omaze about missing results; Rev Comps emails all entrants after each draw. Avoid the spam complaints at McKinney, Rev Comps and BOTB | M | FE + OPS |
| P1-7 | **Live winners feed and chain-computed counters:** "Another winner, 2 min ago, 0.05 SOL, won for 0.01 SOL ↗", plus SOL paid out, winners and draws settled. | BOTB ("Another winner. Now."), DCG live feed, Blaa Live Winners. Avoids the stale counters at Ooosch, BOTB and Rev Comps | S | FE |
| P1-8 | **"Provably fair" page and a per-draw verification receipt** (BOTB letter format: draw ID, open/close, an entry snapshot hash, VRF request/proof, winning ticket, winner). Commission an independent review of the program and `fairness.ts`. | BOTB (PromoVeritas), Ooosch (/rng-certification with plain FAQs), McKinney (GLI badge). CAP 8.25 audited statement for instant wins [13]; ASAI 5.37 [41] | S (page) / L (audit) | FE + OPS |
| P1-9 | **Promoter identity and terms basics:** legal name and postal address, a complaints route with response times, a terms page covering entry limits, how winners are told, the cancellation paths (zero tickets, VRF timeout), and "prizes are awarded by chance". | Omaze, Ooosch and R Kings complaints SLAs; DCG compliance statement. CAP 8.17.9 and 8.28 [13]; DCMS 1.2, 2.1, 3.4 [11] | S | FE + OPS |

### P2: later, mostly mainnet

| ID | Change | Rationale | Effort | Type |
|---|---|---|---|---|
| P2-1 | **Optional pre-allocated instant-win mode with an on-chain commitment.** Commit a Merkle root of winning ticket numbers and tiers before sales; reveal per ticket; publish what happens to unsold winners. **Note:** DrawSol issues ticket numbers sequentially, so published winning numbers could be sniped by timing. This mode needs VRF-randomised ticket assignment, or numbers kept hidden until reveal and proven against the commitment. | McKinney, Blaa, Ooosch, R Kings and DCG publish numbers but can't prove they never changed; Lucky Day, BOTB and Elite hide them. Gives a fixed liability and "N winning tickets" marketing ("165,000 winning tickets", McKinney Lucky Wheels) | L | PROG + FE |
| P2-2 | **Verified accounts and off-chain records:** age/ID verification at wallet-binding (the prerequisite for full free-entry parity in P1-1 and for fiat spend limits in P1-5), plus records the chain can't hold: winners' surname and county (CAP 8.28.5, ASAI 5.34), the share of entries by route (GC 4.7), postal logs, age/ID checks and complaints, kept under UK GDPR. | DCMS 1.1 [11]; GRA s.169 [33]; CAP 8.28.5 [13]; ASAI 5.34 [41]. Ooosch, R Kings, Elite and DCG take DOB; ID for winners at BOTB, Elite and Ooosch | L | OPS + FE |
| P2-3 | **Harm monitoring and intervention**, plus the full support-services signposting list. | DCMS 1.6–1.8 [11]; BOTB's footer list | M | OPS + FE |
| P2-4 | **Light loyalty:** SOL cashback (Rev Comps 1%, Ooosch 5%) or an early-bird price by ticket index (Rev Comps: cheaper until a date or 50% sold, "never discount late"). Referral **only after** FCA advice. | Rev Comps, Ooosch, DCG, Elite. Refer-a-friend ban in crypto promotions [46]; FSMA s.21 [45]. Note that early-bird pricing trades away the "every lamport buys the same odds" principle | M | PROG |
| P2-5 | **Cash/SOL alternative** if physical prizes are ever offered, stated in the title ("X or Y SOL"). | McKinney, R Kings, DCG, BOTB (70% RRP default), Rev Comps (151 of 280). CAP 8.28.2 [13]; DCMS 2.5 [11] | M | OPS |
| P2-6 | **Charity draws** with an automatic on-chain donation split and a totals page. | Omaze (£1M per house), Rev Comps (itemised £1.22M), Ooosch, McKinney, Blaa, R Kings. DCMS 2.6 [11] | M | PROG + OPS |
| P2-7 | **Fiat on-ramp / Apple Pay** only after advice on DCMS 1.3 (cards via money service businesses), FCA promotions and MiCAR. | Every operator offers Apple Pay and Google Pay; [11][45][47][48] | L | OPS |
| P2-8 | **Jurisdiction gating that actually blocks** (not Omaze's warn-only pop-up); do **not** launch in Ireland without Irish counsel. | Omaze lets non-UK visitors reach checkout; IE law in flux [32][34][35][39]; GRA fines up to €20m or 10% of turnover [37] | M | FE + OPS |
| P2-9 | **Early Bird secondary prize enforced on-chain.** A second escrowed prize drawn by VRF mid-campaign over every Entry created before a fixed timestamp (free entries included), announced at `create_draw`. | Omaze's Early Bird (£100,000 plus a BMW M3 for entries before 11 Oct, drawn 15 Oct). A timestamp cut-off is a natural on-chain rule; free entries must be eligible on the same terms [2] | M | PROG + FE |

### Do not copy

| Anti-pattern | Where we saw it |
|---|---|
| Placeholder filler entries | R Kings |
| Hidden instant-win numbers | Lucky Day, BOTB, Elite |
| Sub-ticket "wins" counted as prizes | Elite, DCG, BOTB, Blaa, Lucky Day |
| Expiring site credit | BOTB 72h; Elite and DCG 12 months |
| Pre-ticked consents | Lucky Day, R Kings, Omaze |
| High default quantities | R Kings, BOTB, DCG, Elite (and DrawSol's own current default of 10) |
| Skill answers shipped to the browser, or retries allowed | Blaa, Ooosch (and DrawSol's current confirm step) |
| Subscription defaults | Omaze |
| Stacked upsells | Omaze, Elite |
| Countdown pop-ups covering stats | DCG |
| Push prompts on first load | Lucky Day, Rev Comps |
| Revenue and PII leaks via public APIs | McKinney, Blaa, R Kings, Elite |
| Silent postal routes (no receipt) | McKinney, Ooosch, R Kings, Rev Comps |
| Stale hard-coded stats | Ooosch, BOTB, Rev Comps, Lucky Day |
| T&Cs that contradict page copy | Ooosch, Blaa, McKinney, Rev Comps |
| Spend-gated prize boosts. Free entrants winning a smaller prize may conflict with "no differentiation" [2]. | Rev Comps "5x if you spend £2+", BOTB "Prize Boost", DCG "Spend £1+ to receive Ninja Creami" |

---

## 7. Sources

### 7.1 Regulation (numbered citations used above)

- [1] Gambling Act 2005 s.14 — https://www.legislation.gov.uk/ukpga/2005/19/section/14
- [2] Gambling Act 2005 Schedule 2 — https://www.legislation.gov.uk/ukpga/2005/19/schedule/2
- [3] Gambling Act 2005 s.339 — https://www.legislation.gov.uk/ukpga/2005/19/section/339
- [4] Gambling Act 2005 s.258 — https://www.legislation.gov.uk/ukpga/2005/19/section/258
- [5] Gambling Act 2005 s.6 — https://www.legislation.gov.uk/ukpga/2005/19/section/6
- [6] Gambling Commission, Free draws and prize competitions (updated 23 Oct 2024) — https://www.gamblingcommission.gov.uk/public-and-players/guide/page/free-draws-and-prize-competitions
- [7] Gambling Commission, Prize competitions and free draws: the requirements of the Gambling Act 2005 (Dec 2009) — https://assets.ctfassets.net/j16ev64qyf6l/3pj85vOPWgkchLNLVUs9PV/92c9622bea378560e4ecb375e3f94364/Prize-competitions-and-free-draws-the-requirements-of-the-gambling-act-2005.pdf
- [8] Gambling Commission, When is a lottery not a lottery? (updated 20 Mar 2025) — https://www.gamblingcommission.gov.uk/guidance/lotteries-and-the-gambling-act-2005/lotteries-and-the-ga05-when-is-a-lottery-not-a-lottery
- [9] Gambling Commission, Understanding the consumer landscape in free draws and prize competitions (22 Jan 2026) — https://www.gamblingcommission.gov.uk/report/understanding-the-consumer-landscape-in-free-draws-and-prize-competitions
- [10] Gambling Commission, Ian Angus speech, Lotteries Council 2026 (21 May 2026) — https://www.gamblingcommission.gov.uk/news/article/lotteries-council-annual-conference-2026-ian-angus-speech
- [11] DCMS, Voluntary Code of Good Practice for Prize Draw Operators (20 Nov 2025, updated 1 Sep 2026) — https://www.gov.uk/government/publications/voluntary-code-of-good-practice-for-prize-draw-operators/voluntary-code-of-good-practice-for-prize-draw-operators
- [12] DCMS / London Economics, Online prize draws and competitions market study (26 Jun 2025) — https://www.gov.uk/government/publications/research-report-online-prize-draws-and-competitions-market-study-assessment-of-harm-and-review-of-potential-interventions
- [13] CAP Code Section 08, Promotional marketing — https://www.asa.org.uk/type/non_broadcast/code_section/08.html
- [14] CAP AdviceOnline, Free entry routes — https://www.asa.org.uk/advice-online/promotional-marketing-free-entry-routes.html
- [15] CAP AdviceOnline, Instant wins — https://www.asa.org.uk/advice-online/promotional-marketing-instant-wins.html
- [16] CAP AdviceOnline, High value prize promotions — https://www.asa.org.uk/advice-online/promotional-marketing-high-value-prize-promotions.html
- [17] CAP AdviceOnline, Prize draws — https://www.asa.org.uk/advice-online/promotional-marketing-prize-draws.html
- [18] CAP AdviceOnline, Competitions — https://www.asa.org.uk/advice-online/promotional-marketing-competitions.html
- [19] ASA Ruling, Team HARD Racing Ltd (17 Mar 2021) — https://www.asa.org.uk/rulings/team-hard-racing-ltd-a20-1083038-team-hard-racing-ltd.html
- [20] ASA Ruling, Royalux Competitions Ltd (15 Jan 2025) — https://www.asa.org.uk/rulings/royalux-competitions-ltd-a24-1255202-royalux-competitions-ltd.html
- [21] ASA Ruling, Amazing Giveaways Ltd (13 Aug 2025) — https://www.asa.org.uk/rulings/amazing-giveaways-ltd-a25-1290725-amazing-giveaways-ltd.html
- [22] ASA Ruling, Clarson Ltd t/a Raffleaid (12 Oct 2022) — https://www.asa.org.uk/rulings/clarson-ltd-a22-1148028-clarson-ltd.html
- [23] ASA Ruling, FanCraze Technologies Inc (15 Nov 2023) — https://www.asa.org.uk/rulings/fancraze-technologies-inc-a23-1199796-fancraze-technologies-inc.html
- [24] Bird & Bird, Cracking the Code (Nov 2025) — https://mediawrites.twobirds.com/post/102lvf6/cracking-the-code-dcms-publishes-voluntary-code-of-good-practice-for-prize-draw
- [25] SBC News, Prize Competition Council launches (1 Jul 2026) — https://sbcnews.co.uk/europe/uk/2026/07/01/prize-competition-council-launches/
- [26] NI Order 1985 art.168 — https://www.legislation.gov.uk/nisi/1985/1204/article/168
- [27] NI Order 1985 art.131 — https://www.legislation.gov.uk/nisi/1985/1204/article/131
- [28] NI Order 1985 Schedule 15A — https://www.legislation.gov.uk/nisi/1985/1204/schedule/15A
- [29] Department for Communities, The law on prize competitions in Northern Ireland (Sept 2022) — https://www.communities-ni.gov.uk/publications/leaflet-prize-competitions-northern-ireland
- [30] BGLA (Amendment) Act (NI) 2022, Explanatory Notes — https://www.legislation.gov.uk/nia/2022/14/notes/division/2
- [31] Lewis Silkin (16 May 2022) — https://www.lewissilkin.com/insights/2022/05/16/no-purchase-necessary-route-for-chance-based-competitions-no-longer-required-in-northern-irelan
- [32] Gaming and Lotteries Act 1956, revised — https://revisedacts.lawreform.ie/eli/1956/act/2/revised/en/html
- [33] Gambling Regulation Act 2024 — https://www.irishstatutebook.ie/eli/2024/act/35/enacted/en/print.html
- [34] S.I. No. 31/2026 Commencement Order — https://www.irishstatutebook.ie/eli/2026/si/31/made/en/print
- [35] GRAI news — https://www.grai.ie/news
- [36] McCann FitzGerald, White Flag Raised On Ireland's Licensing Regime (9 Feb 2026) — https://www.mccannfitzgerald.com/knowledge/betting-and-gaming/white-flag-raised-on-irelands-licensing-regime
- [37] A&L Goodbody, Guide to the Gambling Regulation Act 2024 — https://www.algoodbody.com/files/uploads/news_insights_pub/ALG_s_Guide_to_the_Gambling_Regulation_Act_2024_v3.pdf
- [38] Citizens Information, The law on gambling in Ireland — https://www.citizensinformation.ie/en/justice/civil-law/the-law-on-gambling-in-ireland/
- [39] Ogier (7 Jul 2025) — https://www.ogier.com/news-and-insights/insights/the-irish-gambling-regulation-act-2024-key-changes-to-licences/
- [40] McCann FitzGerald / Practical Law, Sales promotions Q&A: Ireland — https://mccannfitzgerald.com/uploads/Sales_promotions_QAndA_Ireland.pdf
- [41] ASAI Code 7th Edition (Revision 2021) — https://adstandards.ie/wp-content/uploads/2024/03/ASAI-CODE_7th-Edition_Revision_2021.pdf
- [42] Blaa Giveaways T&Cs and FAQs — https://blaagiveaways.com/terms-conditions ; https://blaagiveaways.com/faqs
- [43] McKinney Competitions T&Cs — https://mckinneycompetitions.com/terms-conditions
- [44] Gambling Commission, Blockchain technology and crypto-assets — https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/blockchain-technology-and-crypto-assets
- [44b] Gambling Commission, Emerging ML/TF risks from April 2025 — https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/emerging-money-laundering-and-terrorist-financing-risks-from-april-2025
- [45] FCA, Cryptoasset firms marketing to UK consumers — https://www.fca.org.uk/firms/cryptoassets/marketing-uk-consumers
- [46] FCA press release, new rules for marketing cryptoassets (8 Jun 2023) — https://www.fca.org.uk/news/press-releases/fca-introduces-tough-new-rules-marketing-cryptoassets
- [47] FSMA 2000 (Cryptoassets) Regulations 2026, reg.1 — https://www.legislation.gov.uk/uksi/2026/102/regulation/1/made
- [48] Central Bank of Ireland, MiCAR — https://www.centralbank.ie/regulation/markets-in-crypto-assets-regulation
- [49] Solana docs, Clusters — https://solana.com/docs/references/clusters
- [50] DrawSol v2 spec — `docs/SPEC.md`. Current-build facts come from `app/src/components/BuyContext.tsx` (default quantity), `BuyPanel.tsx` (presets, ledger, free-entry line) and `ConfirmStep.tsx` (skill question, 18+ check)

### 7.2 Operator sources (fetched 2 Oct 2026)

**McKinney Competitions**
- Site: https://mckinneycompetitions.com/ ; competition pages for the Rollerteam Zefiro, £500k Armagh home, Peters Pachinko, Lucky Wheels, Spanish penthouse, Mystery Flash #35 and Swift Trekker 594
- APIs: /api/getInstantWinTickets/3486/1103?page=1 ; /cart/getUpsellCompetitions?competition_id=3461 ; /cart ; /assets/mckinney/scripts/cart.js ; competition.js
- Policy and info pages: /account/login ; /terms-conditions ; /terms-of-use ; /faqs ; /how-to-play ; /fair-play-policy ; /responsible-play ; /complaints ; /about-us ; /winners ; /big-prize-winners ; /robots.txt
- GLI certificate: https://access.gaminglabs.com/Certificate/Index?i=628
- Companies House NI667309: https://find-and-update.company-information.service.gov.uk/company/NI667309 (and /officers)
- DCMS Code signatory list [11]
- Trustpilot: https://www.trustpilot.com/review/mckinneycompetitions.com (?stars=1, ?stars=2)
- Social: https://www.tiktok.com/@mckinneycompetitions ; https://www.youtube.com/@McKinneyCompetitions
- Press: Armagh I (three articles) ; Donegal Live ; Longford Leader

**Blaa Giveaways**
- Site: https://blaagiveaways.com/ ; competition pages for the Kenmare cottage, BMW X5, Spin 'N Win, Piggy Bank, Seths Cash Cyclone, €500 Friday #48 and Jack & Jill bundle
- APIs and scripts: /api/getInstantWinTickets/987/1181 ; /cart/getUpsellCompetitions?competition_id=1022 ; /cart ; /assets/blaa/scripts/cart.js, websocket.js, competition.js
- Policy and info pages: /winners ; /faqs ; /terms-conditions ; /terms-of-use ; /privacy-policy ; /our-community ; /about-us ; /account/login ; /robots.txt
- QR promo pages: /blaa-win-x7d9q2kf84mz1r5v9b ; /blaa-try-again-m4z1t9kpv7xq2g8n
- Trustpilot: https://uk.trustpilot.com/review/blaagiveaways.com (?stars=1, ?stars=2)
- YouTube: https://www.youtube.com/@blaagiveaways963 (and the EZBlm0-0dM0 oEmbed and thumbnail)
- Waterford News & Star: https://www.waterford-news.ie/news/its-life-changing-dungarvan-man-wins-four-bed-kerry-home-for-just-1-99_arid-108984.html ; https://www.waterford-news.ie/news/dublin-house-on-offer-in-latest-blaa-giveaways-competition_arid-73615.html

**Ooosch**
- Site: https://www.ooosch.com/ ; /active-competitions
- Product pages: volkswagen-golf-gte, halloween-mystery-car-and-cash-instant-win, 25-000-money-monday-instant-scratch--6, the-big-40-40-40-instant-spin-2, 2k-cash--28, charity--43--samsung-tv--2
- Policy and info pages: /terms-and-conditions ; /how-to-enter ; /live-draw ; /og-winner-club ; /the-og-community ; /rng-certification (and /images/Ooosch-RNG-Certificate.png) ; /complaints-policy ; /privacy-policy ; /register ; /login?next=/checkout ; /plus-coming-soon ; /product/gift-card ; /terms-and-conditions/game4hope
- Code and API: /api/trpc (observed calls) ; /_app/immutable/entry/app.iGs3c9ms.js
- UK sister site: https://www.ooosch.co.uk/
- Trustpilot: https://ie.trustpilot.com/review/www.ooosch.com (?stars=1, ?stars=2)
- Other: Anglo-Celt https://www.anglocelt.ie/?p=21869 ; Odoo customer page ; CIPO trademark 2394446

**Lucky Day Competitions**
- Site: https://www.luckydaycompetitions.com/
- Product pages: kubota-kx027-4-2, million-pound-cash-vault, tradesmans-treasure, autumn-agri-instant-wins, 5000-cash-instant-wins-exclusive-8, iphone-17-pro-max-256-gb-2-auto-draw, name-this-bundle-21
- Listings: /all-competitions/ ; /just-launched/ ; /next-draw/
- Policy pages: /terms-and-conditions/ ; /faqs/ ; /terms-of-use/ ; /privacy-policy/
- Results and winners: /draw-results/ (and 25 Sept, 29 Sept, 1 Oct posts) ; /past-winners/ ; /live-draws/ ; /entry-lists/
- Other pages: /about-us/ ; /download/ ; /basket/ ; /checkout/ ; /securetrading/ ; sitemap ; robots.txt
- Scripts and API: theme main.js ; dd-iw-ajax.js ; admin-ajax `load_instant_win_winners`
- Trustpilot: https://uk.trustpilot.com/review/luckydaycompetitions.com (?stars=1, ?stars=2)
- Companies House NI659574 (overview and officers)
- App Store: https://apps.apple.com/gb/app/lucky-days/id1501850869
- Agriland and Donegal Live: search results only

**R Kings Competitions**
- Site: https://rkingscompetitions.com/ ; /competitions/2026-toyota-2026-oct-n1 ; /competitions/29p-instant-2026-oct-2e
- Basket and account: /cart ; /login ; /register
- Policy pages: /terms-conditions ; /faqs ; /playing-responsibly ; /complaints ; /contact ; /charity
- Results: /winners ; /draws ; /entries ; /entries/2411688
- Build manifest: /_next/static/my-rkings-build-id-390d25d/_buildManifest.js
- API: api.rkingscompetitions.com /home/stats, /competitions/competition-instant-wins (ids 2411716 and 2411688), /entry-list
- Entry-list CSVs on S3: https://rkings-entry-list.s3.eu-west-2.amazonaws.com/39p-instant-2026-sep-re_2411688_2026-09-25_22-00-00.csv and the 1999 Nissan CSV
- Trustpilot: https://uk.trustpilot.com/review/rkingscompetitions.com (?stars=1, ?stars=2)
- Companies House NI656489 (overview, officers, PSC)
- SEC (GMGI) exhibits: https://www.sec.gov/Archives/edgar/data/1437925/000147793222000977/gmgi_ex991.htm ; https://www.sec.gov/Archives/edgar/data/1437925/000147793225001898/gmgi_ex991.htm
- Social: Facebook profile 100077330920045 ; TikTok @rkingscompetitions

**Omaze UK**
- Site: https://omaze.co.uk/ (and ?redirect=off)
- Campaign and entry pages: /pages/yorkshire-iv ; /pages/enter-yorkshire-iv ; /pages/enter-subscription ; /pages/yorkshire-iv-win-a-bmw-m3 ; /pages/monthly-millionaire
- Rules and policies: /pages/experience-rules-yorkshire-iv ; /pages/legal-terms ; /pages/faqs ; /pages/postal-entry-route
- Results and winners: /pages/draw-results ; /pages/winners ; /pages/past-draws ; /pages/weekly-draw-results-2026 ; /pages/subscriber-5000-cash-draw-results-2026 ; /pages/dream-list-results
- Other pages: /pages/about-omaze ; /pages/newsletter-signup ; /pages/messaging-sign-up ; /cart and the Shopify checkout (observed, not submitted) ; theme.min.js
- Trustpilot: https://uk.trustpilot.com/review/omaze.co.uk (?stars=1, ?stars=2, page 2)
- Press and background: City AM https://www.cityam.com/?p=2366264 ; https://en.wikipedia.org/wiki/Omaze ; 3 Sided Cube case study
- Social: YouTube channel UCFtKZF8vImBVD4EI93STk3w ; TikTok @omazeuk

**BOTB**
- Site: https://www.botb.com/
- Prize pages: /prizes/house ; /prizes/winbig ; /prizes/cars ; /prizes/cars/renault-5 ; /prizes/instantwin ; /prizes/2instantwin ; /prizes/pick-your-prize-competition ; /prizes/asubscribercomp
- Results: /winners ; /winners/dc3926 ; /winners/ew3926a
- Info and policy pages: /how-to-play ; /terms ; /mindful-play ; /about/history-locations ; /signup ; /login?ReturnUrl=/checkout
- PDFs: T&Cs v21.09.2026 https://cdn.botb.com/media/auxeuwlh/botb-terms-conditions-21-09-2026.pdf ; Free Competition Rules ; verification letters HC3126 and DC-3926
- APIs and script: /umbraco/00000002/appv2/getactivecompetitions ; instantWin getinstantwindata and getcachedinstantwinprizeinfo (comp 7319) ; winnersresult/getpagecomponents ; GetApplicationTrackers ; /js/botb.min.js
- Trustpilot: https://uk.trustpilot.com/review/www.botb.com (?stars=1, ?stars=2)
- Feefo: https://www.feefo.com/en-GB/reviews/botb-public
- App Store id528229538
- Press: Gaming Intelligence (Rev Comps acquisition) ; TradingView/Reuters RNS (3 Jul 2026) ; Yorkshire Post

**Elite Competitions**
- Site: https://elitecompetitions.co.uk/
- Competition pages: porsche-911-992-turbo-s-9805, the-elite-life-changer-instawin-9387, prize-every-time-cash-instawin-9794, pound21-million-dream-home-bundle-9877, the-ultimate-car-wheel-9748, coach-yellow-tone-watch…-9807 ; /competitions/daily-draws/daily-draw
- Past competitions: past/pound2-million-dream-home-bundle-9692 ; past/pound99999-cash-9800
- Other pages: /instawin-competitions ; /all-winners ; /live-draws ; /subscriptions ; /how-to-play ; /faqs ; /tnc ; /register
- API: /api/v1/instant-prizes/groups?competitionId=9387 (and group winners) ; success-in-numbers ; referral-programme/config ; build manifest
- Trustpilot: https://uk.trustpilot.com/review/elitecompetitions.co.uk (?stars=1, ?stars=2)
- Companies House 09612888
- App Store id1374463238
- Social: TikTok @elite_competitions ; YouTube UCdqJoP6_7pXuid2xr-Hz3Yg
- LEP article: search snippet only (403)

**Dream Car Giveaways**
- Site: https://dreamcargiveaways.co.uk/
- Competition pages: AVT T7 camper ; Fall Into Fortune ; VW Golf GTI 50 (drawn) ; /competitions/instant-wins
- Basket and account: /basket ; /register
- Policy pages: /terms-conditions ; /postal-entry-route ; /faqs ; /compliance-statement ; /playing-responsibly ; /complaints-procedure ; /about-us
- Other pages: /winners ; /live-draws ; /charity-competitions
- API: api.dreamcargiveaways.co.uk /faqs, /system-status, /competitions?status=published, /competitions?status=drawn, /draws, /prize-groups/…/prizes
- Trustpilot: https://uk.trustpilot.com/review/dreamcargiveaways.co.uk
- Deal coverage: intergameonline (Jumbo deal) ; investorpa ASX announcement
- App Store id6443899598
- YouTube @dreamcargiveaways

**Rev Comps**
- Site: https://www.revcomps.com/
- Competition pages: /cars/2026-BMW-G80-M3-Competition-5-000-OR-60-000 ; /NINTENDO-SWITCH-OLED-WHITE-11 ; /FREE-ENTRY-1000-Cash-Spend-2-get-5000
- Basket and checkout: /cart ; /checkout ; /checkout-competitions
- Policy and info pages: /terms-conditions ; /faqs ; /how-it-works ; /mindful-play ; /charity ; /about ; /contact
- Results and entry lists: /results ; /winners ; /vehicle-winners ; /auto-draw-winners ; /past-entry-lists ; /ticket-numbers/01a0c54d-… ; /live-draw
- Referrals: /referrals ; /referral-prizes
- Sitemap and robots: /sitemap-pages.xml ; /robots.txt
- API: /be/api/v1/competition-system/competitions/{id}
- Old site: https://prev.revcomps.com/
- Trustpilot: https://uk.trustpilot.com/review/revcomps.com
- Companies House 11981806 (overview, officers, filing history)
- Social: Facebook /revcomps ; TikTok @revcomps
- Shared platform: https://www.clickcompetitions.co.uk/

### 7.3 Screenshots (session evidence)

Screenshots were captured on 2 Oct 2026 at 1440 px (desktop) and 390 px (mobile). They live in the research session's scratchpad, not in this repo:

`/tmp/claude-0/-home-user-drawsol/10dfed79-e88d-5c6b-96f0-0274acd09d1d/scratchpad/research/`

Most useful files per operator:

- **mckinney/shots/**
  - `flow-02-desktop-qty-100.png`: slider, multibuy and "Saving £2.30"
  - `flow-03-desktop-postal-tab.png`: equal-weight free entry
  - `iw-01-desktop-house-instantwins.png`: published instant-win numbers
  - `m-03-mobile-buy-100.png`: wrong mobile total
  - `winners-desktop.png`
- **blaa/shots/**
  - `flow2-desktop-5-answer.png`: basket skill question
  - `misc-instant-wins-expanded.png`
  - `flow-desktop-3-postal.png`
  - `yt-thumb-1oct.jpg`: Google RNG over the full cap
- **ooosch/**
  - `flow-3-wrong-answer-desktop.png`: wrong answer accepted
  - `comp-scratch-instantwins-tickets.png`
  - `comp-vw-mobile-full.png`: free entry only in an accordion on mobile
  - `rng-report.png`
  - `og-winner-club-all-winners.png`
- **luckyday/shots/**
  - `flow-d-01-quickbuy-modal.png`
  - `kubota-desktop-fold.png`: online/postal tabs
  - `flow-d-07-checkout-full.png`: pre-ticked T&Cs
  - `results-desktop-full.png`
- **rkings/**
  - `flow-desktop-1-comp.png`: total in CTA
  - `flow-desktop-2-after-add.png`: Quick Picks
  - `pg-desktop-iw-available.png`
  - `pg-desktop-entries-detail.png`: entry list with "Redra W"
  - `flow-desktop-4-checkout.png`: login wall
- **omaze-uk/**
  - `enter-d-1-default-full.png`: Subscription tab preselected
  - `flow-d-5-step2-full.png`: "75% DISCOUNT" upsell
  - `flow-d-7-checkout-full.png`: pre-ticked marketing
  - `results-desktop.png`
- **botb/**
  - `flow-house-d-2-postal.png`
  - `flow-house-d-3-qty10.png`: "MOST CHANCES"
  - `iw-details.png`
  - `res-dc-d-judges.png`
  - `flow-house-d-5-checkout.png`: login wall
- **elite/**
  - `flow-d-2-qty.png`: discount tiles
  - `lc-iw-group.png`
  - `flow-m-4-buy-loggedout.png`: login modal
  - `past-d-full.png`
- **dreamcargiveaways/shots/**
  - `flow_d_02_enter_modal.png`
  - `flow_d_03_postal_tab.png`
  - `fif_d_02_shownumbers_800.png`: published instant-win numbers
  - `drawn_03_entrylist.png`
  - `comp_avt_mobile_full.png`: pop-up over stats
- **revcomps/**
  - `03-comp-m3-desktop-y800.png`: draw rule box and online/postal toggle
  - `flow-d-04-cart-crop-upsell.png`
  - `16-entry-list-detail.png`
  - `23-mindful-play.png`

Local copies of the regulatory source texts are in the same scratchpad under `research/regulatory/`.
