// SPDX-License-Identifier: Apache-2.0
"use client";
import { type ReactNode } from "react";
import { ReadingReveal } from "./motion";

export function Reveal({ children }: { children: ReactNode }) {
  return <ReadingReveal>{children}</ReadingReveal>;
}
