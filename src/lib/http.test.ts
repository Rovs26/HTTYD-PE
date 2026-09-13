import { describe, expect, it } from "vitest";
import { z } from "zod";
import { friendlyValidationMessage } from "@/lib/http";

function errorFor(schema: z.ZodTypeAny, value: unknown) {
  const result = schema.safeParse(value);
  if (result.success) throw new Error("expected a validation failure");
  return result.error;
}

/**
 * Students saw Zod's developer-facing defaults — "String must contain at least 8
 * character(s)" — on their phones. These pin the wording they get instead.
 */
describe("friendlyValidationMessage", () => {
  const promptSchema = z.object({ prompt: z.string().trim().min(8).max(4000) });

  it("tells a student to write more, not to satisfy a string rule", () => {
    const message = friendlyValidationMessage(errorFor(promptSchema, { prompt: "dragon" }));
    expect(message).toBe("Write a bit more before locking it in — at least 8 characters.");
    expect(message).not.toMatch(/String|character\(s\)/);
  });

  it("distinguishes too long from too short", () => {
    expect(friendlyValidationMessage(errorFor(promptSchema, { prompt: "a".repeat(4001) }))).toBe(
      "That prompt is too long. Keep it under 4000 characters."
    );
  });

  it("covers the other fields a person can type into", () => {
    expect(
      friendlyValidationMessage(errorFor(z.object({ name: z.string().min(1) }), { name: "" }))
    ).toMatch(/Enter a name/);
    expect(
      friendlyValidationMessage(errorFor(z.object({ pin: z.string().min(4) }), { pin: "1" }))
    ).toMatch(/host PIN/);
    expect(
      friendlyValidationMessage(
        errorFor(z.object({ playerToken: z.string().min(16) }), { playerToken: "x" })
      )
    ).toMatch(/not signed in/);
  });

  it("falls back to a plain sentence rather than leaking the rule", () => {
    const message = friendlyValidationMessage(
      errorFor(z.object({ somethingElse: z.number() }), { somethingElse: "nope" })
    );
    expect(message).toBe("Something in that request was not valid. Check it and try again.");
  });
});
