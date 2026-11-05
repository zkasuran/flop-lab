// SPDX-License-Identifier: Apache-2.0
/** Bounded fixed-window admission for a public search endpoint.
 * Allow three searches per visitor and twelve total per minute per server instance.
 * New visitors fail closed if the tracking map is full. Invalid requests should be checked first.
 * @example const admitted = new SearchBudget().take("visitor-id")
 */
export class SearchBudget {
  private readonly visitors = new Map<string, { start: number; used: number }>();
  private global = { start: 0, used: 0 };
  constructor(private readonly now = Date.now) {}
  /** Consume one search slot. Retry after the returned number of seconds when denied.
   * @example budget.take("visitor-id").allowed
   */
  take(visitor: string): { allowed: boolean; retryAfter: number } {
    const now = this.now();
    if (now >= this.global.start + 60000) this.global = { start: now, used: 0 };
    for (const [key, value] of this.visitors) if (now >= value.start + 60000) this.visitors.delete(key);
    const own = this.visitors.get(visitor) ?? { start: now, used: 0 };
    const denied =
      own.used >= 3 || this.global.used >= 12 || (!this.visitors.has(visitor) && this.visitors.size >= 1000);
    if (denied)
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil(((own.used >= 3 ? own.start : this.global.start) + 60000 - now) / 1000)),
      };
    own.used++;
    this.global.used++;
    this.visitors.set(visitor, own);
    return { allowed: true, retryAfter: 0 };
  }
}
