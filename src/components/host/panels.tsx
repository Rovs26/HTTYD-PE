"use client";

import { AlertTriangle, Crown, Download, ImageIcon, PlusCircle } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatScore } from "@/lib/utils";

/** Presentational pieces of the host dashboard. No data fetching, no game logic. */

/** The ambient forge glow every projector screen sits on. */
function Glow({ variant = "fire" }: { variant?: "fire" | "gold" }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          variant === "gold"
            ? "radial-gradient(ellipse 60% 70% at 30% 40%, rgba(255,197,61,0.14), transparent 68%), radial-gradient(ellipse 60% 50% at 85% 80%, rgba(255,106,43,0.10), transparent 70%)"
            : "radial-gradient(ellipse 70% 55% at 50% 44%, rgba(255,106,43,0.16), transparent 70%), radial-gradient(ellipse 90% 40% at 50% 100%, rgba(53,223,203,0.07), transparent 70%)"
      }}
    />
  );
}

/** Diagonal hatch used wherever an image has not arrived yet. */
function hatch(tone: "white" | "gold") {
  return tone === "gold"
    ? "repeating-linear-gradient(135deg, rgba(255,197,61,0.07) 0 14px, transparent 14px 28px)"
    : "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 14px, transparent 14px 28px)";
}

/* ------------------------------------------------------------------ lobby */

/**
 * The pre-game projector screen. The join code is the largest thing in the room by a wide
 * margin — it is the one piece of information thirty people need to read at once, from the
 * back, on a washed-out projector.
 */
