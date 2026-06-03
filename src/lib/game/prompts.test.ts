import { describe, expect, it } from "vitest";
import { cleanPrompt, combinePromptChain } from "@/lib/game/prompts";
import type { PromptSubmission } from "@/lib/types";

function submission(partial: Partial<PromptSubmission>): PromptSubmission {
  return {
    id: partial.id ?? crypto.randomUUID(),
    game_session_id: "game",
    round_id: partial.round_id ?? "round",
    player_id: "player",
    initial_prompt: partial.initial_prompt ?? null,
    follow_up_prompt: partial.follow_up_prompt ?? null,
    combined_prompt: partial.combined_prompt ?? "",
    is_locked: true,
    submitted_at: partial.submitted_at ?? "2026-01-01T00:00:00.000Z"
  };
}

describe("prompt helpers", () => {
  it("cleans excess whitespace without changing words", () => {
    expect(cleanPrompt("  cinematic   dragon\nwith mist  ")).toBe("cinematic dragon with mist");
  });

  it("combines previous locked prompts with a new follow-up instruction", () => {
    const combined = combinePromptChain(
      [
        submission({
          initial_prompt: "A friendly black dragon in a cove",
          submitted_at: "2026-01-01T00:00:00.000Z"
        }),
        submission({
          follow_up_prompt: "Add glowing blue eyes",
          submitted_at: "2026-01-02T00:00:00.000Z"
        })
      ],
      "Make it more cinematic"
    );

    expect(combined).toContain("A friendly black dragon in a cove");
    expect(combined).toContain("Add glowing blue eyes");
    expect(combined).toContain("Make it more cinematic");
  });
});
