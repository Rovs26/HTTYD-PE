import { describe, expect, it } from "vitest";
import { joinsAsSpectator } from "@/lib/game/join-eligibility";
import type { Round } from "@/lib/types";

function round(
  status: Round["status"],
  submissionOpen: boolean
): Pick<Round, "status" | "submission_open"> {
  return { status, submission_open: submissionOpen };
}

describe("joinsAsSpectator", () => {
  it("lets anyone in while the game is still in the lobby", () => {
    expect(
      joinsAsSpectator({ sessionStatus: "lobby", currentRoundNumber: 0, round: null })
    ).toBe(false);
  });

  it("lets a student in who scans the code just after the host pressed Start", () => {
    // This is the normal classroom flow and it was previously broken: everyone who joined
    // after Start became a spectator who could never type a prompt.
    expect(
      joinsAsSpectator({
        sessionStatus: "active",
        currentRoundNumber: 1,
        round: round("setup", false)
      })
    ).toBe(false);
  });

  it("lets a student in while round one is still taking prompts", () => {
    expect(
      joinsAsSpectator({
        sessionStatus: "active",
        currentRoundNumber: 1,
        round: round("submissions", true)
      })
    ).toBe(false);
  });

  it("makes someone a spectator once round one has stopped taking prompts", () => {
    for (const status of ["generating", "voting", "scored", "complete"] as const) {
      expect(
        joinsAsSpectator({
          sessionStatus: "active",
          currentRoundNumber: 1,
          round: round(status, false)
        })
      ).toBe(true);
    }
  });

  it("makes anyone arriving in a later round a spectator", () => {
    expect(
      joinsAsSpectator({
        sessionStatus: "active",
        currentRoundNumber: 2,
        round: round("submissions", true)
      })
    ).toBe(true);
  });

  it("treats an ended game as not-spectator, since joining is refused earlier anyway", () => {
    expect(
      joinsAsSpectator({ sessionStatus: "ended", currentRoundNumber: 3, round: null })
    ).toBe(false);
  });
});
