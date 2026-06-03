import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "How to Train Your Dragon: Prompt Engineering",
  description: "A live classroom AI image generation challenge for learning prompt engineering."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
