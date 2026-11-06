// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { ArrowRight } from "@/components/icons";

export default function NotFound() {
  return (
    <section className="page-heading">
      <p className="eyebrow">Page not found</p>
      <h1>No tool here yet.</h1>
      <p className="muted">
        Planned tools link to their source until they ship. Press <span className="kbd">/</span> to find one, or return
        to the workbench to see the current tool status.
      </p>
      <p className="not-found-actions">
        <Link className="button" href="/#tools">
          Return to the workbench <ArrowRight />
        </Link>
      </p>
    </section>
  );
}
