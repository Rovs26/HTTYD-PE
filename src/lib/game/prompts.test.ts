import { describe, expect, it } from "vitest";
import {
  buildBaseDragonPrompt,
  buildRoundChallengePrompt,
  buildStudentImagePrompt,
  cleanPrompt,
  combinePromptChain
} from "@/lib/game/prompts";
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

  it("builds image generation context from the challenge, host instruction, and student chain", () => {
    const prompt = buildStudentImagePrompt({
      basePrompt: "Original dragon in a Nordic cove",
      additionalInstruction: "Make the dragon fly and add other dragons in the sky",
      studentPrompt: "Keep the golden torchlight and blue scale details"
    });

    expect(prompt).toContain("Original challenge brief:");
    expect(prompt).toContain("Original dragon in a Nordic cove");
    expect(prompt).toContain("Host instruction for this round:");
    expect(prompt).toContain("Make the dragon fly and add other dragons in the sky");
    expect(prompt).toContain("Student locked prompt chain:");
    expect(prompt).toContain("Keep the golden torchlight and blue scale details");
  });

  it("omits the host instruction section when a round has no extra instruction", () => {
    const prompt = buildStudentImagePrompt({
      basePrompt: "Original dragon",
      studentPrompt: "Add mist"
    });

    expect(prompt).not.toContain("Host instruction for this round:");
    expect(prompt).toContain("Original dragon");
    expect(prompt).toContain("Add mist");
  });

  it("starts the game by asking students to create the dragon identity", () => {
    const prompt = buildBaseDragonPrompt();

    expect(prompt).toContain("Round 1 challenge: create your own");
    expect(prompt).toContain("Focus on the dragon's identity first");
    expect(prompt).toContain("simple fantasy setting hint");
  });

  it("builds round 2 as a training scene challenge", () => {
    const prompt = buildRoundChallengePrompt({
      roundNumber: 2,
      basePrompt: "A semi-realistic dragon beside a torchlit Nordic cove",
      additionalInstruction: "Make the dragon fly with other dragons in the sky"
    });

    expect(prompt).toContain("round 2");
    expect(prompt).toContain("Round 2 training goal");
    expect(prompt).toContain("interaction, trainer moment, flight movement, or richer background");
    expect(prompt).toContain("Previous host challenge prompt:");
    expect(prompt).toContain("A semi-realistic dragon beside a torchlit Nordic cove");
    expect(prompt).toContain("New host instruction to adapt the challenge image:");
    expect(prompt).toContain("Make the dragon fly with other dragons in the sky");
    expect(prompt).toContain("same dragon has progressed through training");
  });

  it("builds round 3 as a harder final trial", () => {
    const prompt = buildRoundChallengePrompt({
      roundNumber: 3,
      basePrompt: "A blue dragon flying above a stormy harbor",
      additionalInstruction: "Add a rescue mission during lightning and crashing waves"
    });

    expect(prompt).toContain("round 3");
    expect(prompt).toContain("Round 3 final trial goal");
    expect(prompt).toContain("harder multi-part challenge");
    expect(prompt).toContain("Add a rescue mission during lightning and crashing waves");
    expect(prompt).toContain("story stakes, precise composition, and dramatic lighting");
  });
});
