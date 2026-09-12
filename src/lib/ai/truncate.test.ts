import { describe, expect, it } from "vitest";
import { truncateOnBoundary } from "@/lib/ai/openai";

describe("truncateOnBoundary", () => {
  it("leaves short text alone", () => {
    expect(truncateOnBoundary("Short enough.", 500)).toBe("Short enough.");
  });

  // The real case from the QA run: a rationale hit the cap and ended "The body shape is".
  it("trims back to the last complete sentence", () => {
    const text = `${"A".repeat(300)}. ${"B".repeat(300)}. tail`;
    const out = truncateOnBoundary(text, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.endsWith(".")).toBe(true);
    expect(out).not.toContain("tail");
  });

  it("falls back to a whole word with an ellipsis when no sentence fits", () => {
    const out = truncateOnBoundary(`${"word ".repeat(200)}end`, 60);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });

  it("never cuts a word in half", () => {
    const out = truncateOnBoundary("alpha beta gamma delta epsilon zeta", 20);
    const body = out.replace("…", "").trimEnd();
    expect("alpha beta gamma delta epsilon zeta".startsWith(body)).toBe(true);
    expect(body.endsWith(" ")).toBe(false);
    for (const word of body.split(" ")) {
      expect("alpha beta gamma delta epsilon zeta".split(" ")).toContain(word);
    }
  });
});
