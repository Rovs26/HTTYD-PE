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
    "Create one cohesive fantasy dragon image.",
    "Preserve the original challenge dragon, scene, lighting, mood, and composition unless the round instruction clearly changes them.",
    `Original challenge brief:\n${basePrompt}`
  ];

  if (additionalInstruction) {
    sections.push(`Host instruction for this round:\n${additionalInstruction}`);
  }

  sections.push(
    `Student locked prompt chain:\n${studentPrompt}`,
    "Render a single polished cinematic image with no visible text, labels, watermarks, UI, or split panels."
  );

  return sections.join("\n\n");
}

export function buildBaseDragonPrompt() {
  return [
    "A cinematic, original fantasy dragon portrait for a classroom prompt engineering challenge.",
    "The dragon is friendly but powerful, with expressive eyes, detailed scales, and dramatic wing posture.",
    "Set the scene in a windswept Nordic island cove with torchlight, sea mist, and warm golden highlights.",
    "Make it visually rich enough that students can try to recreate it from prompt details."
  ].join(" ");
}
