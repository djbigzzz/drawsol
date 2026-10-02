"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { barcodeMarks, type BarFill } from "@/lib/print";
import { ticketNo } from "@/lib/format";
import { ranges } from "../fmt";

const FILL: Record<BarFill, string> = { ink: "#1B1814", blue: "#2448B0", red: "#DE3F2B", hair: "rgba(27,24,20,.32)" };

/** Measures its own width so every bar sits on an integer pixel. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.floor(el.getBoundingClientRect().width));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * The barcode sales meter: one bar per ticket number, which you can count.
 * Sold = ink bar; free entry = punched bar; yours = raised blue; drawn = raised red; unsold = hairline.
 */
export function Barcode({
  slots,
  taken,
  free = [],
  mine = [],
  drawn = -1,
  label,
  showKey = true,
  leftLabel,
  compact = false,
  spread = true,
}: {
  slots: number;
  taken: number;
  free?: number[];
  mine?: number[];
  drawn?: number;
  label: string;
  showKey?: boolean;
  /** "50 left" */
  leftLabel?: string;
  compact?: boolean;
  /** run the meter to the full width (hero); off for the past ticket's fixed 3px pitch */
  spread?: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const mobile = width > 0 && width < 420;
  const h = compact ? 32 : mobile ? 34 : 40;
  const rise = mobile ? 6 : 8;
  const L = width > 0 ? barcodeMarks({ slots, taken, free, mine, drawn, width, h, rise, spread }) : null;

  // key candidates, positioned under the bars they name, in priority order ("yours" wins over "#0000")
  type Lab = { x: number; text: string; cls: string; align: "l" | "r" };
  const cands: Lab[] = [];
  if (L && showKey) {
    const px = (t: number) => L.xAt(Math.floor(t / L.group));
    const mineR = ranges(mine);
    if (mineR.length) cands.push({ x: px(mineR[0][0]), text: "yours", cls: "yours", align: "l" });
    cands.push({ x: 0, text: ticketNo(0), cls: "", align: "l" });
    if (taken < slots && leftLabel) cands.push({ x: px(taken), text: leftLabel, cls: "", align: "l" });
    cands.push({ x: L.w, text: "sell-out", cls: "", align: "r" });
  }
  // drop a label only if its measured box comes within 8px of a label already placed
  const keyRef = useRef<HTMLDivElement>(null);
  const sig = cands.map((c) => `${c.text}@${c.x}`).join("|");
  const [shown, setShown] = useState<string[] | null>(null);
  useLayoutEffect(() => {
    const el = keyRef.current;
    if (!el) return;
    const place = () => {
      const spans = Array.from(el.querySelectorAll<HTMLSpanElement>("span[data-k]"));
      const boxes: [number, number][] = [];
      const keep: string[] = [];
      for (const c of cands) {
        const sp = spans.find((x) => x.dataset.k === c.text);
        if (!sp) continue;
        const w = sp.getBoundingClientRect().width;
        const a0 = c.align === "l" ? c.x : c.x - w;
        if (boxes.some(([b0, b1]) => a0 < b1 + 8 && b0 < a0 + w + 8)) continue;
        boxes.push([a0, a0 + w]);
        keep.push(c.text);
      }
      setShown((prev) => (prev && prev.join() === keep.join() ? prev : keep));
    };
    place();
    document.fonts?.ready.then(place).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  return (
    <div className="barcode-wrap" ref={ref}>
      {L && (
        <>
          <svg
            className="barcode"
            width={L.w}
            height={L.h}
            viewBox={`0 0 ${L.w} ${L.h}`}
            shapeRendering="crispEdges"
            role="img"
            aria-label={label + (L.group > 1 ? ` One bar is ${L.group} tickets.` : "")}
          >
            {L.rects.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={FILL[r.fill]} />
            ))}
          </svg>
          {showKey && (
            <div className="barcode-key t-key" ref={keyRef} aria-hidden="true" style={{ width: L.w, height: L.group > 1 ? 38 : undefined }}>
              {cands.map((l) => (
                <span
                  key={l.text}
                  data-k={l.text}
                  className={l.cls}
                  style={{ ...(l.align === "l" ? { left: l.x } : { right: 0 }), visibility: shown && shown.includes(l.text) ? "visible" : "hidden" }}
                >
                  {l.text}
                </span>
              ))}
              {L.group > 1 && <span style={{ left: 0, top: 18 }}>one bar = {L.group} tickets</span>}
            </div>
          )}
        </>
      )}
      {!L && <div style={{ height: h + rise + (showKey ? 26 : 0) }} aria-hidden="true" />}
    </div>
  );
}

/** "Yours: #0031 to #0040, #0059 and #0097 to #0101." */
export function yoursText(mine: number[]) {
  const r = ranges(mine).map(([a, b]) => (a === b ? ticketNo(a) : `${ticketNo(a)} to ${ticketNo(b)}`));
  if (!r.length) return "";
  return ` Yours: ${r.length === 1 ? r[0] : `${r.slice(0, -1).join(", ")} and ${r[r.length - 1]}`}.`;
}
