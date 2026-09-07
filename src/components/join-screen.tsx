"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client/api";
import { playerNameKey, playerTokenKey } from "@/lib/client/storage";
import { TOTAL_ROUNDS } from "@/lib/game/progression";
import type { GamePlayer } from "@/lib/types";

type JoinResponse = {
  player: GamePlayer;
  playerToken: string;
};

export function JoinScreen({ joinCode }: { joinCode: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyIn, setAlreadyIn] = useState<number | null>(null);

  useEffect(() => {
    const existingName = window.localStorage.getItem(playerNameKey(joinCode));
    if (existingName) setName(existingName);
  }, [joinCode]);

  // Showing the room filling up is the cheapest possible reassurance that the code worked.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/games/${joinCode}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && Array.isArray(data?.players)) {
          setAlreadyIn(data.players.length);
        }
      } catch {
        // A missing count is not worth surfacing — the form still works.
      }
    };
    void load();
    const interval = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [joinCode]);

  async function join(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await requestJson<JoinResponse>(`/api/games/${joinCode}/join`, {
        name,
        playerToken: window.localStorage.getItem(playerTokenKey(joinCode)) ?? undefined
      });
      window.localStorage.setItem(playerTokenKey(joinCode), data.playerToken);
      window.localStorage.setItem(playerNameKey(joinCode), data.player.name);
      router.push(`/play/${joinCode}`);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Could not join game");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-ground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 90% 50% at 50% 12%, rgba(255,106,43,0.22), transparent 70%)"
        }}
      />

      <div className="relative flex flex-1 flex-col justify-center gap-7 px-5 py-8">
        <div className="mx-auto w-full max-w-md">
          <p className="font-mono text-[13px] uppercase tracking-[0.24em] text-sea">
            Game {joinCode}
          </p>
          <h1 className="title mt-3 text-[clamp(44px,13vw,64px)] leading-[0.94]">
            Enter the arena
          </h1>
          <p className="mt-3.5 text-[18px] leading-relaxed text-ink-soft">
            {TOTAL_ROUNDS} rounds. Write a prompt, draw a dragon, survive the vote. Pick the
            name the whole room will see.
          </p>
        </div>

        <form onSubmit={join} className="mx-auto flex w-full max-w-md flex-col gap-3">
          <label
            htmlFor="studentName"
            className="font-mono text-[12px] uppercase tracking-[0.2em] text-muted-2"
          >
            Your name
          </label>
          <input
            id="studentName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Astrid, Hiccup, Toothless..."
            autoComplete="nickname"
            maxLength={80}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "join-error" : undefined}
            required
            className="min-h-16 w-full rounded-[3px] border border-white/20 bg-panel-2 px-4.5 text-[22px] font-semibold text-ink outline-none transition placeholder:text-muted-3 focus:border-fire"
          />
          {error ? (
            <p
              id="join-error"
              role="alert"
              className="rounded-[3px] border border-danger/50 bg-danger/10 px-4 py-3 text-[15px] font-semibold text-danger"
            >
              {error}
            </p>
          ) : null}
          <Button
            size="lg"
            className="min-h-17 w-full"
            loading={busy}
            icon={<LogIn className="h-6 w-6" aria-hidden />}
            type="submit"
          >
            Join the game
          </Button>
        </form>
      </div>

      <div className="relative border-t border-line px-5 py-4.5">
        <p className="font-mono text-[13px] uppercase tracking-[0.1em] text-muted-2">
          {alreadyIn === null
            ? "Checking the room…"
            : alreadyIn === 1
              ? "1 trainer already in"
              : `${alreadyIn} trainers already in`}
        </p>
      </div>
    </main>
  );
}
