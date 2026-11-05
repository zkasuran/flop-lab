// SPDX-License-Identifier: Apache-2.0
export interface Alert {
  type: "deny" | "budget80" | "tampering";
  measuredAt: string;
  source: string;
  details: unknown;
}
export type Notifier = (alert: Alert) => Promise<void>;

/**
 * Generic JSON webhook. Retries only 429 and 5xx, at most twice, with bounded backoff.
 * Delivery failures are returned to the guard as warnings and never repeat a spend.
 * @example const notify = webhook("https://alerts.example.test/spendguard")
 */
export function webhook(url: string, fetcher: typeof fetch = fetch): Notifier {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("Webhook must be HTTPS without URL credentials");
  return async (alert) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "flop-spendguard/0.1" },
        body: JSON.stringify(alert),
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      await response.body?.cancel();
      if (response.ok) return;
      if ((response.status !== 429 && response.status < 500) || attempt === 2)
        throw new Error(`Webhook HTTP ${response.status}`);
      const seconds = Number(response.headers.get("retry-after") ?? "0");
      const delay = Math.max(
        250 * 2 ** attempt,
        Number.isFinite(seconds) ? Math.min(5000, Math.max(0, seconds * 1000)) : 0,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  };
}
