// SPDX-License-Identifier: Apache-2.0
import { toolImage } from "@/components/suite/social-image";
export const alt = "Swap planner / FLOP devnet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";
export default function Image() {
  return toolImage("swaps");
}
