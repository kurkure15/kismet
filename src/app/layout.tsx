import type { Metadata, Viewport } from "next";
import { Playwrite_BE_WAL, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Two voices. Playwrite BE WAL is the hand: the name in the corner, the
 * "Drag to break" whisper, and the fortune itself, written onto the paper —
 * so the slip reads as something someone wrote, not something typeset.
 * Schibsted Grotesk is the small print, the credit.
 *
 * Both come through next/font, which downloads the files at build time and
 * serves them from our own origin, so the running page makes no request to
 * Google. The hand is drawn onto a canvas texture for the paper, but it is
 * the same self-hosted file either way. Playwrite has no language subsets to
 * pick, so it takes none.
 */
const hand = Playwrite_BE_WAL({
  variable: "--font-hand",
  display: "swap",
});

const grotesk = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-grotesk",
  display: "swap",
});

const DESCRIPTION = "A fortune cookie you can crack open, read, and eat.";

export const metadata: Metadata = {
  // Absolute URLs for crawlers; Vercel sets VERCEL_PROJECT_PRODUCTION_URL.
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  title: "Kismet",
  description: DESCRIPTION,
  openGraph: {
    title: "Kismet",
    description: DESCRIPTION,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "A fortune cookie waiting to be cracked" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Kismet",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  // Matches the page, so the browser chrome reads as part of it.
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  // iOS zooms the page into any focused field set under 16px, and the
  // writing field is 13px on a phone. This stops that. Pinch-zoom still
  // works — Safari ignores the cap for it — so nothing is taken away.
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hand.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
