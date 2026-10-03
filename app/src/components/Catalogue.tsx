"use client";

import { useDrawSol } from "@/hooks/context";
import { catalogue, grandPrize, phaseOf, type Phase } from "@/lib/derive";
import { clock, utcLabel } from "@/lib/format";
import type { DrawView } from "@/lib/types";
import { drawName, kindName, plural, prizeFig } from "./fmt";

const DAY = 86400;
const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "tonight", "tomorrow", "Sunday", or the date: when a draw is, said the way a clerk would (UTC days). */
export function whenWord(drawAt: number, now: number) {
  const day = (t: number) => Math.floor(t / DAY);
  const diff = day(drawAt) - day(now);
  const hour = new Date(drawAt * 1000).getUTCHours();
  if (diff === 0) return hour >= 17 ? "tonight" : "today";
  if (diff === 1) return hour >= 17 ? "tomorrow night" : "tomorrow";
  if (diff > 1 && diff < 7) return WEEKDAY[new Date(drawAt * 1000).getUTCDay()];
  return null;
}

/** "Draws 22:00 UTC", "Drawing now", "Settled" … one short phrase per phase. */
function status(d: DrawView, ph: Phase) {
  switch (ph) {
    case "selling":
    case "closed":
      return `draws ${utcLabel(d.drawAt).replace(/^\w+ /, "").replace(/ UTC$/, "")}`;
    case "due":
      return "due now";
    case "drawing":
      return "being drawn";
    case "settled":
      return "settled";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * The counter's rack: tonight's pot draw (or the next one) and this week's headline draw, each a small ticket
 * with its kind printed on its head, plus every other open or upcoming draw as a line. Choosing one puts it on
 * the counter below (the hero ticket) and in the address (?n=).
 */
export function Catalogue() {
  const { draws, current, select, now } = useDrawSol();
  const { pot, headline, others } = catalogue(draws);
  const featured = [pot, headline].filter((d): d is DrawView => !!d);
  if (featured.length === 0) return null;
  const pick = (id: number) => {
    select(id);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("n", String(id));
      window.history.replaceState(null, "", u.toString());
    } catch {
      /* the address just doesn't change */
    }
  };
  return (
    <nav className="rack" aria-label="Draws on sale">
      <div className="rack-voice">
        <p className="t-label">On the counter</p>
        {others.length > 0 ? (
          <ul className="rack-more t-small">
            {others.map((d) => (
              <li key={d.address.toBase58()}>
                <button type="button" className="tbtn" onClick={() => pick(d.id)} aria-current={current?.id === d.id ? "true" : undefined}>
                  {drawName(d)}
                </button>{" "}
                <span className="nw c-ink-2">
                  {whenWord(d.drawAt, now) ?? utcLabel(d.drawAt).split(",")[0]}, {clock(d.drawAt)} UTC
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-small c-ink-2 rack-note">
            {featured.length === 2 ? "A pot draw every night, a headline draw every week." : `One ${kindName(featured[0].kind)} on sale.`}
          </p>
        )}
      </div>
      <div className={`rack-tickets n-${featured.length}`}>
        {featured.map((d) => {
          const ph = phaseOf(d, now);
          const on = current?.address.equals(d.address) ?? false;
          const when = whenWord(d.drawAt, now);
          const live = ph !== "settled" && ph !== "cancelled";
          // a pot draw's figure is the pot itself (its instant pool is shown on the ticket, and joins at the draw)
          const fig = d.kind === "pot" && d.status !== "settled" ? d.potLamports : grandPrize(d);
          const head =
            d.kind === "pot"
              ? live && when
                ? `${when === "tonight" ? "Tonight’s" : "The next"} pot draw`
                : "Pot draw"
              : live
                ? "This week’s headline"
                : "Headline draw";
          return (
            <button
              key={d.address.toBase58()}
              type="button"
              className={`rack-tk kind-${d.kind} ${on ? "on" : ""}`}
              aria-pressed={on}
              onClick={() => pick(d.id)}
              aria-label={`${head}, Nº ${d.id}: ${prizeFig(fig)} SOL, ${status(d, ph)}.${on ? " Shown below." : ""}`}
            >
              <span className="rk-head" aria-hidden="true">
                <span className="t-ticket-head">{head}</span>
                <span className="t-serial">Nº {String(d.id).padStart(4, "0")}</span>
              </span>
              <span className="rk-fig" aria-hidden="true">
                <span className="t-rowtotal">{prizeFig(fig)} SOL</span>
                <i className="t-label">
                  {d.kind === "pot"
                    ? ph === "settled"
                      ? "the pot, paid"
                      : ph === "cancelled"
                        ? "not awarded"
                        : ph === "selling"
                          ? "pot, and rising"
                          : "the pot"
                    : ph === "settled"
                      ? "prize, paid"
                      : ph === "cancelled"
                        ? "prize, returned"
                        : "prize, escrowed"}
                </i>
              </span>
              <span className="rk-foot t-small" aria-hidden="true">
                <span className="nw">{status(d, ph)}</span>
                {live && (
                  <span className="nw rk-sold">
                    {d.kind === "headline" && d.paidTickets < d.minTickets
                      ? `${d.paidTickets} of ${d.minTickets} needed`
                      : `${d.paidTickets} ${plural(d.paidTickets, "ticket", "tickets")} sold`}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
