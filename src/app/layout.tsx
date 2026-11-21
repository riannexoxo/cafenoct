import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, lookOf, parseTheme } from "@/lib/theme";
import "@fontsource-variable/nunito";
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

// The browser bar takes the theme's background color.
export async function generateViewport(): Promise<Viewport> {
  const t = parseTheme((await cookies()).get(THEME_COOKIE)?.value), look = lookOf(t.accent);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: t.mode === "auto"
      ? [{ media: "(prefers-color-scheme: light)", color: look.light.bg }, { media: "(prefers-color-scheme: dark)", color: look.dark.bg }]
      : (t.mode === "dark" ? look.dark : look.light).bg,
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Your saved theme, read on the server so the first paint already has the right colors.
  const t = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={t.mode === "auto" ? undefined : t.mode}>
      <body>{children}</body>
    </html>
  );
}
