// SPDX-License-Identifier: Apache-2.0
import type { Section } from "@/content/tools";
import type { SectionDictionary } from "./types";
import { observe } from "./observe";
import { verify } from "./verify";
import { build } from "./build";
import { operate } from "./operate";
import { agents } from "./agents";
// The remaining section's dedicated file is denied by the build environment.
// Its original prose stays visible and marked as English on the generic route.
export const sectionCopy: Partial<Record<Section, SectionDictionary>> = { observe, verify, build, operate, agents };
