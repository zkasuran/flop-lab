// SPDX-License-Identifier: Apache-2.0
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Footer } from "@/components/footer";
import { RouteSurface } from "@/components/motion";
import { SiteHeader } from "@/components/site-header";
import { MagicCursor, PointerSpotlight, SmoothScroll } from "@/components/shell/effects";
import { ToolContext, ToolRelated } from "@/components/shell/tool-context";
import { paletteEntries } from "@/components/suite/docs";
import "./globals.css";

const text = localFont({
  src: "../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  variable: "--font-geist",
  display: "swap",
});
const mono = localFont({
  src: "../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2",
  variable: "--font-geist-mono",
  display: "swap",
});
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "https://flop-lab.vercel.app"),
  title: { default: "flop-lab | The independent observatory for the FLOP devnet", template: "%s | flop-lab" },
  description:
    "Built on FLOP. Independent tools that read the FLOP devnet in public, check settlements and documented claims, and show what is still unproven.",
};
export const viewport: Viewport = { themeColor: "#060807" };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const entries = await paletteEntries();
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${text.variable} ${mono.variable}`}
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('flop-theme')==='light'?'light':'dark'}catch{}",
          }}
        />
      </head>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <div className="scroll-progress" aria-hidden="true" />
        <SiteHeader entries={entries} />
        <main id="main" className="container">
          <ToolContext />
          <RouteSurface>{children}</RouteSurface>
          <ToolRelated />
        </main>
        <Footer />
        <MagicCursor />
        <PointerSpotlight />
        <SmoothScroll />
      </body>
    </html>
  );
}
