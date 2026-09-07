import { roundConfig } from "@/lib/game/progression";
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

export function buildStudentImagePrompt(input: {
  basePrompt: string;
  studentPrompt: string;
  additionalInstruction?: string | null;
}) {
  const basePrompt = cleanPrompt(input.basePrompt);
  const studentPrompt = cleanPrompt(input.studentPrompt);
  const additionalInstruction = input.additionalInstruction
    ? cleanPrompt(input.additionalInstruction)
    : "";

  const sections = [
    "Create one cohesive semi-realistic cinematic fantasy dragon image.",
    "Preserve the original challenge dragon, scene, lighting, mood, and composition unless the round instruction clearly changes them.",
    `Original challenge brief:\n${basePrompt}`
  ];

  if (additionalInstruction) {
    sections.push(`Host instruction for this round:\n${additionalInstruction}`);
  }

  sections.push(
    `Student locked prompt chain:\n${studentPrompt}`,
    "Render a single polished cinematic fantasy illustration with believable scale texture, dramatic depth, natural lighting, and no visible text, labels, watermarks, UI, split panels, flat vector art, emoji styling, or simple cartoon shapes."
  );

  return sections.join("\n\n");
}

export function buildRoundChallengePrompt(input: {
  basePrompt: string;
  additionalInstruction: string;
  roundNumber: number;
}) {
  const basePrompt = cleanPrompt(input.basePrompt);
  const additionalInstruction = cleanPrompt(input.additionalInstruction);
  const roundGoal =
    roundConfig(input.roundNumber)?.challengeGoal ??
    "Keep the same dragon identity, then raise the difficulty of the challenge.";

  return [
    `Create the evolved host challenge image for round ${input.roundNumber} of a classroom dragon prompt game.`,
    roundGoal,
    "Use the previous host challenge prompt as the visual foundation, preserving the dragon identity, fantasy world, semi-realistic cinematic style, lighting continuity, and recognizable details.",
    `Previous host challenge prompt:\n${basePrompt}`,
    `New host instruction to adapt the challenge image:\n${additionalInstruction}`,
    "The new image must visibly reflect the new host instruction while still feeling like the same dragon has progressed through training.",
    "Render one polished semi-realistic cinematic fantasy image with believable scale texture, depth, natural lighting, and no visible text, labels, watermarks, UI, split panels, flat vector art, emoji styling, or simple cartoon shapes."
  ].join("\n\n");
}

export function buildBaseDragonPrompt() {
  return [
    "A single fantasy dragon, centred portrait, filling most of the frame.",
    "Show the dragon's identity clearly: head, horns, eyes, scale texture, and wing shape.",
    "Plain uncluttered backdrop — soft gradient or simple mist. No buildings, no landscape, no crowd, no story.",
    "Semi-realistic illustration, even lighting, no text or labels.",
    "Keep it simple. This is the first round and students must be able to describe it in one sentence."
  ].join(" ");
}

/**
 * Visual context for the similarity scorer.
 *
 * Deliberately excludes the host's `base_prompt`: the scorer is already shown the challenge
 * image, and its rationale is displayed to students, so putting the host's brief into the
 * prompt risks the model quoting it back into a student-visible field.
 */
export function buildScoringContext(input: {
  studentPrompt: string;
  additionalInstruction?: string | null;
}) {
  const sections = ["What the student asked for:", cleanPrompt(input.studentPrompt)];
  if (input.additionalInstruction) {
    sections.push(`Host instruction for this round:\n${cleanPrompt(input.additionalInstruction)}`);
  }
  return sections.join("\n\n");
}
