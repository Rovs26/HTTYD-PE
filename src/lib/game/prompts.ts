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

  return [
    `Create the evolved host challenge image for round ${input.roundNumber} of a classroom dragon prompt game.`,
    "Use the previous host challenge prompt as the visual foundation, preserving the dragon identity, fantasy world, semi-realistic cinematic style, lighting continuity, and recognizable scene details.",
    `Previous host challenge prompt:\n${basePrompt}`,
    `New host instruction to adapt the challenge image:\n${additionalInstruction}`,
    "The new image must visibly reflect the new host instruction while still feeling like the same dragon challenge has evolved.",
    "Render one polished semi-realistic cinematic fantasy image with believable scale texture, depth, natural lighting, and no visible text, labels, watermarks, UI, split panels, flat vector art, emoji styling, or simple cartoon shapes."
  ].join("\n\n");
}

export function buildBaseDragonPrompt() {
  return [
    "A semi-realistic cinematic fantasy dragon portrait for a classroom prompt engineering challenge.",
    "The dragon is friendly but powerful, with expressive eyes, layered horns, detailed metallic scales, subtle battle-worn texture, and dramatic wing posture.",
    "Set the scene in a windswept Nordic island cove with torchlight, sea mist, carved wood, distant cliffs, and warm golden highlights.",
    "Use a rich 3D fantasy illustration style with believable depth and lighting, not flat vector art, emoji styling, or simple cartoon shapes.",
    "Make it visually rich enough that students can try to recreate it from prompt details, with no visible text or labels."
  ].join(" ");
}
