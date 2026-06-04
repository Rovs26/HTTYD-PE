import { buildBaseDragonPrompt } from "@/lib/game/prompts";

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function svgDataUrl(label: string, seed: string) {
  let hash = 0;
  for (const character of seed) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  const hueA = (hash + 205) % 360;
  const hueB = (hash + 34) % 360;
  const scaleMarks = Array.from({ length: 12 })
    .map((_, index) => {
      const x = 342 + index * 31;
      const y = 608 + (index % 2) * 17;
      return `<path d="M${x} ${y} C${x + 20} ${y - 19} ${x + 44} ${y - 16} ${x + 58} ${y + 3}" stroke="#d2b47c" stroke-width="5" opacity="0.48" fill="none"/>`;
    })
    .join("");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <defs>
        <radialGradient id="sky" cx="72%" cy="17%" r="88%">
          <stop offset="0%" stop-color="#f8d79a"/>
          <stop offset="26%" stop-color="#756252"/>
          <stop offset="62%" stop-color="#172235"/>
          <stop offset="100%" stop-color="#06101b"/>
        </radialGradient>
        <linearGradient id="scale" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hueA}, 40%, 62%)"/>
          <stop offset="42%" stop-color="#8a7963"/>
          <stop offset="100%" stop-color="#1d2938"/>
        </linearGradient>
        <linearGradient id="wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#876d47"/>
          <stop offset="100%" stop-color="hsl(${hueB}, 42%, 18%)"/>
        </linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="30" stdDeviation="28" flood-color="#020617" flood-opacity="0.68"/>
        </filter>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" stitchTiles="stitch"/>
          <feColorMatrix type="saturate" values="0"/>
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.16"/>
          </feComponentTransfer>
          <feBlend mode="overlay" in2="SourceGraphic"/>
        </filter>
      </defs>
      <rect width="1024" height="1024" fill="url(#sky)"/>
      <circle cx="785" cy="158" r="88" fill="#f7c95f" opacity="0.88"/>
      <path d="M0 770 C178 598 292 578 430 696 C570 572 724 575 1024 744 L1024 1024 L0 1024 Z" fill="#101827"/>
      <path d="M72 704 C172 565 264 538 370 607 C492 493 658 508 806 627 C896 696 962 790 1024 900 L1024 1024 L72 1024 Z" fill="#172033" opacity="0.86"/>
      <g filter="url(#shadow)">
        <path d="M204 600 C88 336 131 195 400 378 C462 203 597 195 666 379 C911 220 955 382 809 624 C725 765 332 773 204 600 Z" fill="url(#wing)" opacity="0.9"/>
        <path d="M282 612 C331 392 441 295 531 300 C651 308 744 431 731 602 C719 763 584 833 458 792 C349 758 248 743 282 612 Z" fill="url(#scale)"/>
        <path d="M381 272 L331 151 L450 236 Z" fill="#d9b878"/>
        <path d="M630 279 L710 162 L683 307 Z" fill="#d9b878"/>
        <path d="M455 268 C482 170 540 157 566 269" fill="#c9a564"/>
        <path d="M354 475 C425 410 604 408 681 481 C732 531 707 646 620 700 C548 745 430 729 366 661 C318 609 312 522 354 475 Z" fill="#947f62" opacity="0.58"/>
        <path d="M414 500 C437 474 473 477 492 505" stroke="#f5c94e" stroke-width="13" stroke-linecap="round"/>
        <path d="M570 504 C596 476 633 480 651 510" stroke="#f5c94e" stroke-width="13" stroke-linecap="round"/>
        <path d="M526 548 C501 602 558 620 563 553" fill="#7f1d1d" opacity="0.9"/>
        ${scaleMarks}
        <path d="M510 695 C585 733 690 709 770 640" stroke="#d6b270" stroke-width="10" opacity="0.38" fill="none"/>
        <path d="M250 786 C317 706 434 698 525 730 C611 760 704 750 794 680" stroke="#8f754d" stroke-width="18" opacity="0.38" fill="none"/>
      </g>
      <title>${escapeXml(label)}</title>
      <rect width="1024" height="1024" filter="url(#grain)" opacity="0.32"/>
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
