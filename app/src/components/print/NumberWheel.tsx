"use client";

import { useEffect, useRef } from "react";

/**
 * A numbering-machine figure. Each character sits in its own window; when the value changes
 * (a real tick of the clock), only the changed characters advance: the old one moves up and out
 * while the new one rises in. Reduced motion: a plain swap.
 */
export function NumberWheel({ value, className = "", seconds = false }: { value: string; className?: string; seconds?: boolean }) {
  const prev = useRef(value);
  const before = prev.current;
  useEffect(() => {
    prev.current = value;
  }, [value]);
  const pad = before.padStart(value.length, " ");
  return (
    <span className={`wheel ${seconds ? "sec" : ""} ${className}`} aria-hidden="true">
      {value.split("").map((ch, i) => {
        const old = pad[i];
        const changed = before !== value && old !== ch;
        return (
          <span className="ch" key={`${i}-${ch}-${changed ? before : ""}`}>
            {changed ? (
              <>
                <span className="in">{ch}</span>
                {old.trim() && <span className="out">{old}</span>}
              </>
            ) : (
              ch
            )}
          </span>
        );
      })}
    </span>
  );
}
