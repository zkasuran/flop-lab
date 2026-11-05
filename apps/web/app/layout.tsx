// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import { CommandPalette, ThemeToggle } from '@/components/controls';
import { Footer } from '@/components/footer';
import { repository } from '@/content/tools';
import './globals.css';

const text = localFont({ src: '../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2', variable: '--font-geist', display: 'swap' });
const mono = localFont({ src: '../node_modules/@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2', variable: '--font-geist-mono', display: 'swap' });
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? 'https://flop-lab.vercel.app'),
  title: { default: 'flop-lab | Open tools for FLOP devnet', template: '%s | flop-lab' },
  description: 'Independent tools to inspect, test and build on FLOP devnet. Real observations with sources and clear limits.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning className={`${text.variable} ${mono.variable}`}>
    <head><script dangerouslySetInnerHTML={{ __html: "try{document.documentElement.dataset.theme=localStorage.getItem('flop-theme')==='light'?'light':'dark'}catch{}" }} /></head>
    <body><a className="skip" href="#main">Skip to content</a>
      <header className="topbar container"><Link className="wordmark" href="/">flop<span>-lab</span></Link>
        <nav aria-label="Main navigation"><Link href="/#tools">Tools</Link><a className="nav-repo" href={repository}>Source ↗</a><CommandPalette /><ThemeToggle /></nav>
      </header>
      <main id="main" className="container">{children}</main><Footer />
    </body>
  </html>;
}
