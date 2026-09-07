"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GameGeneratedImage, GamePlayer } from "@/lib/types";

/**
 * Per-player generation state, as a list rather than a wall of thumbnails.
 *
 * During a batch the host's question is never "what do these look like" — it is "whose image
 * is stuck, and does it need a retry". This answers exactly that, and nothing else.
 */
export function GenerationLog({
  images,
  players,
  submittedPlayerIds,
  busy,
  onRetry,
  onSkip
}: {
  images: GameGeneratedImage[];
  players: GamePlayer[];
  submittedPlayerIds: string[];
  busy: boolean;
  onRetry: (imageId: string) => void;
  onSkip: (imageId: string) => void;
}) {
  // Hold the clock in state: reading Date.now() during render is impure, and the elapsed
  // column has to tick while an image is in flight.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const anyInFlight = images.some((image) => image.generation_status === "generating");
    if (!anyInFlight) {
      setNow(null);
      return;
    }
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [images]);

  const nameFor = (playerId: string) =>
    players.find((player) => player.id === playerId)?.name ?? "Trainer";

  if (!submittedPlayerIds.length) {
    return (
      <p className="border border-line bg-panel-2 p-4 text-[15px] text-muted">
        No prompts locked yet. This fills in as students submit.
      </p>
    );
  }

  const rows = submittedPlayerIds.map((playerId) => ({
    playerId,
    image: images.find((image) => image.player_id === playerId) ?? null
  }));

  return (
    <div className="flex flex-col">
      {rows.map(({ playerId, image }) => {
        const status = image?.generation_status ?? "pending";
        const attempts = image?.generation_attempts ?? 0;
        const needsAttention = status !== "complete" && status !== "skipped";
        const elapsed =
          status === "generating" && image?.generation_started_at && now !== null
            ? Math.max(
                0,
                Math.round((now - new Date(image.generation_started_at).getTime()) / 1000)
              )
            : null;

        return (
          <div
            key={playerId}
            className="flex items-center gap-3 border border-line border-t-0 bg-panel-2 px-3 py-2 first:border-t"
          >
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 shrink-0",
                status === "complete" && "bg-sea",
                status === "generating" && "ember-pulse bg-fire",
                status === "pending" && "bg-white/25",
                status === "failed" && "bg-danger",
                status === "skipped" && "bg-dim"
              )}
            />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
              {nameFor(playerId)}
            </span>

            <span
              className={cn(
                "numeric shrink-0 text-[12px] font-bold uppercase tracking-[0.1em]",
                status === "complete" && "text-sea",
                status === "generating" && "text-fire",
                status === "failed" && "text-danger",
                (status === "pending" || status === "skipped") && "text-muted-2"
              )}
            >
              {status === "generating" && elapsed !== null
                ? `drawing ${elapsed}s`
                : status === "complete"
                  ? "done"
                  : status}
            </span>

            {attempts > 1 ? (
              <span
                className="numeric shrink-0 text-[11px] text-muted-3"
                title={`${attempts} attempts used`}
              >
                ×{attempts}
              </span>
            ) : null}

            {needsAttention && image ? (
              <span className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRetry(image.id)}>
                  Retry
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => onSkip(image.id)}>
                  Skip
                </Button>
              </span>
            ) : null}

            {image?.generation_error && status === "failed" ? (
              <span className="w-full shrink-0 basis-full pt-1 text-[12px] leading-snug text-danger">
                {image.generation_error}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
