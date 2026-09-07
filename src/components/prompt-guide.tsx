"use client";

/**
 * The pedagogical core of the game used to be a bare textarea with a placeholder. These are
 * the dimensions the vision scorer actually compares against, so naming them turns guesswork
 * into a checklist a student can work through.
 */
export const PROMPT_DIMENSIONS = [
  { key: "subject", label: "Subject", hint: "the dragon itself — species, size, scales, horns, wings, eyes" },
  { key: "action", label: "Action", hint: "what it is doing right now, not just standing there" },
  { key: "setting", label: "Setting", hint: "where it is — cliffs, sea mist, a forge, a village at dusk" },
  { key: "lighting", label: "Lighting", hint: "torchlight, golden hour, storm light, rim lighting" },
  { key: "mood", label: "Mood", hint: "the feeling — proud, wary, playful, menacing" },
  { key: "composition", label: "Composition", hint: "camera angle and framing — low angle, close up, wide shot" }
] as const;

/** Cheap heuristic: which dimensions does this prompt look like it already covers? */
const DIMENSION_HINTS: Record<string, string[]> = {
  subject: ["dragon", "scale", "wing", "horn", "eye", "claw", "tail", "snout"],
  action: ["flying", "diving", "roaring", "landing", "perched", "soaring", "breathing", "running", "circling", "curled"],
  setting: ["cliff", "sea", "mist", "forest", "village", "mountain", "cave", "sky", "island", "forge", "beach"],
  lighting: ["light", "sunset", "sunrise", "golden", "torch", "glow", "shadow", "backlit", "dusk", "dawn", "moonlit"],
  mood: ["proud", "fierce", "gentle", "playful", "menacing", "calm", "wary", "majestic", "friendly", "epic"],
  composition: ["angle", "close", "wide", "shot", "portrait", "framed", "silhouette", "perspective", "foreground"]
};

export function coveredDimensions(prompt: string) {
  const lower = prompt.toLowerCase();
  return new Set(
    Object.entries(DIMENSION_HINTS)
      .filter(([, words]) => words.some((word) => lower.includes(word)))
      .map(([key]) => key)
  );
}

export function PromptGuide({ prompt }: { prompt: string }) {
  const covered = coveredDimensions(prompt);
  const missing = PROMPT_DIMENSIONS.filter((dimension) => !covered.has(dimension.key));
  const firstMissing = missing[0];

  return (
    <div>
      <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-sea">
        Strong prompts cover
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {PROMPT_DIMENSIONS.map((dimension) => {
          const done = covered.has(dimension.key);
          return (
            <li
              key={dimension.key}
              className={
                done
                  ? "bg-fire px-3.5 py-2.5 font-mono text-[13px] font-extrabold uppercase tracking-[0.08em] text-ground"
                  : "border border-dashed border-white/35 px-3.5 py-2.5 font-mono text-[13px] font-bold uppercase tracking-[0.08em] text-ink-soft"
              }
            >
              {dimension.label}
              <span className="sr-only">{done ? " covered" : " not yet mentioned"}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
        {firstMissing ? (
          <>
            <span className="font-bold text-ink">{firstMissing.label}</span> is missing &mdash;{" "}
            {firstMissing.hint}.{" "}
          </>
        ) : (
          <>All six covered. </>
        )}
        A guide, not part of your score.
      </p>
    </div>
  );
}

/** Compact coverage tags for a revealed prompt, where there is no editing to guide. */
export function CoverageTags({ prompt }: { prompt: string }) {
  const covered = [...coveredDimensions(prompt)];
  if (!covered.length) {
    return null;
  }
  const labelFor = (key: string) =>
    PROMPT_DIMENSIONS.find((dimension) => dimension.key === key)?.label ?? key;

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {covered.map((key) => (
        <li
          key={key}
          className="border border-line bg-white/5 px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
        >
          {labelFor(key)}
        </li>
      ))}
    </ul>
  );
}
