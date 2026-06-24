import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimitForTests } from "../server/rateLimit";

beforeEach(() => resetRateLimitForTests());
afterEach(() => resetRateLimitForTests());

describe("checkRateLimit (token bucket, capacity 20 / 60s)", () => {
  it("allows up to capacity then blocks, and refills over time", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(checkRateLimit("owner", { now: t0 }).ok).toBe(true);
    const blocked = checkRateLimit("owner", { now: t0 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    // after a full refill window, allowed again
    expect(checkRateLimit("owner", { now: t0 + 60_000 }).ok).toBe(true);
  });

  it("buckets are per-key", () => {
    const t0 = 2_000_000;
    for (let i = 0; i < 20; i++) checkRateLimit("a", { now: t0 });
    expect(checkRateLimit("a", { now: t0 }).ok).toBe(false);
    expect(checkRateLimit("b", { now: t0 }).ok).toBe(true);
  });
});
