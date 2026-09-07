import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useRealTimers();
  });

  it("allows requests up to the limit and then blocks", () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(rateLimit("k", 3, 1000).allowed).toBe(true);
    }
    const blocked = rateLimit("k", 3, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("reports the remaining allowance", () => {
    expect(rateLimit("k", 3, 1000).remaining).toBe(2);
    expect(rateLimit("k", 3, 1000).remaining).toBe(1);
    expect(rateLimit("k", 3, 1000).remaining).toBe(0);
  });

  it("keeps separate counters per key", () => {
    expect(rateLimit("a", 1, 1000).allowed).toBe(true);
    expect(rateLimit("a", 1, 1000).allowed).toBe(false);
    // A different key must be unaffected — one student hitting a limit cannot lock out another.
    expect(rateLimit("b", 1, 1000).allowed).toBe(true);
  });

  it("lets the window expire", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    expect(rateLimit("k", 1, 1000).allowed).toBe(true);
    expect(rateLimit("k", 1, 1000).allowed).toBe(false);

    vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
    expect(rateLimit("k", 1, 1000).allowed).toBe(true);
    vi.useRealTimers();
  });
});
