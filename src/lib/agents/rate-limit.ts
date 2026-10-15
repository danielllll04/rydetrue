/** Parse Retry-After seconds (including fractions) or an HTTP date. */
export function retryAfterMs(
  value: string | null,
  now = Date.now(),
): number | null {
  if (!value?.trim()) return null;
  if (/^\d+(\.\d+)?$/.test(value.trim()))
    return Math.ceil(Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

/** Groq reset headers use durations such as 2m59.56s. */
export function resetDurationMs(value: string | null): number | null {
  if (!value || !/^(?:\d+(?:\.\d+)?[hms])+$/.test(value)) return null;
  return Math.ceil(
    [...value.matchAll(/(\d+(?:\.\d+)?)([hms])/g)].reduce(
      (sum, match) =>
        sum +
        Number(match[1]) * ({ h: 3600000, m: 60000, s: 1000 }[match[2]] ?? 0),
      0,
    ),
  );
}

export function waitForQuota(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new Error("Aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** Shared within one server process; never used by mock mode. */
export class GroqQuota {
  remaining: number | null = null;
  resetAt = 0;
  blockedUntil = 0;
  observe(headers: Headers, status: number) {
    if (status === 200) this.blockedUntil = 0;
    const remaining = headers.get("x-ratelimit-remaining-tokens");
    this.remaining =
      remaining !== null && Number.isFinite(Number(remaining))
        ? Number(remaining)
        : null;
    const reset = resetDurationMs(headers.get("x-ratelimit-reset-tokens"));
    this.resetAt = reset === null ? 0 : Date.now() + reset;
    if (status === 429) {
      const retry = retryAfterMs(headers.get("retry-after"));
      if (retry !== null)
        this.blockedUntil = Math.max(this.blockedUntil, Date.now() + retry);
    }
  }
  async before(estimatedTokens: number, signal?: AbortSignal) {
    const target = Math.max(
      this.blockedUntil,
      this.remaining !== null && this.remaining < estimatedTokens
        ? this.resetAt
        : 0,
    );
    const delay = Math.max(0, target - Date.now());
    if (delay > 90000) return false; // Defer instead of retrying before the server permits it.
    if (delay) await waitForQuota(delay + 100, signal);
    if (Date.now() >= this.resetAt) this.remaining = null;
    return true;
  }
}
