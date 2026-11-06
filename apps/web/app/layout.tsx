// SPDX-License-Identifier: Apache-2.0
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Footer } from "@/components/footer";
import { RouteSurface } from "@/components/motion";
import { SiteHeader } from "@/components/site-header";
import { paletteEntries } from "@/components/suite/docs";
import { SectionNavigation } from "@/components/suite/navigation";
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
  title: { default: "flop-lab | Check FLOP's promises from outside", template: "%s | flop-lab" },
  description:
    "Does a settlement add up? Does the network match its docs? Independent FLOP devnet tools with dated findings you can inspect and rerun.",
};
export const viewport: Viewport = { themeColor: "#0a0d0b" };

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
        <SiteHeader entries={entries} />
        <SectionNavigation />
        <main id="main" className="container">
          <RouteSurface>{children}</RouteSurface>
        </main>
        <Footer />
      </body>
    </html>
  );
}
