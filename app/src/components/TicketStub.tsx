"use client";

import type { ReactNode } from "react";
import { SplitFlap } from "./SplitFlap";
import { sol, ticketNo } from "@/lib/format";

/**
 * Perforated ticket stub. Left: serial (the on-chain ticket number). Right: whatever
 * the caller puts there. The notches are punched out in the colour of the surface
 * behind the stub (`notch`).
 */
export function TicketStub({
  serial,
  tag,
  children,
  tone = "cream",
  notch = "var(--black)",
  stubWidth,
  className = "",
}: {
  serial: ReactNode;
  tag: ReactNode;
  children: ReactNode;
  tone?: "cream" | "dark" | "won";
  notch?: string;
  stubWidth?: number;
  className?: string;
}) {
  const style: Record<string, string> = { "--notch": notch };
  if (stubWidth) style["--stub-w"] = `${stubWidth}px`;
  return (
    <div className={`stub ${tone === "dark" ? "dark" : tone === "won" ? "won" : ""} ${className}`} style={style}>
      <div className="stub-l">
        <span className="tag">{tag}</span>
        <span className="serial">{serial}</span>
      </div>
      <div className="stub-r">{children}</div>
    </div>
  );
}

/** One ticket in the reveal sheet: face-down until its on-chain tier is known, then flips. */
export function RevealStub({
  ticket,
  tier,
  amount,
  shown,
  notch,
}: {
  ticket: number;
  /** undefined = not yet known from chain */
  tier: number | undefined;
  amount: bigint;
  shown: boolean;
  notch: string;
}) {
  const known = shown && tier !== undefined;
  const won = known && tier! > 0;
  const text = !known ? "······" : won ? `+${sol(amount, 2, 3)}` : "NO WIN";
  return (
    <TicketStub serial={ticketNo(ticket)} tag="Ticket" tone={won ? "won" : "cream"} notch={notch} stubWidth={76}>
      <div className="flex h-full flex-col justify-between">
        <span className="tag">{!known ? "Sealed" : won ? `Tier ${tier} · SOL` : "Instant"}</span>
        <SplitFlap
          value={text.padStart(6, " ")}
          size={18}
          font="mono"
          label={!known ? "Not revealed yet" : won ? `Won ${sol(amount, 2, 3)} SOL` : "No instant win"}
          tileWidth="0.95em"
          gap={2}
          className="stub-flaps"
        />
      </div>
    </TicketStub>
  );
}
