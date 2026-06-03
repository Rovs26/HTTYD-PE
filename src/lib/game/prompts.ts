import type { PromptSubmission } from "@/lib/types";

export function cleanPrompt(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function combinePromptChain(
  previousSubmissions: Pick<
    PromptSubmission,
    "combined_prompt" | "initial_prompt" | "follow_up_prompt" | "submitted_at"
  >[],
  nextPrompt: string
) {
  const cleaned = cleanPrompt(nextPrompt);
  const previous = [...previousSubmissions]
    .sort((left, right) => left.submitted_at.localeCompare(right.submitted_at))
    .map((submission) => submission.follow_up_prompt || submission.initial_prompt || "")
    .filter(Boolean);

  return [...previous, cleaned].join("\n\nThen apply this additional instruction:\n");
}

export function buildBaseDragonPrompt() {
  return [
    "A cinematic, original fantasy dragon portrait for a classroom prompt engineering challenge.",
    "The dragon is friendly but powerful, with expressive eyes, detailed scales, and dramatic wing posture.",
    "Set the scene in a windswept Nordic island cove with torchlight, sea mist, and warm golden highlights.",
    "Make it visually rich enough that students can try to recreate it from prompt details."
  ].join(" ");
}
