import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://devgghya.github.io/pattern-lab/"),
  title: "Pattern Lab — Image to Generative Marks",
  description:
    "Transform any image into expressive halftone artwork using live, adjustable geometric marks.",
  openGraph: {
    title: "Pattern Lab",
    description: "Turn any image into generative marks.",
    images: ["https://devgghya.github.io/pattern-lab/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pattern Lab",
    description: "Turn any image into generative marks.",
    images: ["https://devgghya.github.io/pattern-lab/og.png"],
  },
  alternates: {
    canonical: "https://devgghya.github.io/pattern-lab/",
  },
  icons: {
    icon: "https://devgghya.github.io/pattern-lab/favicon.svg",
    shortcut: "https://devgghya.github.io/pattern-lab/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
