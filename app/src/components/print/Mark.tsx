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
      <rect x="24" y="1" width="2" height="22" fill="#DE3F2B" />
    </svg>
  );
}

/** [x, width] of the knocked-out bars: 1/2/1/3/1/1, packed asymmetrically. */
const BARS: [number, number][] = [
  [6, 1],
  [8, 2],
  [11, 1],
  [14, 3],
  [18, 1],
  [21, 1],
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

/** "DEVNET SPECIMEN · NO CASH VALUE", overprinted in blue along the perforation (the strip is the accessible marker). */
export function Specimen() {
  return (
    <p className="specimen t-specimen" aria-hidden="true">
      Devnet specimen<span className="sp-more"> · no cash value</span>
    </p>
  );
}
