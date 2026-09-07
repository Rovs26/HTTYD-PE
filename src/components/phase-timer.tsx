"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Advisory countdown for the current phase. The host still drives every transition, so this
 * never blocks anything — it just stops the room being paced by eye.
 *
 * Colour is the only urgency signal: ink while there is time, gold under a minute, danger
 * when spent. Tabular figures stop the digits jittering as they count down.
 */
export function PhaseTimer({
  endsAt,
  size = "md"
}: {
  endsAt: string | null;
  size?: "md" | "lg";
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return;
    }

    const target = new Date(endsAt).getTime();
    if (!Number.isFinite(target)) {
      // A malformed timestamp must not render "NaN:NaN" on a projector.
      setRemaining(null);
      return;
    }

    const tick = () => {
      setRemaining(Math.max(0, Math.round((target - Date.now()) / 1000)));
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  if (remaining === null) {
    return null;
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const expired = remaining === 0;

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={expired ? "Time is up" : `${remaining} seconds remaining`}
      className={cn(
        "numeric font-extrabold leading-none",
        size === "lg" ? "text-[44px]" : "text-[22px]",
        expired ? "text-danger" : remaining <= 60 ? "text-gold" : "text-ink"
      )}
    >
      {expired ? "0:00" : `${minutes}:${String(seconds).padStart(2, "0")}`}
    </span>
  );
}
