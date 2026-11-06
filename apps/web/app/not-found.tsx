// SPDX-License-Identifier: Apache-2.0
import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { PageHero } from "@/components/page-hero";

export default function NotFound() {
  return (
    <PageHero
      eyebrow="Page not found"
      lines={["No tool", "here yet."]}
      accent={1}
      lede={
        <>
          Planned tools link to their source until they ship. Press <span className="kbd">/</span> to find one, or
          return to the workbench to see the current tool status.
        </>
      }
    >
      <Link className="button" href="/#tools">
        Return to the workbench <ArrowRight />
      </Link>
      <Link className="text-link" href="/network">
        Read the network <ArrowRight />
      </Link>
    </PageHero>
  );
}
