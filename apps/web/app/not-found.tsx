// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
export default function NotFound() {
  return <section className="page-heading"><p className="eyebrow">Page not found</p><h1>No tool here yet.</h1><p><Link href="/">Return to the workbench</Link> to see the current tool status.</p></section>;
}
