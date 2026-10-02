import { PROGRAM_ID } from "@/lib/config";

/**
 * The DrawSol mark: a notched paper ticket printed with a barcode of mixed bar widths; one bar,
 * off-centre, is vermilion and breaks out through the top edge (the drawn ticket); a dashed
 * perforation tears off the stub. Source: design-assets/mark.svg.
 */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 36 28" width="36" height="28" aria-hidden="true" focusable="false">
      <path d="M1 7h34v6a4 4 0 0 0 0 8v6H1v-6a4 4 0 0 0 0-8z" fill="#1B1814" />
      <g fill="#FBF8F0">
        {BARS.map(([x, w]) => (
          <rect key={x} x={x} y="11" width={w} height="12" />
        ))}
        {[10, 14, 18, 22].map((y) => (
          <rect key={`p${y}`} x="29" y={y} width="1" height="2" />
        ))}
      </g>
      <rect x="23" y="1" width="3" height="22" fill="#DE3F2B" />
    </svg>
  );
}

/**
 * [x, width] of the knocked-out bars: 1/2/1/3 with uneven gaps, so they read as a barcode, not a fence.
 * Nothing is knocked out next to the red bar: it has solid ink on both sides (x 19–23 and 26–29), so at
 * 20px it is still a 2px bar, not a pink hairline.
 */
const BARS: [number, number][] = [
  [7, 1],
  [9, 2],
  [13, 1],
  [16, 3],
];

/** The lower line of the ticket head's double rule: the program ID, printed at 4px. Zoom in to read it. */
export function Microtext() {
  const id = PROGRAM_ID.toBase58();
  const line = Array.from({ length: 24 }, () => `${id} · `).join("");
  return (
    <svg className="micro" height="6" aria-hidden="true" focusable="false">
      <text x="0" y="5" fontSize="4" fill="#1B1814" fillOpacity=".6">
        {line}
      </text>
    </svg>
  );
}

/**
 * "DEVNET SPECIMEN · PLAY MONEY · NO CASH VALUE", overprinted in blue along the perforation (the strip is
 * the accessible marker). Phones' horizontal line (~326px) drops "play money" (the strip above says it),
 * and below 360px "no cash value" too (DESIGN.md §4.7).
 */
export function Specimen() {
  return (
    <p className="specimen t-specimen" aria-hidden="true">
      Devnet specimen<span className="sp-play"> · play money</span>
      <span className="sp-more"> · no cash value</span>
    </p>
  );
}
