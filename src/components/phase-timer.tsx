"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Seconds left in the current phase, or null when no timer is running.
 *
 * Exported because the countdown and the phase banner have to agree on what "expired" means:
 * the banner is what actually tells a student their time is up, and it cannot do that from a
 * number rendered in the corner of a different component.
 */
export function usePhaseCountdown(endsAt: string | null) {
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

    const secondsLeft = () => Math.max(0, Math.round((target - Date.now()) / 1000));

    setRemaining(secondsLeft());
    if (secondsLeft() === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      const next = secondsLeft();
      setRemaining(next);
      // Nothing changes after zero, so stop rather than ticking for the rest of the lesson.
      if (next === 0) {
        window.clearInterval(interval);
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [endsAt]);

  return remaining;
}

/**
 * Advisory countdown for the current phase. The host still drives every transition, so this
 * never blocks anything — it just stops the room being paced by eye.
 *
 * Urgency is carried by colour *and* a second channel: the digits pulse under a minute, and
 * expiry is announced rather than left as a colour change a student has to be looking at.
 * Tabular figures stop the digits jittering as they count down.
 */
export function PhaseTimer({
  endsAt,
  size = "md"
}: {
  endsAt: string | null;
  size?: "md" | "lg";
}) {
  const remaining = usePhaseCountdown(endsAt);

  if (remaining === null) {
    return null;
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  const expired = remaining === 0;
  const urgent = !expired && remaining <= 60;

  return (
    <span
      role="timer"
      // Expiry and the one-minute warning both matter enough to reach a student who is not
      // watching the corner of the screen. Polite, so it never cuts across their typing.
      aria-live="polite"
      aria-label={
        expired
          ? "Time is up"
          : urgent
            ? `${remaining} seconds remaining`
            : `${minutes} minutes remaining`
      }
      className={cn(
        "numeric font-extrabold leading-none",
        size === "lg" ? "text-[44px]" : "text-[22px]",
        expired ? "text-danger" : urgent ? "ember-pulse text-gold" : "text-ink"
      )}
    >
      {expired ? "0:00" : `${minutes}:${String(seconds).padStart(2, "0")}`}
    </span>
  );
}
