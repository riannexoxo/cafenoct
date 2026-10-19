import type { Metadata, Viewport } from "next";
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/dm-mono/400.css";
import "@fontsource/dm-mono/500.css";
import "./globals.css";
import { brand } from "@/brand";

export const metadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.description,
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
  // The mug logo: espresso on light browser tabs, cream on dark ones. Safari uses the PNG for its theme.
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-light.png", type: "image/png", sizes: "64x64", media: "(prefers-color-scheme: light)" },
      { url: "/brand/favicon-dark.png", type: "image/png", sizes: "64x64", media: "(prefers-color-scheme: dark)" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F3ECE2" },
    { media: "(prefers-color-scheme: dark)", color: "#17110D" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
