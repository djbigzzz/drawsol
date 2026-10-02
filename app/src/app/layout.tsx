import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/standard.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "DrawSol · a prize draw you can check on-chain",
  description:
    "The prize is locked in a vault before the first ticket sells. Drawn at sell-out or the deadline. Every ticket gets an instant result from ORAO VRF randomness. Devnet demo with play money.",
};

export const viewport: Viewport = {
  themeColor: "#EFE8D9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
