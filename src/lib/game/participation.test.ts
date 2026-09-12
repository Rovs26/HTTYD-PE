import { describe, expect, it } from "vitest";
import { isVotableTargetId } from "@/lib/game/participation";

/**
 * The vote target field has to accept a loose string, because it carries either a player uuid
 * or an opaque "b-" ballot id used during anonymous voting. Before this guard, anything else
 * went straight into a uuid column: Postgres raised 22P02, which surfaced to the student as a
 * 500 "something went wrong" and was logged as an unhandled server defect. Any student could
 * trigger it at will, and a SQL-shaped value additionally tripped the database's WAF.
 */
describe("isVotableTargetId", () => {
  it("accepts a real uuid", () => {
    expect(isVotableTargetId("b63fbab2-2730-4bd5-a149-81608c848887")).toBe(true);
    expect(isVotableTargetId("B63FBAB2-2730-4BD5-A149-81608C848887")).toBe(true);
  });

  it("accepts an opaque ballot id", () => {
    expect(isVotableTargetId("b-abc123")).toBe(true);
  });

  it("rejects the values that used to reach the database and 500", () => {
    for (const bad of [
      "hello",
      "; DROP TABLE votes;--",
      "not-a-uuid",
      "b63fbab2-2730-4bd5-a149",
      "b63fbab2273 04bd5a14981608c848887",
      ""
    ]) {
      expect(isVotableTargetId(bad)).toBe(false);
    }
  });
});