export function LobbyStage({
  joinCode,
  joinUrl,
  qrCode,
  players,
  onStart,
  starting,
  canStart
}: {
  joinCode: string;
  joinUrl: string;
  qrCode: string | null;
  players: { id: string; name: string }[];
  onStart: () => void;
  starting: boolean;
  canStart: boolean;
}) {
  return (
    <section className="relative flex min-h-[70vh] flex-col overflow-hidden border border-line bg-ground">
      <Glow />

      <div className="relative grid flex-1 lg:grid-cols-[900px_1fr]">
        <div className="flex flex-col justify-center gap-7 p-8 lg:py-14 lg:pr-12 lg:pl-14">
          <div>
            <p className="font-mono text-[15px] uppercase tracking-[0.28em] text-sea lg:text-[17px]">
              Join the arena at
            </p>
            <p className="numeric mt-2 break-all text-[22px] text-ink-2 lg:text-[30px]">
              {joinUrl || "…"}
            </p>
          </div>

          <div>
            <p className="font-mono text-[15px] uppercase tracking-[0.28em] text-muted-2 lg:text-[17px]">
              Game code
            </p>
            <p className="numeric mt-1.5 text-[clamp(72px,13vw,172px)] font-extrabold leading-[0.92] tracking-[0.06em] text-fire">
              {joinCode}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-8">
            <div className="h-[280px] w-[280px] shrink-0 bg-white p-4">
              {qrCode ? (
                <img src={qrCode} alt={`QR code for ${joinUrl}`} className="h-full w-full" />
              ) : (
                <div className="h-full w-full animate-pulse bg-slate-200" />
              )}
            </div>
            <p className="max-w-xs text-[18px] leading-relaxed text-ink-soft">
              Scan it, or type the code. Anyone can join until the game starts.
            </p>
          </div>
        </div>

        <div className="flex min-h-0 flex-col border-line bg-ground-2/60 p-8 lg:border-l lg:py-14 lg:pr-14 lg:pl-14">
          <div className="flex items-baseline gap-5">
            <p className="numeric text-[64px] font-extrabold leading-none text-ink">
              {players.length}
            </p>
            <p className="font-mono text-[15px] uppercase tracking-[0.2em] text-muted-2">
              {players.length === 1 ? "trainer in" : "trainers in"}
            </p>
          </div>

          <div
            className="mt-9 flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-hidden"
            aria-live="polite"
          >
            {players.map((player) => (
              <span
                key={player.id}
                className="border border-fire/40 bg-fire/10 px-4 py-2.5 text-[20px] font-bold text-ink"
              >
                {player.name}
              </span>
            ))}
            {players.length === 0 ? (
              <p className="text-[18px] text-ink-soft">
                Waiting for the first phone to scan the code.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative flex shrink-0 flex-wrap items-center justify-between gap-8 border-t border-line bg-ground-2 px-8 py-6 lg:px-14">
        <p className="text-[18px] text-ink-soft">
          Three rounds. Everyone writes a prompt, the class votes, the room reads every prompt.
        </p>
        <Button size="lg" onClick={onStart} loading={starting} disabled={!canStart}>
          Start game
        </Button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- reveal */

/**
 * Projector view: one dragon at a time, large, in a letterbox. A four-column thumbnail grid
 * is unreadable from the back of a classroom; this is not.
 */
export function RevealStage({
  images,
  index,
  onIndexChange,
  resetKey,
  roundTitle,
  nameFor,
  rankFor,
  votesFor,
  promptFor
}: {
  images: {
    id: string;
    player_id: string;
    image_url: string | null;
    ai_similarity_score: number | null;
  }[];
  index: number;
  onIndexChange: (next: number) => void;
  resetKey: string;
  roundTitle: string;
  nameFor: (playerId: string) => string;
  rankFor: (playerId: string) => number | null;
  votesFor: (playerId: string) => number;
  promptFor: (playerId: string) => string | null;
}) {
  // A new round means a new set of dragons; start at the first one.
  useEffect(() => {
    onIndexChange(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  if (!images.length) {
    return (
      <section className="relative flex min-h-[60vh] flex-col items-center justify-center overflow-hidden border border-line bg-ground p-10 text-center">
        <Glow />
        <div className="relative">
          <ImageIcon className="mx-auto mb-4 h-14 w-14 text-fire" aria-hidden />
          <h2 className="title text-[36px]">No dragons to reveal yet</h2>
          <p className="mt-2 text-[18px] text-ink-soft">
            Generate this round&apos;s images, then come back to this view.
          </p>
        </div>
      </section>
    );
  }

  const safeIndex = Math.min(Math.max(index, 0), images.length - 1);
  const image = images[safeIndex];
  const rank = rankFor(image.player_id);
  const prompt = promptFor(image.player_id);

  return (
    <section className="relative flex min-h-[80vh] flex-col overflow-hidden border border-line bg-ground">
      <Glow />

      <div className="relative flex items-start justify-between gap-6 px-8 pt-8 lg:px-14 lg:pt-11">
        <div className="flex items-center gap-4.5">
          <span aria-hidden className="block h-11 w-1.5 bg-fire" />
          <div>
            <p className="font-mono text-[15px] uppercase tracking-[0.22em] text-sea">
              {roundTitle} · the reveal
            </p>
          </div>
        </div>
        <div className="flex items-center gap-7">
          <span className="font-mono text-[15px] uppercase tracking-[0.2em] text-muted-2">
            Dragon
          </span>
          <span className="numeric text-[44px] font-extrabold leading-none text-ink">
            {String(safeIndex + 1).padStart(2, "0")}
            <span className="text-dim"> / {images.length}</span>
          </span>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="relative aspect-square w-full max-w-[600px]">
          <div
            aria-hidden
            className="absolute -inset-12 blur-lg"
            style={{
              backgroundImage:
                "radial-gradient(circle, rgba(255,106,43,0.28), transparent 68%)"
            }}
          />
          {image.image_url ? (
            <img
              src={image.image_url}
              alt={`Dragon by ${nameFor(image.player_id)}`}
              className="relative h-full w-full border border-line object-cover"
            />
          ) : (
            <div
              className="relative flex h-full w-full items-center justify-center border border-line bg-panel"
              style={{ backgroundImage: hatch("white") }}
            />
          )}
        </div>
      </div>

      {prompt ? (
        <div className="relative flex justify-center px-8 pb-4.5 lg:px-14">
          <p className="numeric max-w-[1180px] text-center text-[19px] leading-relaxed text-ink-soft">
            &ldquo;{prompt}&rdquo;
          </p>
        </div>
      ) : null}

      <div className="relative flex flex-wrap items-end justify-between gap-8 border-t border-white/[0.12] bg-ground-2 px-8 pt-7 pb-6 lg:px-14">
        <div className="min-w-0">
          <p className="font-mono text-[14px] uppercase tracking-[0.22em] text-sea">Trainer</p>
          <p className="title mt-1.5 truncate text-[clamp(48px,8vw,104px)] leading-[0.9]">
            {nameFor(image.player_id)}
          </p>
        </div>
        <div className="flex shrink-0 items-stretch">
          <RevealStat value={String(votesFor(image.player_id))} label="Votes" tone="fire" />
          <span aria-hidden className="w-px bg-white/[0.14]" />
          <RevealStat
            value={formatScore(image.ai_similarity_score)}
            label="AI score"
            tone="sea"
          />
          {rank ? (
            <>
              <span aria-hidden className="w-px bg-white/[0.14]" />
              <RevealStat value={`#${rank}`} label="Rank" tone="gold" last />
            </>
          ) : null}
        </div>
      </div>

      <div className="relative flex items-center justify-between gap-8 bg-ground-2 px-8 pb-6 lg:px-14">
        <div className="flex flex-1 items-center gap-1.5">
          {images.map((item, tickIndex) => (
            <span
              key={item.id}
              aria-hidden
              className={cn(
                "h-1 flex-1",
                tickIndex === safeIndex
                  ? "bg-fire"
                  : tickIndex < safeIndex
                    ? "bg-white/30"
                    : "bg-white/10"
              )}
            />
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={safeIndex === 0}
            onClick={() => onIndexChange(safeIndex - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            disabled={safeIndex >= images.length - 1}
            onClick={() => onIndexChange(safeIndex + 1)}
          >
            Next dragon
          </Button>
        </div>
      </div>
    </section>
  );
}

function RevealStat({
  value,
  label,
  tone,
  last
}: {
  value: string;
  label: string;
  tone: "fire" | "sea" | "gold";
  last?: boolean;
}) {
  return (
    <div className={cn("px-10 text-right", last && "pr-0")}>
      <p
        className={cn(
          "numeric text-[clamp(40px,6vw,76px)] font-extrabold leading-none",
          tone === "fire" && "text-fire",
          tone === "sea" && "text-sea",
          tone === "gold" && "text-gold"
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 font-mono text-[14px] uppercase tracking-[0.2em] text-muted">
        {label}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- winners */

export function WinnersStage({
  rankings,
  nameFor,
  imageFor,
  votesFor,
  promptFor,
  onExport,
  onNewGame,
  newGameLoading
}: {
  rankings: { player_id: string; rank: number; ai_similarity_score: number }[];
  nameFor: (playerId: string) => string;
  imageFor: (playerId: string) => string | null;
  votesFor: (playerId: string) => number;
  promptFor: (playerId: string) => string | null;
  onExport: () => void;
  onNewGame: () => void;
  newGameLoading: boolean;
}) {
  const champion = rankings[0];
  const runnersUp = rankings.slice(1, 4);

  return (
    <section className="relative flex min-h-[80vh] flex-col overflow-hidden border border-line bg-ground">
      <Glow variant="gold" />

      <div className="relative flex items-center justify-between gap-6 px-8 pt-10 lg:px-14">
        <div className="flex items-center gap-4.5">
          <span aria-hidden className="block h-10 w-1.5 bg-gold" />
          <p className="font-mono text-[15px] uppercase tracking-[0.22em] text-gold">
            Final standing
          </p>
        </div>
        <p className="font-mono text-[15px] uppercase tracking-[0.2em] text-muted-2">
          {rankings.length} trainers competed
        </p>
      </div>

      <div className="relative grid min-h-0 flex-1 gap-12 px-8 pt-7 lg:grid-cols-[1fr_620px] lg:px-14">
        <div className="flex min-h-0 flex-col">
          <p className="title text-[36px] text-gold">Champion</p>
          <p className="title mt-2 text-[clamp(48px,7vw,88px)] leading-[0.92]">
            {champion ? nameFor(champion.player_id) : "TBD"}
          </p>

          <div className="mt-6 flex min-h-0 flex-1 flex-wrap gap-7">
            <div
              className="flex aspect-square w-full max-w-[460px] shrink-0 items-center justify-center border border-gold/35 bg-panel"
              style={{ backgroundImage: hatch("gold") }}
            >
              {champion && imageFor(champion.player_id) ? (
                <img
                  src={imageFor(champion.player_id) ?? ""}
                  alt={`Champion dragon by ${nameFor(champion.player_id)}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Crown className="h-16 w-16 text-gold/50" aria-hidden />
              )}
            </div>

            <div className="flex min-w-[240px] flex-1 flex-col justify-end gap-6">
              <div className="flex gap-8">
                <div>
                  <p className="numeric text-[56px] font-extrabold leading-none text-fire">
                    {champion ? votesFor(champion.player_id) : 0}
                  </p>
                  <p className="mt-1.5 font-mono text-[14px] uppercase tracking-[0.2em] text-muted">
                    Votes
                  </p>
                </div>
                <div>
                  <p className="numeric text-[56px] font-extrabold leading-none text-sea">
                    {champion ? formatScore(champion.ai_similarity_score) : "—"}
                  </p>
                  <p className="mt-1.5 font-mono text-[14px] uppercase tracking-[0.2em] text-muted">
                    AI score
                  </p>
                </div>
              </div>

              {champion && promptFor(champion.player_id) ? (
                <div>
                  <p className="font-mono text-[13px] uppercase tracking-[0.2em] text-sea">
                    The winning prompt
                  </p>
                  <p className="numeric mt-2 border-l-[3px] border-l-gold pl-4 text-[17px] leading-relaxed text-ink-2">
                    {promptFor(champion.player_id)}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-4">
          <p className="font-mono text-[14px] uppercase tracking-[0.2em] text-muted-2">
            Runners up
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {runnersUp.map((ranking) => (
              <article
                key={ranking.player_id}
                className="flex flex-1 items-center gap-5 border border-line bg-panel-2 p-4"
              >
                <div
                  className="h-[132px] w-[132px] shrink-0 border border-white/10 bg-panel"
                  style={{ backgroundImage: hatch("white") }}
                >
                  {imageFor(ranking.player_id) ? (
                    <img
                      src={imageFor(ranking.player_id) ?? ""}
                      alt={`Dragon by ${nameFor(ranking.player_id)}`}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="numeric text-[15px] font-extrabold text-gold">
                    #{ranking.rank}
                  </p>
                  <p className="title mt-1 truncate text-[30px]">
                    {nameFor(ranking.player_id)}
                  </p>
                  <p className="numeric mt-1.5 text-[14px] text-muted">
                    {votesFor(ranking.player_id)} votes ·{" "}
                    {formatScore(ranking.ai_similarity_score)} AI
                  </p>
                </div>
              </article>
            ))}
            {runnersUp.length === 0 ? (
              <p className="text-[16px] text-ink-soft">No runners up to show.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="relative mt-7 flex flex-wrap items-center justify-between gap-6 border-t border-white/[0.12] bg-ground-2 px-8 py-5 lg:px-14">
        <p className="text-[16px] text-ink-soft">
          Export the prompts before you start a new game — everything else is deleted.
        </p>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            icon={<Download className="h-4.5 w-4.5" aria-hidden />}
            onClick={onExport}
          >
            Export results
          </Button>
          <Button
            variant="secondary"
            icon={<PlusCircle className="h-4.5 w-4.5" aria-hidden />}
            loading={newGameLoading}
            onClick={onNewGame}
          >
            New game
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ bits */

export function ConfirmDialog({
  title,
  body,
  detail,
  confirmLabel,
  loading,
  onCancel,
  onConfirm,
  onExport
}: {
  title: string;
  body: string;
  detail?: string | null;
  confirmLabel: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onExport?: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--scrim)] px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="w-full max-w-md border-t-[3px] border-t-danger bg-panel-2 p-6">
        <div className="mb-4 flex items-center gap-3">
          <AlertTriangle className="h-6 w-6 shrink-0 text-danger" aria-hidden />
          <h2 id="confirm-title" className="title text-[28px]">
            {title}
          </h2>
        </div>
        <p className="text-[15px] leading-relaxed text-ink-soft">{body}</p>
        {onExport ? (
          <div className="mt-4 border border-gold/35 bg-gold/[0.06] p-3">
            <p className="text-[14px] font-semibold text-gold">
              This deletes every prompt the class wrote. Download them first?
            </p>
            <Button variant="ghost" className="mt-2 w-full" disabled={loading} onClick={onExport}>
              Export results first
            </Button>
          </div>
        ) : null}
        {detail ? (
          <p className="mt-3 border border-line bg-white/5 p-3 text-[14px] leading-relaxed text-ink-soft">
            {detail}
          </p>
        ) : null}
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <Button variant="ghost" disabled={loading} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3.5 border p-3.5 transition",
        checked ? "border-sea/40 bg-sea/[0.07]" : "border-line bg-white/[0.03]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "relative mt-0.5 h-[26px] w-[46px] shrink-0 rounded-full transition",
          checked ? "bg-sea" : "bg-dim"
        )}
      >
        <span
          className={cn(
            "absolute top-1 h-[18px] w-[18px] rounded-full bg-ground transition-all",
            checked ? "left-[24px]" : "left-1"
          )}
        />
      </span>
      <span>
        <span className="block text-[15px] font-bold text-ink">{label}</span>
        <span className="block text-[13px] leading-snug text-muted">{hint}</span>
      </span>
    </label>
  );
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-line bg-panel-2 px-2 py-3 text-center">
      <p className="numeric text-[24px] font-extrabold leading-none text-ink">{value}</p>
      <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {label}
      </p>
    </div>
  );
}

export function MetricPanel({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="border border-line bg-panel p-5">
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-sea">{title}</p>
      <p className="numeric mt-1.5 text-[36px] font-extrabold leading-none text-ink">{value}</p>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white/5 px-2 py-2">
      <p className="numeric text-[15px] font-bold text-ink">{value}</p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-2">
        {label}
      </p>
    </div>
  );
}
