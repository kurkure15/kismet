import type { Metadata, Viewport } from "next";
import { EB_Garamond, Jost } from "next/font/google";
import "./globals.css";

/**
 * Exactly two voices, and no third one anywhere on the page.
 *
 * EB Garamond carries the one thing that is meant to be read — the fortune,
 * printed onto the paper. Jost carries everything that is meant to be seen:
 * the name on its side, the credit.
 *
 * Both come through next/font, which downloads the files at build time and
 * serves them from our own origin, so the running page makes no request to
 * Google. The Garamond is drawn onto a canvas texture rather than set in the
 * DOM, but it is the same self-hosted face either way.
 */
const serif = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-serif",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-jost",
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
  // Matches the paper, so the browser chrome reads as part of the sheet.
  themeColor: "#f5f1e3",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${jost.variable}`}>
      <body>{children}</body>
    </html>
  );
}
