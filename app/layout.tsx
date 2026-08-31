import type { Metadata } from "next";
import "./globals.css";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const siteOrigin = isGitHubPages
  ? "https://devgghya.github.io/pattern-lab"
  : "https://pattern-lab-dev.devgghya.chatgpt.site";

export const metadata: Metadata = {
  metadataBase: new URL(`${siteOrigin}/`),
  title: "Pattern Lab V2 — Live Generative Camera",
  description:
    "Transform a live webcam feed or uploaded image into expressive, adjustable geometric artwork.",
  openGraph: {
    title: "Pattern Lab V2",
    description: "Turn a live camera feed or image into generative marks.",
    images: [`${siteOrigin}/og.png`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pattern Lab V2",
    description: "Turn a live camera feed or image into generative marks.",
    images: [`${siteOrigin}/og.png`],
  },
  alternates: {
    canonical: `${siteOrigin}/`,
  },
  icons: {
    icon: `${siteOrigin}/favicon.svg`,
    shortcut: `${siteOrigin}/favicon.svg`,
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
