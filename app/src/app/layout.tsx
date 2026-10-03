import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletProvider";

export const metadata: Metadata = {
  title: "DrawSol · Win $500 cash prize draw",
  description:
    "A prize draw on Solana with the prize locked in a vault before the first ticket sells, a winner picked by ORAO VRF that anyone can recompute, and a full refund if it undersells. Devnet demo with play money.",
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
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
