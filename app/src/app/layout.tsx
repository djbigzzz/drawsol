import type { Metadata, Viewport } from "next";
import "@fontsource/big-shoulders-display/latin-700";
import "@fontsource/big-shoulders-display/latin-800";
import "@fontsource/ibm-plex-sans/latin-400";
import "@fontsource/ibm-plex-sans/latin-500";
import "@fontsource/ibm-plex-sans/latin-600";
import "@fontsource/ibm-plex-mono/latin-400";
import "@fontsource/ibm-plex-mono/latin-500";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "DrawSol — a prize draw you can check on-chain",
  description:
    "Prize locked in a vault before sales open. Draw at sell-out or the deadline. Randomness from ORAO VRF. Devnet demo with play money.",
};

export const viewport: Viewport = {
  themeColor: "#0B0A09",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletContextProvider>{children}</WalletContextProvider>
      </body>
    </html>
  );
}
