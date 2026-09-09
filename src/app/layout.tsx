import type { Metadata, Viewport } from "next";
import { EB_Garamond, Playwrite_BE_WAL, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

/**
 * Three voices, each with one job, per the Figma plate.
 *
 * EB Garamond italic is the voice — the fortune printed onto the paper, and
 * the name in the corner, so the two are said by the same hand. Schibsted
 * Grotesk is the small print, the credit. Playwrite BE WAL is left with one
 * job, the "Drag to break" whisper under the cookie.
 *
 * All three come through next/font, which downloads the files at build time
 * and serves them from our own origin, so the running page makes no request
 * to Google. Playwrite has no language subsets to pick, so it takes none.
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

const serif = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-serif",
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hand.variable} ${grotesk.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
