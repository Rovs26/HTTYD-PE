"use client";

import {
  CheckCircle2,
  Crown,
  Lock,
  Send,
  Sparkles,
  Swords,
  Trophy,
  Unlock,
  Vote
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DragonMark } from "@/components/dragon-mark";
import { PhaseBanner, PhoneStatusBar, type BannerTone } from "@/components/phone-shell";
import { PhaseTimer } from "@/components/phase-timer";
import { CoverageTags, PromptGuide, coveredDimensions } from "@/components/prompt-guide";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { useGameState } from "@/hooks/use-game-state";
import { requestJson } from "@/lib/client/api";
import { playerTokenKey } from "@/lib/client/storage";
import { TOTAL_ROUNDS, roundConfig } from "@/lib/game/progression";
import { formatScore } from "@/lib/utils";

const BANNER_ICON = "h-[18px] w-[18px] shrink-0";

export function StudentGame({ joinCode }: { joinCode: string }) {
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPlayerToken(window.localStorage.getItem(playerTokenKey(joinCode)));
    setAuthReady(true);
  }, [joinCode]);

  const {
    state,
    error: stateError,
    loading,
    reload
  } = useGameState(joinCode, { playerToken }, authReady && Boolean(playerToken));

  const currentRound = state?.currentRound ?? null;
  const currentPlayer = state?.currentPlayer ?? null;
  const gameEnded = state?.session.status === "ended";
  const currentSubmission = state?.submissions.find(
    (submission) =>
      submission.round_id === currentRound?.id && submission.player_id === currentPlayer?.id
  );
  const roundImages = useMemo(
    () => state?.generatedImages.filter((image) => image.round_id === currentRound?.id) ?? [],
    [currentRound?.id, state?.generatedImages]
  );
  const completedImages = useMemo(
    () => roundImages.filter((image) => image.generation_status === "complete"),
    [roundImages]
  );
  const currentVote = state?.votes.find(
    (voteItem) =>
      voteItem.round_id === currentRound?.id && voteItem.voter_player_id === currentPlayer?.id
  );
  const myImage = roundImages.find((image) => image.player_id === currentPlayer?.id);
  const rankings = useMemo(
    () =>
      [...(state?.rankings ?? [])]
        .filter((ranking) => ranking.round_id === currentRound?.id)
        .sort((left, right) => left.rank - right.rank),
    [currentRound?.id, state?.rankings]
  );
  const myRanking = rankings.find((ranking) => ranking.player_id === currentPlayer?.id);
  const isEliminated = Boolean(currentPlayer?.is_eliminated);
  const isActive = Boolean(currentPlayer && !isEliminated);
  const audienceVoting = Boolean(state?.session.audience_voting);
  const canVote = Boolean(currentRound?.voting_open) && (isActive || audienceVoting);
  const resultsVisible = rankings.length > 0;
  const hasCompeted = Boolean(
    state?.submissions.some((submission) => submission.player_id === currentPlayer?.id)
  );
  const nameFor = (playerId: string) =>
    state?.players.find((item) => item.id === playerId)?.name ?? "Trainer";

  const roundLabel = currentRound
    ? `Round ${currentRound.round_number} of ${TOTAL_ROUNDS}`
    : "Lobby";

  // One banner states the single thing happening right now.
  const banner: { tone: BannerTone; icon: React.ReactNode; text: string } = gameEnded
    ? { tone: "gold", icon: <Trophy className={BANNER_ICON} aria-hidden />, text: "Game over" }
    : resultsVisible
      ? {
          tone: "gold",
          icon: <Trophy className={BANNER_ICON} aria-hidden />,
          text: myRanking
            ? `You placed ${ordinal(myRanking.rank)}${isEliminated ? "" : " — you advance"}`
            : "Round results are in"
        }
      : currentRound?.voting_open
        ? {
            tone: "fire",
            icon: <Vote className={BANNER_ICON} aria-hidden />,
            text: canVote ? "Voting is open — pick one" : "Voting is open"
          }
        : currentRound?.submission_open && !currentSubmission && isActive
          ? {
              tone: "fire",
              icon: <Unlock className={BANNER_ICON} aria-hidden />,
              text: "Write your prompt now"
            }
          : currentSubmission && !resultsVisible
            ? {
                tone: "quiet",
                icon: <Lock className={`${BANNER_ICON} text-sea`} aria-hidden />,
                text: "Prompt locked — drawing your dragon"
              }
            : {
                tone: "quiet",
                icon: <Sparkles className={`${BANNER_ICON} text-sea`} aria-hidden />,
                text: currentRound ? "Waiting for the host" : "Waiting to start"
              };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!playerToken) return;
    setBusy("submit");
    setError(null);
    setMessage(null);
    try {
      const result = await requestJson<{ alreadyLocked?: boolean }>(
        `/api/games/${joinCode}/submit`,
        { playerToken, prompt }
      );
      setPrompt("");
      setReviewing(false);
      setMessage(
        result.alreadyLocked
          ? "That prompt was already locked — nothing was lost."
          : "Prompt locked. Watch the host screen for the reveal."
      );
      await reload();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not submit prompt");
    } finally {
      setBusy(null);
    }
  }

  async function voteFor(playerId: string) {
    if (!playerToken) return;
    setBusy(playerId);
    setError(null);
    setMessage(null);
    try {
      await requestJson(`/api/games/${joinCode}/vote`, {
        playerToken,
        votedForPlayerId: playerId
      });
      setMessage("Vote locked. You can change it while voting is open.");
      await reload();
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Could not vote");
    } finally {
      setBusy(null);
    }
  }

  if (!authReady) {
    return <Splash title="Loading arena" body="Checking this phone's game pass." />;
  }

  if (!playerToken) {
    return (
      <Splash title="Join first" body={`This phone is not registered for ${joinCode} yet.`}>
        <Link
          href={`/join/${joinCode}`}
          className="mt-6 inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-[3px] bg-fire px-6 font-display text-[26px] uppercase leading-none text-ground"
        >
          <Swords className="h-[22px] w-[22px]" aria-hidden />
          Join game
        </Link>
      </Splash>
    );
  }

  if (loading && !state) {
    return <Splash title="Loading arena" body="Syncing the latest game state." />;
  }

  if (stateError && !state) {
    return (
      <Splash title="Could not load the arena" body={stateError}>
        <Button className="mt-6 w-full" onClick={() => void reload()}>
          Try again
        </Button>
      </Splash>
    );
  }

  return (
    <main className="min-h-screen bg-ground">
      <PhoneStatusBar
        joinCode={joinCode}
        roundLabel={roundLabel}
        timer={<PhaseTimer endsAt={currentRound?.phase_ends_at ?? null} />}
      />

      {currentPlayer ? (
        <PhaseBanner tone={banner.tone} icon={banner.icon}>
          {banner.text}
        </PhaseBanner>
      ) : null}

      <div className="mx-auto max-w-2xl">
        {(error || stateError || message) && (
          <div
            role={error || stateError ? "alert" : "status"}
            aria-live={error || stateError ? "assertive" : "polite"}
            className={`mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[3px] border px-4 py-3 text-[15px] font-semibold ${
              error || stateError
                ? "border-danger/50 bg-danger/10 text-danger"
                : "border-sea/40 bg-sea/10 text-sea"
            }`}
          >
            <span>{error ?? stateError ?? message}</span>
            <span className="flex gap-2">
              {stateError ? (
                <Button size="sm" variant="ghost" onClick={() => void reload()}>
                  Retry
                </Button>
              ) : null}
              {error || message ? (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Dismiss message"
                  onClick={() => {
                    setError(null);
                    setMessage(null);
                  }}
                >
                  Dismiss
                </Button>
              ) : null}
            </span>
          </div>
        )}

        {state && !currentPlayer ? (
          <div className="p-4">
            <div className="panel rounded-[3px] p-6 text-center">
              <h2 className="title text-[30px]">Session expired</h2>
              <p className="mt-2 text-[15px] text-ink-soft">
                Join again to reconnect your phone.
              </p>
              <Link
                href={`/join/${joinCode}`}
                className="mt-5 inline-flex min-h-14 w-full items-center justify-center rounded-[3px] bg-fire px-5 font-display text-[24px] uppercase leading-none text-ground"
              >
                Rejoin
              </Link>
            </div>
          </div>
        ) : null}

        {currentPlayer ? (
          <div className="flex flex-col gap-5 px-4 py-5">
            {/* ---------- final results ---------- */}
            {gameEnded ? (
              <section>
                <p className="eyebrow">Final</p>
                <h2 className="title mt-1.5 text-[34px]">
                  {myRanking
                    ? `You finished ${ordinal(myRanking.rank)} of ${rankings.length}`
                    : "Thanks for training a dragon"}
                </h2>
                <Leaderboard
                  rankings={rankings}
                  nameFor={nameFor}
                  selfId={currentPlayer.id}
                  cutLine={null}
                />
              </section>
            ) : null}

            {/* ---------- eliminated ---------- */}
            {isEliminated && !gameEnded ? (
              <section className="border-l-[3px] border-l-gold bg-gold/[0.06] p-4">
                <h2 className="title text-[26px]">
                  {hasCompeted ? "You did not advance" : "You joined mid-game"}
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                  {hasCompeted
                    ? `${myRanking ? `You finished ${ordinal(myRanking.rank)} in that round. ` : ""}You are spectating the rest of the game.`
                    : "This game was already under way, so you are watching this one from the stands."}
                  {audienceVoting
                    ? " You can still vote — your ballot counts as an audience vote."
                    : ""}
                </p>
              </section>
            ) : null}

            {/* ---------- the challenge ---------- */}
            <section>
              <p className="eyebrow">Beat this dragon</p>
              <h2 className="title mt-1.5 text-[32px]">
                {currentRound?.title ?? "Waiting for host"}
              </h2>
              <div className="mt-4">
                {currentRound?.challenge_image_url ? (
                  <img
                    src={currentRound.challenge_image_url}
                    alt="The dragon to beat"
                    className="aspect-square w-full border border-line object-cover"
                  />
                ) : (
                  <div className="relative aspect-square w-full overflow-hidden border border-line">
                    <img
                      src="/hero-dragon.jpg"
                      alt=""
                      aria-hidden
                      className="h-full w-full object-cover opacity-25"
                    />
                    <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                      <p className="title text-[22px]">Waiting for the host to start</p>
                    </div>
                  </div>
                )}
              </div>
              {currentRound?.additional_instruction ? (
                <div className="mt-4 border-l-[3px] border-l-sea bg-sea/[0.08] p-4">
                  <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-sea">
                    New challenge
                  </p>
                  <p className="mt-1.5 text-[16px] leading-relaxed text-ink">
                    {currentRound.additional_instruction}
                  </p>
                </div>
              ) : null}
            </section>

            {/* ---------- writing ---------- */}
            {!isEliminated && !currentSubmission && currentRound?.submission_open ? (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="prompt" className="eyebrow">
                    {roundConfig(currentRound.round_number)?.promptLabel ??
                      "Add a follow-up instruction"}
                  </label>
                  <TextArea
                    id="prompt"
                    className="mt-2 min-h-42 resize-none"
                    value={prompt}
                    onChange={(event) => {
                      setPrompt(event.target.value);
                      setReviewing(false);
                    }}
                    placeholder={
                      roundConfig(currentRound.round_number)?.promptPlaceholder ?? ""
                    }
                    required
                    minLength={8}
                    maxLength={4000}
                    aria-describedby="prompt-meta"
                  />
                  <div
                    id="prompt-meta"
                    className="mt-2 flex items-center justify-between font-mono text-[13px]"
                  >
                    <span className="text-muted-2">{prompt.trim().length} / 4000</span>
                    <span className="font-bold text-fire">
                      {coveredDimensions(prompt).size} of 6 covered
                    </span>
                  </div>
                </div>

                <PromptGuide prompt={prompt} />

                <Button
                  type="button"
                  size="lg"
                  className="w-full"
                  disabled={prompt.trim().length < 8}
                  onClick={() => setReviewing(true)}
                >
                  Review and lock
                </Button>

                {/* A sheet, not an inline block: locking is irreversible and deserves a beat. */}
                {reviewing ? (
                  <div className="fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-t-fire bg-panel-2 px-4 pt-5.5 pb-5">
                    <div className="mx-auto flex max-w-2xl flex-col gap-4">
                      <p className="title text-[30px] leading-[1.02]">
                        Lock this in? You can&apos;t edit it after.
                      </p>
                      <p className="numeric border-l-[3px] border-l-fire pl-3.5 text-[16px] leading-relaxed text-ink-2">
                        {prompt.trim()}
                      </p>
                      <div className="flex flex-col gap-2.5">
                        <Button
                          size="lg"
                          loading={busy === "submit"}
                          icon={<Send className="h-[22px] w-[22px]" aria-hidden />}
                          type="submit"
                          className="w-full"
                        >
                          Lock it in
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="w-full"
                          onClick={() => setReviewing(false)}
                        >
                          Keep editing
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </form>
            ) : null}

            {/* ---------- locked prompt ---------- */}
            {currentSubmission ? (
              <section>
                <div className="flex items-center justify-between gap-3">
                  <p className="eyebrow">Your locked prompt</p>
                  <CheckCircle2 className="h-4 w-4 text-sea" aria-hidden />
                </div>
                <p className="numeric mt-2 border-l-[3px] border-l-fire pl-3.5 text-[16px] leading-relaxed text-ink-2">
                  {currentSubmission.follow_up_prompt ?? currentSubmission.initial_prompt}
                </p>
              </section>
            ) : null}

            {/* ---------- your dragon ---------- */}
            {myImage ? (
              <section>
                <p className="eyebrow">Your dragon</p>
                {myImage.generation_status === "complete" && myImage.image_url ? (
                  <>
                    <img
                      src={myImage.image_url}
                      alt="Your generated dragon"
                      className="mt-2 aspect-square w-full border border-line object-cover"
                    />
                    <div className="grid grid-cols-3 gap-px border border-line border-t-0 bg-line">
                      <StatTile
                        value={String(
                          state?.votes.filter(
                            (v) => v.voted_for_player_id === currentPlayer.id
                          ).length ?? 0
                        )}
                        label="Votes"
                        tone="fire"
                      />
                      <StatTile
                        value={formatScore(myImage.ai_similarity_score)}
                        label="AI score"
                        tone="sea"
                      />
                      <StatTile
                        value={myRanking?.rank ? `#${myRanking.rank}` : "—"}
                        label="Rank"
                        tone="gold"
                      />
                    </div>
                    {myImage.ai_similarity_rationale ? (
                      <div className="border border-line border-t-0 bg-ground-2 p-4">
                        <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-sea">
                          Why it scored that
                        </p>
                        <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
                          {myImage.ai_similarity_rationale}
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <GenerationStatus
                    status={myImage.generation_status}
                    error={myImage.generation_error}
                  />
                )}
              </section>
            ) : null}

            {/* ---------- voting ---------- */}
            {canVote ? (
              <section>
                <p className="text-[16px] leading-relaxed text-ink-soft">
                  {isEliminated
                    ? "Your audience vote counts. Pick the strongest dragon."
                    : "Pick the strongest dragon. You can change your vote while voting is open."}
                  {state?.session.anonymous_voting
                    ? " Names are hidden until the results."
                    : ""}
                </p>
                <div className="mt-4 flex flex-col gap-4">
                  {completedImages
                    .filter((image) => image.player_id !== currentPlayer.id)
                    .map((image) => {
                      const label = nameFor(image.player_id);
                      const selected = currentVote?.voted_for_player_id === image.player_id;
                      return (
                        <article
                          key={image.id}
                          className={
                            selected
                              ? "border-2 border-fire"
                              : "border border-line"
                          }
                        >
                          <img
                            src={image.image_url ?? ""}
                            alt={`Dragon by ${label}`}
                            className="aspect-square w-full object-cover"
                          />
                          {selected ? (
                            <div className="flex min-h-15 items-center justify-between gap-3 border-t border-fire bg-fire px-3.5">
                              <span className="title text-[20px] text-ground">{label}</span>
                              <span className="numeric text-[13px] font-extrabold uppercase tracking-[0.12em] text-ground">
                                Your vote
                              </span>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={Boolean(busy)}
                              onClick={() => void voteFor(image.player_id)}
                              aria-label={`Vote for ${label}`}
                              className="flex min-h-15 w-full items-center justify-between gap-3 border-t border-line bg-transparent px-3.5 text-ink transition hover:bg-white/5 disabled:opacity-40"
                            >
                              <span className="title text-[20px]">{label}</span>
                              <span className="numeric text-[13px] font-extrabold uppercase tracking-[0.12em] text-sea">
                                {busy === image.player_id ? "Voting…" : "Vote"}
                              </span>
                            </button>
                          )}
                        </article>
                      );
                    })}
                </div>
                {completedImages.filter((image) => image.player_id !== currentPlayer.id)
                  .length === 0 ? (
                  <p className="border border-line bg-white/5 p-4 text-center text-[15px] text-ink-soft">
                    No other dragon is ready yet. Keep this screen open.
                  </p>
                ) : null}
              </section>
            ) : null}

            {/* ---------- spectator gallery ---------- */}
            {!canVote && completedImages.length > 0 ? (
              <section>
                <p className="eyebrow">This round&apos;s dragons</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {completedImages.map((image) => (
                    <article key={image.id} className="border border-line">
                      <img
                        src={image.image_url ?? ""}
                        alt={`Dragon by ${nameFor(image.player_id)}`}
                        className="aspect-square w-full object-cover"
                      />
                      <div className="flex items-center justify-between gap-2 border-t border-line px-2.5 py-2">
                        <span className="truncate text-[14px] font-bold text-ink">
                          {nameFor(image.player_id)}
                        </span>
                        {resultsVisible ? (
                          <span className="numeric text-[13px] font-bold text-sea">
                            {formatScore(image.ai_similarity_score)}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {/* ---------- the lesson ---------- */}
            {resultsVisible && state?.session.reveal_prompts ? (
              <PromptReveal
                submissions={
                  state.submissions.filter(
                    (submission) => submission.round_id === currentRound?.id
                  ) ?? []
                }
                rankings={rankings}
                nameFor={nameFor}
                selfId={currentPlayer.id}
              />
            ) : null}

            {resultsVisible && !gameEnded ? (
              <section>
                <p className="eyebrow">Round leaderboard</p>
                <Leaderboard
                  rankings={rankings}
                  nameFor={nameFor}
                  selfId={currentPlayer.id}
                  cutLine={null}
                />
              </section>
            ) : null}

            {!canVote && !resultsVisible && !gameEnded && completedImages.length === 0 ? (
              <section className="border border-line bg-white/5 p-6 text-center">
                <Crown className="mx-auto mb-3 h-9 w-9 text-gold" aria-hidden />
                <p className="title text-[22px]">Watch the host screen</p>
                <p className="mt-2 text-[15px] text-ink-soft">
                  This updates on its own. Keep it open.
                </p>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ordinal(rank: number) {
  const suffix =
    rank % 100 >= 11 && rank % 100 <= 13
      ? "th"
      : rank % 10 === 1
        ? "st"
        : rank % 10 === 2
          ? "nd"
          : rank % 10 === 3
            ? "rd"
            : "th";
  return `${rank}${suffix}`;
}


function GenerationStatus({
  status,
  error
}: {
  status: string;
  error: string | null;
}) {
  const headline =
    status === "generating"
      ? "Drawing your dragon"
      : status === "pending"
        ? "You're in the queue"
        : status === "skipped"
          ? "The host skipped this one"
          : "Your dragon could not be drawn";

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-2 flex aspect-square w-full flex-col items-center justify-center gap-3 border border-dashed border-line-strong bg-panel px-6 text-center"
    >
      {status === "generating" || status === "pending" ? (
        <div className="h-1 w-24 overflow-hidden bg-white/10">
          <div className="lane-sweep h-full w-1/3 bg-fire" />
        </div>
      ) : null}
      <p className="title text-[22px]">{headline}</p>
      <p className="text-[15px] leading-relaxed text-ink-soft">
        {status === "failed"
          ? (error ?? "Tell your host — they can retry it for you.")
          : status === "skipped"
            ? "You are still in the round; this image just was not used."
            : "This updates on its own."}
      </p>
    </div>
  );
}

function StatTile({
  value,
  label,
  tone
}: {
  value: string;
  label: string;
  tone: "fire" | "sea" | "gold";
}) {
  return (
    <div className="bg-panel-2 px-2 py-3.5 text-center">
      <p
        className={`numeric text-[26px] font-extrabold leading-none ${
          tone === "fire" ? "text-fire" : tone === "sea" ? "text-sea" : "text-gold"
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
    </div>
  );
}

function Splash({
  title,
  body,
  children
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-5 py-8">
      <div className="w-full max-w-md text-center" role="status" aria-live="polite">
        <DragonMark className="mx-auto mb-5 h-16 w-16" />
        <h1 className="title text-[34px]">{title}</h1>
        <p className="mt-2 text-[16px] text-ink-soft">{body}</p>
        {children}
      </div>
    </main>
  );
}

function Leaderboard({
  rankings,
  nameFor,
  selfId,
  cutLine
}: {
  rankings: { player_id: string; rank: number; vote_score: number }[];
  nameFor: (playerId: string) => string;
  selfId: string;
  cutLine: number | null;
}) {
  if (!rankings.length) {
    return <p className="mt-3 text-[15px] text-ink-soft">No standings yet.</p>;
  }

  return (
    <ol className="mt-3 flex flex-col">
      {rankings.map((ranking, index) => {
        const isSelf = ranking.player_id === selfId;
        return (
          <li key={ranking.player_id}>
            {cutLine !== null && index === cutLine ? (
              <p className="my-2 font-mono text-[11px] uppercase tracking-[0.16em] text-danger">
                — cut line —
              </p>
            ) : null}
            <div
              className={`flex items-center justify-between gap-3 border px-3.5 py-2.5 ${
                isSelf
                  ? "border-fire bg-fire/10"
                  : "border-line border-t-0 first:border-t bg-panel-2"
              }`}
            >
              <span className="flex min-w-0 items-center gap-3.5">
                <span
                  className={`numeric text-[15px] font-extrabold ${
                    ranking.rank <= 3 ? "text-gold" : "text-muted-2"
                  }`}
                >
                  #{ranking.rank}
                </span>
                <span className="truncate text-[16px] font-bold text-ink">
                  {nameFor(ranking.player_id)}
                  {isSelf ? " (you)" : ""}
                </span>
              </span>
              <span className="numeric shrink-0 text-[13px] font-bold text-muted">
                {ranking.vote_score} {ranking.vote_score === 1 ? "vote" : "votes"}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function PromptReveal({
  submissions,
  rankings,
  nameFor,
  selfId
}: {
  submissions: {
    id: string;
    player_id: string;
    initial_prompt: string | null;
    follow_up_prompt: string | null;
  }[];
  rankings: { player_id: string; rank: number }[];
  nameFor: (playerId: string) => string;
  selfId: string;
}) {
  const rankOf = (playerId: string) =>
    rankings.find((ranking) => ranking.player_id === playerId)?.rank ?? 999;
  const ordered = [...submissions].sort(
    (left, right) => rankOf(left.player_id) - rankOf(right.player_id)
  );

  if (!ordered.length) {
    return null;
  }

  return (
    <section>
      <p className="eyebrow">What everyone wrote</p>
      <h2 className="title mt-1.5 text-[26px]">The actual lesson</h2>
      <p className="mt-1.5 text-[15px] text-ink-soft">
        Best-placed first. This is the part worth stealing next round.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {ordered.map((submission) => {
          const rank = rankOf(submission.player_id);
          const isSelf = submission.player_id === selfId;
          const text = submission.follow_up_prompt ?? submission.initial_prompt ?? "";
          return (
            <article
              key={submission.id}
              className={`border p-3.5 ${
                isSelf ? "border-fire bg-fire/[0.06]" : "border-line bg-panel-2"
              }`}
            >
              <div className="flex items-center gap-2.5">
                {rank < 999 ? (
                  <span
                    className={`numeric text-[13px] font-extrabold ${
                      rank <= 3 ? "text-gold" : "text-muted-2"
                    }`}
                  >
                    #{rank}
                  </span>
                ) : null}
                <h3 className="title truncate text-[18px]">
                  {nameFor(submission.player_id)}
                  {isSelf ? " (you)" : ""}
                </h3>
              </div>
              <p className="numeric mt-2 text-[15px] leading-relaxed text-ink-2">{text}</p>
              <CoverageTags prompt={text} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
