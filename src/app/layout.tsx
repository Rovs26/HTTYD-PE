import type { Metadata } from "next";
import { Anton, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/** Where the game actually runs. Override with NEXT_PUBLIC_APP_URL on any other deployment. */
const PRODUCTION_ORIGIN = "https://www.httyd.online";

/**
 * Base URL for resolving `/og-image.jpg` into the absolute URL a link preview needs.
 *
 * `NEXT_PUBLIC_APP_URL` is `http://localhost:3000` in `.env.example`, so a deployment that
 * copied its variables from there advertises localhost to every chat app the game link is
 * pasted into. A localhost value is therefore only honoured in development, where it is
 * correct; a production build falls through to the real origin instead.
 */
function metadataOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const isLocal = Boolean(configured && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(configured));

  if (configured && (!isLocal || process.env.NODE_ENV !== "production")) {
    return configured;
  }

  return PRODUCTION_ORIGIN;
}

// Anton carries every title. One weight only — emphasis comes from size, never weight.
const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap"
});

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap"
});

// Codes, timers, scores and ranks. Tabular figures stop the countdown jittering.
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700", "800"],
  variable: "--font-jetbrains",
  display: "swap"
});

export const metadata: Metadata = {
  // Without this, `/og-image.jpg` resolves against http://localhost:3000, so the preview card
  // for a shared game link is broken everywhere it is pasted.
  //
  // The Vercel system variables are deliberately not trusted here: this project does not have
  // "automatically expose System Environment Variables" turned on, so VERCEL_PROJECT_PRODUCTION_URL
  // is undefined at build time and a fallback chain that ends at localhost silently produced
  // exactly the broken card it was meant to fix. The live domain is the honest default.
  metadataBase: new URL(metadataOrigin()),
  title: "How to Train Your Dragon: Prompt Engineering",
  description: "A live classroom AI image generation challenge for learning prompt engineering.",
  openGraph: {
    title: "How to Train Your Dragon: Prompt Engineering",
    description:
      "Thirty students. Three rounds. Everyone writes a prompt against the same dragon, the class votes, and the room reads every prompt afterwards.",
    images: [{ url: "/og-image.jpg", width: 1536, height: 1024 }],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.jpg"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${archivo.variable} ${jetbrains.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
