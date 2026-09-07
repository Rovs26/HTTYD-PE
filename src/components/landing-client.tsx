"use client";

import { PlusCircle, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { CodeField, TextField } from "@/components/ui/field";
import { requestJson } from "@/lib/client/api";
import { hostTokenKey } from "@/lib/client/storage";
import { ROUNDS, TOTAL_ROUNDS, nextRoundCutLine } from "@/lib/game/progression";
import { PROMPT_DIMENSIONS } from "@/components/prompt-guide";
import type { GameSession } from "@/lib/types";

type CreateGameResponse = {
  session: GameSession;
  hostToken: string;
};

const STEPS = [
  "01 Write a prompt",
  "02 Draw the dragon",
  "03 Vote",
  "04 Read every prompt"
];

export function LandingClient() {
  const router = useRouter();
  const [accessCode, setAccessCode] = useState("");
  const [pin, setPin] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [practiceMode, setPracticeMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "30→10→4" for the real progression, whatever it is configured to be.
  const cutLine = [30, ...ROUNDS.map((r) => nextRoundCutLine(r.number)).filter(Boolean)].join(
    "→"
  );

  async function createGame(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await requestJson<CreateGameResponse>("/api/games", {
        accessCode,
        pin,
        practiceMode
      });
      window.localStorage.setItem(hostTokenKey(data.session.join_code), data.hostToken);
      router.push(`/host/${data.session.join_code}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create game");
    } finally {
      setBusy(false);
    }
  }

  function joinGame(event: FormEvent) {
    event.preventDefault();
    const normalizedJoinCode = joinCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(normalizedJoinCode)) {
      setError("Enter the six-character join code shown by your host.");
      return;
    }
    setError(null);
    router.push(`/join/${encodeURIComponent(normalizedJoinCode)}`);
  }

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-ground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 55% 55% at 18% 20%, rgba(255,106,43,0.18), transparent 68%), radial-gradient(ellipse 50% 55% at 92% 85%, rgba(53,223,203,0.10), transparent 70%)"
        }}
      />

      <div className="relative grid flex-1 gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[1fr_520px] lg:gap-16 lg:px-14 lg:py-16">
        <div className="flex min-w-0 flex-col justify-center gap-8">
          <div>
            <p className="font-mono text-[13px] uppercase tracking-[0.26em] text-sea sm:text-[14px]">
              A live classroom prompt-writing arena
            </p>
            <h1 className="title mt-3.5 text-[clamp(52px,11vw,104px)] leading-[0.9] text-ink">
              How to train
              <br />
              your dragon
            </h1>
            <p className="title mt-4 text-[clamp(24px,5vw,44px)] text-fire">
              Prompt engineering
            </p>
          </div>

          <p className="max-w-[640px] text-[17px] leading-relaxed text-ink-soft sm:text-[22px]">
            Thirty students. {TOTAL_ROUNDS} rounds. Everyone writes a prompt against the same
            dragon, the class votes, the AI scores, and the room reads every prompt afterwards
            &mdash; which is the actual lesson.
          </p>

          <div className="flex flex-wrap gap-10">
            <Stat value={String(TOTAL_ROUNDS)} label="Rounds" />
            <Stat value={cutLine} label="Cut lines" />
            <Stat value={String(PROMPT_DIMENSIONS.length)} label="Things a prompt needs" />
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-5">
          {error ? (
            <div
              id="landing-error"
              role="alert"
              className="rounded-[3px] border border-danger/50 bg-danger/10 px-4 py-3 text-[15px] font-semibold text-danger"
            >
              {error}
            </div>
          ) : null}

          {/* Students are the many. Their door is the loud one. */}
          <form
            onSubmit={joinGame}
            className="rounded-[3px] border border-fire/50 bg-fire/[0.08] p-7"
          >
            <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-fire">
              Students
            </p>
            <h2 className="title mt-2 text-[40px] text-ink">Join a game</h2>

            <label htmlFor="joinCode" className="sr-only">
              Six-character join code
            </label>
            <CodeField
              id="joinCode"
              className="mt-[18px]"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              pattern="[A-HJ-NP-Z2-9]{6}"
              maxLength={6}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "landing-error" : undefined}
            />
            <Button
              type="submit"
              size="lg"
              className="mt-3 w-full"
              icon={<Swords className="h-[22px] w-[22px]" aria-hidden />}
            >
              Enter code
            </Button>
            <p className="mt-3 text-[15px] text-ink-soft">
              Six characters, shown on the projector.
            </p>
          </form>

          {/* Teachers are the few, and they already know they are here. */}
          <form
            onSubmit={createGame}
            className="rounded-[3px] border border-white/[0.12] bg-ground-2 p-7"
          >
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-sea">
                  Teachers
                </p>
                <h2 className="title mt-2 text-[32px] text-ink">Host a game</h2>
              </div>
              <PlusCircle className="h-[26px] w-[26px] shrink-0 text-sea" aria-hidden />
            </div>

            <div className="mt-[18px] flex flex-col gap-2.5">
              <label htmlFor="accessCode" className="sr-only">
                Organizer access code
              </label>
              <TextField
                id="accessCode"
                type="password"
                autoComplete="off"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                placeholder="Organizer access code"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "landing-error" : undefined}
                required
              />
              <label htmlFor="pin" className="sr-only">
                Host PIN
              </label>
              <TextField
                id="pin"
                type="password"
                autoComplete="new-password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="Choose a host PIN"
                minLength={4}
                maxLength={32}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "landing-error" : undefined}
                required
              />

              {/* The only gold on this screen. */}
              <label className="flex cursor-pointer items-center gap-3.5 rounded-[3px] border border-gold/35 bg-gold/[0.06] px-4 py-3.5">
                <input
                  type="checkbox"
                  checked={practiceMode}
                  onChange={(event) => setPracticeMode(event.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className="relative h-[30px] w-[52px] shrink-0 rounded-full bg-dim transition peer-checked:bg-gold"
                >
                  <span className="absolute top-1 left-1 h-[22px] w-[22px] rounded-full bg-ground transition-all peer-checked:left-[26px]" />
                </span>
                <span className="flex-1">
                  <span className="block text-[16px] font-bold text-ink">Practice game</span>
                  <span className="block text-[14px] leading-snug text-ink-soft">
                    Placeholder dragons, no AI spend. Rehearse the lesson.
                  </span>
                </span>
              </label>

              <Button variant="secondary" className="w-full" loading={busy} type="submit">
                {practiceMode ? "Create practice game" : "Create game"}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-x-12 gap-y-2 border-t border-line bg-ground-2 px-6 py-5 sm:px-14">
        {STEPS.map((step) => (
          <p
            key={step}
            className="font-mono text-[13px] uppercase tracking-[0.16em] text-muted-2"
          >
            {step}
          </p>
        ))}
        <p className="font-mono text-[13px] uppercase tracking-[0.16em] text-fire sm:ml-auto">
          Repeat until four remain
        </p>
      </div>
    </main>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="numeric text-[44px] font-extrabold leading-none text-ink">{value}</p>
      <p className="mt-1 font-mono text-[13px] uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
    </div>
  );
}
