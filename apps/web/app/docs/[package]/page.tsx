// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MotionLink, ReadingReveal } from "../../../components/motion";
import { readCatalog } from "../catalog";
import { Readme } from "../markdown";
import { ReadingRail } from "../view";
import styles from "../docs.module.css";

export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() {
  return readCatalog().docs.map((doc) => ({ package: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ package: string }> }): Promise<Metadata> {
  const slug = (await params).package;
  const doc = readCatalog().docs.find((item) => item.slug === slug);
  return { title: doc ? `${doc.title} documentation` : "Guide not found", description: doc?.question };
}

export default async function PackagePage({ params }: { params: Promise<{ package: string }> }) {
  const slug = (await params).package;
  const { docs, generatedAt } = readCatalog();
  const doc = docs.find((item) => item.slug === slug);
  if (!doc) notFound();
  return (
    <>
      <header className="page-heading">
        <MotionLink href="/docs">← All documentation</MotionLink>
        <ReadingReveal>
          <p className="eyebrow">
            {doc.section} / {doc.packageName}
          </p>
        </ReadingReveal>
        <ReadingReveal order={1}>
          <h1>{doc.title}</h1>
        </ReadingReveal>
        <div className={styles.actions}>
          <MotionLink href={doc.source}>Source README ↗</MotionLink>
          <MotionLink href={`/docs/${doc.slug}/readme`}>Raw README</MotionLink>
          {doc.toolHref && (
            <MotionLink className="button" href={doc.toolHref}>
              Open the tool →
            </MotionLink>
          )}
          <MotionLink href="/docs/cli">{doc.command ?? "Library import guide"}</MotionLink>
        </div>
        {doc.command ? (
          <p>
            Suite entry: <code>{doc.command}</code>. The README below lists the package options.
          </p>
        ) : (
          <p>This shared client is imported by other packages. It has no flop subcommand.</p>
        )}
        <p className={styles.meta}>
          Generated from the source README at {generatedAt}. SHA-256: <code>{doc.sha256}</code>.
        </p>
      </header>
      <ReadingRail>
        <div className={styles.reader}>
          <Readme blocks={doc.blocks} source={doc.source} />
          <nav className={styles.contents} aria-label="README contents">
            <strong>On this page</strong>
            <ol>
              {doc.headings.map((heading) => (
                <li key={heading.id}>
                  <MotionLink href={`#${heading.id}`}>{heading.title}</MotionLink>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </ReadingRail>
    </>
  );
}
