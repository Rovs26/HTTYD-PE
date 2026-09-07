"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The phone chrome: a status bar that never changes position, and a full-bleed banner that
 * states the one thing happening right now.
 *
 * The banner is the whole idea. A student glancing at their phone mid-lesson should learn
 * what to do from a single edge-to-edge colour bar, without reading anything else.
 */
export function PhoneStatusBar({
  joinCode,
  roundLabel,
  timer
}: {
  joinCode: string;
  roundLabel: string;
  timer?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-ground-2 px-4 py-3.5">
      <span className="numeric text-[13px] font-bold tracking-[0.1em] text-muted-2">
        {joinCode}
      </span>
      <span className="numeric text-[13px] font-bold uppercase tracking-[0.12em] text-sea">
        {roundLabel}
      </span>
      <span className="min-w-[52px] text-right">{timer}</span>
    </div>
  );
}

export type BannerTone = "fire" | "gold" | "sea" | "quiet";

export function PhaseBanner({
  tone,
  icon,
  children
}: {
  tone: BannerTone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2.5 px-4 py-3",
        tone === "fire" && "bg-fire text-ground",
        tone === "gold" && "bg-gold text-ground",
        tone === "sea" && "bg-sea text-ground",
        tone === "quiet" && "border-b border-line bg-panel text-ink-soft"
      )}
    >
      {icon}
      <span
        className={cn(
          "title text-[21px]",
          tone === "quiet" ? "text-ink" : "text-ground"
        )}
      >
        {children}
      </span>
    </div>
  );
}
