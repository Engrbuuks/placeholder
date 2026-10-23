import type { Metadata } from "next";
import { appConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: appConfig.name, template: `%s | ${appConfig.name}` },
  description: appConfig.tagline,
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  // The picture shown when the site link is shared on WhatsApp, LinkedIn or X.
  openGraph: { title: appConfig.name, description: appConfig.tagline, images: [{ url: "/illustrations/og.jpg", width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", images: ["/illustrations/og.jpg"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
