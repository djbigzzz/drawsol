"use client";

import Link from "next/link";
import { useDrawSol } from "@/hooks/context";
import { PROGRAM_ID, SOURCE_URL, solscanAccount, GAMBLE_AWARE_URL } from "@/lib/config";
import { short } from "@/lib/format";
import { toHex } from "@/lib/fairness";
import { Logo } from "./Logo";

export function Footer({ away = false }: { away?: boolean }) {
  const { current: d } = useDrawSol();
  const id = PROGRAM_ID.toBase58();
  const hash = d ? toHex(d.termsHash) : null;
  return (
    <footer className="page foot">
      <div className="foot-top">
        <div className="foot-brand">
          <Logo size={24} />
        </div>
        <ul className="foot-links">
          <li>
            <a href={solscanAccount(id)} target="_blank" rel="noopener noreferrer" title={id}>
              Program {short(id)}
            </a>
          </li>
          <li>
            <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
              Source
            </a>
          </li>
          <li>{away ? <Link href="/#rules">Rules</Link> : <a href="#rules">Rules</a>}</li>
          <li>{away ? <Link href="/#play-safe">Play safe</Link> : <a href="#play-safe">Play safe</a>}</li>
          <li>
            <Link href="/draw/">Every draw</Link>
          </li>
          <li>
            <Link href="/live/">Live</Link>
          </li>
        </ul>
      </div>
      <p className="foot-note">
        A prize draw on Solana with a free entry route. Devnet demo: play money with no cash value. Every number on this page is read from Solana devnet; when it
        can’t be read, it isn’t shown. 18+. If it stops being fun,{" "}
        <a href={GAMBLE_AWARE_URL} target="_blank" rel="noopener noreferrer">
          BeGambleAware
        </a>{" "}
        can help.
        {hash && d ? (
          <>
            {" "}
            Draw № {d.id}’s terms are committed on-chain as <code title={hash}>{hash.slice(0, 10)}…</code>.
          </>
        ) : null}
      </p>
    </footer>
  );
}
