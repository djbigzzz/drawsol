import type { Metadata, Viewport } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import { WalletContextProvider } from "@/components/WalletProvider";

const SITE_URL = "https://djbigzzz.github.io/drawsol/";
const TITLE = "DrawSol · Win $500 cash prize draw";
const DESCRIPTION =
  "A prize draw on Solana with the prize locked in a vault before the first ticket sells, a winner picked by ORAO VRF that anyone can recompute, and a full refund if it undersells. Devnet demo with play money.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // the social preview (public/brand/og-1200x630.png) needs an absolute URL; the host is GitHub Pages
  openGraph: {
    type: "website",
    siteName: "DrawSol",
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: `${SITE_URL}brand/og-1200x630.png`, width: 1200, height: 630, alt: "DrawSol: win $500 cash, a prize draw on Solana" }],
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [`${SITE_URL}brand/og-1200x630.png`] },
};

export const viewport: Viewport = {
  themeColor: "#0B1B3F",
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
