// SPDX-License-Identifier: Apache-2.0
"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Ask for a refreshed server render every 30 seconds while the tab is visible, and once when it becomes visible
 * again. The server cache coalesces these reads. Example: <AutoRefresh />.
 */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) router.refresh();
    };
    const timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);
  return null;
}
