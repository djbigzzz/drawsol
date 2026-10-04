/**
 * The nominal headline of each marketed draw: what the prize was worth in USD when the draw was created and
 * its SOL escrow was sized. The chain holds the SOL (DrawV4.end_prize_lamports, in the vault); this map holds
 * the number the draw was sold under, so the page can say "WIN $500" beside the real escrow it reads from chain.
 *
 * Each entry mirrors the draw's published terms (scripts/terms/draw-<id>.md, hashed into terms_hash at
 * creation), which state the SOL figure: draw 7 was created as a $500 prize, escrowed as 4.1922 SOL at the
 * SOL price of its creation ($119.27). A draw without an entry is headlined by its SOL prize instead; a USD
 * figure is never derived from a live price.
 */
export interface Campaign {
  /** the nominal prize, whole US dollars */
  usd: number;
  /** "Win $500 cash": the headline as sold */
  title: string;
  /** the terms file the figure is taken from */
  terms: string;
}

export const CAMPAIGNS: Record<number, Campaign> = {
  7: { usd: 500, title: "Win $500 cash", terms: "scripts/terms/draw-7.md" },
};

export const campaignOf = (drawId: number): Campaign | null => CAMPAIGNS[drawId] ?? null;

/** "$500", "$1,250" */
export const usdWhole = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
