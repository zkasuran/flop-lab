// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from "next";
import { KestraPipeline } from "./pipeline";

export const metadata: Metadata = {
  title: "FLOP for Kestra",
  description:
    "Turn FLOP devnet reads into Kestra tasks. Inspect a recorded execution, its YAML and the limits of each check.",
};

export default function KestraPage() {
  return <KestraPipeline />;
}
