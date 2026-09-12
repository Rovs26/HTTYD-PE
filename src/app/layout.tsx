import type { Metadata } from "next";
import { Anton, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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
  // for a shared game link is broken everywhere it is pasted. Vercel supplies the deployment
  // host; NEXT_PUBLIC_APP_URL wins when the game runs on its own domain.
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000")
  ),
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
