import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DrawSol · every draw on the record",
  description: "One permanent page per DrawSol draw on Solana devnet: the winning ticket, the winner, the ORAO randomness, the settle transaction and every entry, with search and a CSV.",
};

export default function DrawLayout({ children }: { children: React.ReactNode }) {
  return children;
}
