import { buildBaseDragonPrompt } from "@/lib/game/prompts";

function svgDataUrl(label: string, seed: string) {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  const hueA = hash;
  const hueB = (hash + 138) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hueA}, 88%, 34%)"/>
          <stop offset="50%" stop-color="#101827"/>
          <stop offset="100%" stop-color="hsl(${hueB}, 90%, 42%)"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="28" stdDeviation="18" flood-color="#030712" flood-opacity="0.55"/>
        </filter>
      </defs>
      <rect width="1024" height="1024" fill="url(#sky)"/>
      <circle cx="780" cy="180" r="86" fill="#facc15" opacity="0.85"/>
      <path d="M120 740 C250 520 390 520 520 720 C650 510 820 520 930 742 L930 920 L120 920 Z" fill="#111827" opacity="0.82"/>
      <g filter="url(#shadow)">
        <path d="M294 644 C192 430 202 250 392 372 C448 240 576 244 630 374 C808 262 850 430 726 646 C644 784 388 788 294 644 Z" fill="#0f172a"/>
        <path d="M392 504 C432 416 594 414 636 504 C666 568 622 666 514 676 C404 666 362 568 392 504 Z" fill="#1e293b"/>
        <path d="M438 526 C454 500 488 498 504 526" stroke="#fbbf24" stroke-width="18" stroke-linecap="round"/>
        <path d="M548 526 C566 500 600 498 616 526" stroke="#fbbf24" stroke-width="18" stroke-linecap="round"/>
        <path d="M514 576 C496 628 564 628 546 576" fill="#ef4444"/>
        <path d="M390 410 L314 300 L440 358 Z" fill="#334155"/>
        <path d="M634 410 L710 300 L584 358 Z" fill="#334155"/>
      </g>
      <text x="512" y="872" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="800" fill="#fff7ed">${label}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function mockGenerateChallenge() {
  const basePrompt = buildBaseDragonPrompt();
  return {
    imageUrl: svgDataUrl("Challenge Dragon", basePrompt),
    storagePath: null,
    prompt: basePrompt
  };
}

export async function mockGenerateImage(prompt: string, label: string) {
  return {
    imageUrl: svgDataUrl(label, prompt),
    storagePath: null
  };
}

export async function mockScoreSimilarity(prompt: string) {
  let total = 0;
  for (const character of prompt.toLowerCase()) {
    total += character.charCodeAt(0);
  }
  const score = 45 + (total % 50);
  return {
    score,
    rationale: "Development fallback score based on prompt detail and deterministic variation."
  };
}
