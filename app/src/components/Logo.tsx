import { useId } from "react";

/*
 * The DrawSol logo: a ticket stub tilted 12° to the left, filled with the Solana purple gradient (#9945FF top-left
 * to #7C3AED bottom-right), rounded corners, the two notches at mid-height and a white five-point star; beside it
 * the wordmark "DrawSol" in the site's own font (Plus Jakarta Sans 800, near-black, tight). The same mark is
 * published as public/brand/drawsol-mark.svg and drawsol-logo.svg, and sits in src/app/icon.svg (the favicon).
 */

/** The ticket: a 50×36 rounded rect with 5px notches, in a 64×64 box, rotated −12° about its centre. */
export const MARK_PATH = "M-17-18H17A8 8 0 0 1 25-10V-5A5 5 0 0 0 25 5V10A8 8 0 0 1 17 18H-17A8 8 0 0 1-25 10V5A5 5 0 0 0-25-5V-10A8 8 0 0 1-17-18Z";
/** A five-point star, outer radius 10, inner 4, pointing up, nudged 1px down so it sits visually centred. */
export const STAR_POINTS = "0,-9 2.35,-2.24 9.51,-2.09 3.8,2.24 5.88,9.09 0,5 -5.88,9.09 -3.8,2.24 -9.51,-2.09 -2.35,-2.24";

export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  // one gradient per instance: the header and the footer both carry the mark on the same page
  const g = `dsg${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <g transform="translate(32 32) rotate(-12)">
        <path d={MARK_PATH} fill={`url(#${g})`} />
        <polygon points={STAR_POINTS} fill="#FFFFFF" />
      </g>
    </svg>
  );
}

/**
 * Mark and wordmark together. `size` is the mark's height; the wordmark is set at 0.68× that, which matches
 * the cap height of the ticket. `variant="inverse"` sets the wordmark in white for the navy header and footer;
 * the purple mark is the same on both.
 */
export function Logo({ size = 28, className = "", variant = "default" }: { size?: number; className?: string; variant?: "default" | "inverse" }) {
  return (
    <span className={`logo ${variant === "inverse" ? "logo-inverse" : ""} ${className}`} style={{ fontSize: Math.round(size * 0.68) }}>
      <LogoMark size={size} />
      <span className="logo-word">DrawSol</span>
    </span>
  );
}
