// Reference generators for the Ticket Office print system (DESIGN.md §5).
// Run: node app/src/design-assets/generate.mjs
// Writes the preview SVGs in this folder from the fixture "open" scenario.
// The functions below are the algorithms the React components port 1:1
// (Barcode.tsx, Sun.tsx, ReceiptBars.tsx, Stamp.tsx). Plain ESM, no deps,
// not type-checked or bundled by Next.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const INK = "#1B1814", INK3 = "#625949", RULE2 = "rgba(27,24,20,.32)", RED = "#DE3F2B", BLUE = "#2448B0";
const svg = (w, h, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${label ? ` role="img" aria-label="${label}"` : ' aria-hidden="true"'}>\n${body}\n</svg>\n`;

/* ------------------------------------------------------------------ *
 * 1. Halftone sun (reveal total). Integer 45° lattice: dot centres sit on
 *    (4k+2, 4m+2) with k+m even, so every dot rasterises identically at 1x
 *    and 2x and the screen cannot beat against the pixel grid (no moiré).
 *    Render at 1:1 only (CSS width = viewBox width). Never scale it.
 * ------------------------------------------------------------------ */
export function sunDots(width, { pitch = 4, rMax = 2.6, rMin = 0.9 } = {}) { // near-touching core, printed floor at the rim (d2 review)
  const R = width / 2, cx = width / 2, cy = R; // centre on the horizon (bottom edge)
  const dots = [];
  for (let m = 0; m * pitch <= R; m++) {
    for (let k = 0; k * pitch <= width; k++) {
      if ((k + m) % 2) continue;
      const x = k * pitch + pitch / 2, y = m * pitch + pitch / 2;
      if (y > cy) continue;
      const d = Math.hypot(x - cx, y - cy) / R;
      if (d > 1) continue;
      const r = rMin + (rMax - rMin) * (1 - d * d); // denser at the core, never below rMin at the rim
      if (r < rMin) continue;
      dots.push([x, y, Math.round(r * 100) / 100]);
    }
  }
  return dots;
}
function sunSvg(width) {
  const dots = sunDots(width);
  const body = `<g fill="${RED}">${dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>`;
  return svg(width, width / 2, body);
}

/* ------------------------------------------------------------------ *
 * 2. Barcode sales meter. One bar per ticket number, left to right.
 *    slots = ticketCap + freeTickets (free entries take a number but not a
 *    paid slot). taken = nextTicket.
 *    sold    : ink bar, full height
 *    free    : ink bar punched through the middle (gap)
 *    yours   : raised by `rise`, blue (you chose these)
 *    drawn   : raised by `rise`, vermilion (settled draws only)
 *    unsold  : 1px hairline at 38% height on a 1px baseline
 *    Pitch 3 (2px bar) when it fits, else pitch 2 (1px bar). Integer x only.
 * ------------------------------------------------------------------ */
export function barcode({ slots, taken, free = [], mine = [], drawn = -1, width, h = 40, rise = 8 }) {
  const pitch = slots * 3 <= width ? 3 : 2;
  const bar = pitch - 1;
  const H = h + rise;
  const F = new Set(free), M = new Set(mine);
  const out = [];
  for (let i = 0; i < slots; i++) {
    const x = i * pitch;
    if (i >= taken) {
      const uh = Math.round(h * 0.38);
      out.push(`<rect x="${x}" y="${H - uh}" width="1" height="${uh}" fill="${RULE2}"/>`);
      continue;
    }
    const up = i === drawn || M.has(i);
    const top = up ? 0 : rise;
    const fill = i === drawn ? RED : M.has(i) ? BLUE : INK;
    if (F.has(i)) {
      const len = H - top, gap = 6, a = Math.round((len - gap) / 2);
      out.push(`<rect x="${x}" y="${top}" width="${bar}" height="${a}" fill="${fill}"/>`);
      out.push(`<rect x="${x}" y="${top + a + gap}" width="${bar}" height="${len - a - gap}" fill="${fill}"/>`);
    } else out.push(`<rect x="${x}" y="${top}" width="${bar}" height="${H - top}" fill="${fill}"/>`);
  }
  if (taken < slots) out.push(`<rect x="${taken * pitch}" y="${H - 1}" width="${(slots - taken) * pitch - 1}" height="1" fill="${RULE2}"/>`);
  return { w: slots * pitch - 1, h: H, body: out.join("") };
}

/* ------------------------------------------------------------------ *
 * 3. Receipt bars (reveal end, tear-off slip). Bar height is proportional to
 *    SOL won, within the receipt (largest win 48px, any win >= 12px).
 *    A ticket that won nothing is a 1px x 3px ink-3 tick under the baseline. Winning bars carry
 *    their amount above them (13px Archivo 85%, --red-ink); ticket numbers
 *    sit under the baseline (13px, --ink-3). Labels are HTML, not in the SVG.
 * ------------------------------------------------------------------ */
export function receipt(wins, { pitch = 28, bar = 6, max = 48, min = 12, tick = 3 } = {}) {
  // proportional within this receipt: the largest win is `max` px, any win at least `min` px;
  // a ticket that won nothing is a short ink-3 tick hanging under the baseline
  const top = Math.max(0, ...wins);
  const base = max;
  const out = [];
  wins.forEach((sol, i) => {
    const x = i * pitch + (pitch - bar) / 2;
    if (sol > 0) {
      const hh = Math.max(min, Math.round((sol / top) * max));
      out.push(`<rect x="${x}" y="${base - hh}" width="${bar}" height="${hh}" fill="${RED}"/>`);
    } else out.push(`<rect x="${Math.round(i * pitch + pitch / 2 - 0.5)}" y="${base + 1}" width="1" height="${tick}" fill="${INK3}"/>`);
  });
  out.push(`<rect x="0" y="${base}" width="${wins.length * pitch}" height="1" fill="${INK}"/>`);
  return { w: wins.length * pitch, h: base + 1 + tick, body: out.join("") };
}

/* ------------------------------------------------------------------ *
 * 4. Stamp print parameters from seed bytes (>= 7 bytes). Every stamp
 *    instance gets its own speckle, edge wobble, pressure and angle.
 *    WON   : bytes 8..15 of sha256(randomness || "ticket" || ticket_le_u32)
 *            (bytes 0..7 are that ticket's roll, so the ink is printed from
 *            the same randomness that decided the result)
 *    PAID (reveal): first bytes of the entry's ORAO randomness
 *    DRAWN / PAID (past): first bytes of that draw's randomness
 *    LOCKED / CLOSED / CANCELLED: draw account address bytes
 *    REFUNDED: entry account address bytes
 * ------------------------------------------------------------------ */
export function stampPrint(b, baseAngle) {
  return {
    seed: 1 + (((b[0] << 8) | b[1]) % 997), // feTurbulence speckle seed
    wobbleSeed: 1 + (b[2] % 97), // feTurbulence edge seed
    threshold: +(4.0 + (b[3] / 255) * 0.5).toFixed(2), // feColorMatrix alpha offset: higher = more ink
    wobble: +(1.2 + (b[4] / 255) * 0.8).toFixed(2), // feDisplacementMap scale
    pressure: +(0.82 + (b[5] / 255) * 0.16).toFixed(2), // group opacity
    angle: +(baseAngle + ((b[6] / 255) * 6 - 3)).toFixed(1), // degrees
  };
}

/* ---------------- previews from the fixture "open" scenario ---------------- */
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const mine = [...range(31, 40), 59, ...range(97, 101)];

writeFileSync(join(here, "sun-440.svg"), sunSvg(440));
writeFileSync(join(here, "sun-280.svg"), sunSvg(280));

const open = barcode({ slots: 152, taken: 102, free: [41, 59], mine, width: 576 });
writeFileSync(join(here, "barcode-open.svg"), svg(open.w, open.h, open.body,
  "100 of 150 tickets sold, plus 2 free entries. Yours: #0031 to #0040, #0059 and #0097 to #0101."));
const openM = barcode({ slots: 152, taken: 102, free: [41, 59], mine, width: 326, h: 34, rise: 6 });
writeFileSync(join(here, "barcode-open-mobile.svg"), svg(openM.w, openM.h, openM.body,
  "100 of 150 tickets sold, plus 2 free entries. Yours: #0031 to #0040, #0059 and #0097 to #0101."));
const past = barcode({ slots: 102, taken: 102, free: [41, 59], drawn: 6, width: 420, h: 32, rise: 8 });
writeFileSync(join(here, "barcode-past.svg"), svg(past.w, past.h, past.body,
  "Draw number 2: 102 tickets; ticket #0006 was drawn."));

const r = receipt([0, 0, 0, 0.01, 0, 0.05, 0.01, 0, 0, 0.01]);
writeFileSync(join(here, "receipt-0031-0040.svg"), svg(r.w, r.h, r.body,
  "Receipt: #0034 won 0.01, #0036 won 0.05, #0037 won 0.01, #0040 won 0.01 SOL; the other six won nothing."));

console.log("wrote sun-440, sun-280, barcode-open(-mobile), barcode-past, receipt-0031-0040");
console.log("example WON print for bytes [12,200,7,90,180,33,240]:", stampPrint([12, 200, 7, 90, 180, 33, 240], -12));
