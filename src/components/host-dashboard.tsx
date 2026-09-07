"use client";

import QRCode from "qrcode";
import {
  ArrowRight,
  Crown,
  Download,
  Home,
  Lock,
  RefreshCw,
  Settings2,
  Sparkles,
  Trophy,
  Unlock,
  Vote
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ConfirmDialog,
  LobbyStage,
  Metric,
  MetricPanel,
  RevealStage,
  Toggle,
  WinnersStage
} from "@/components/host/panels";
import { PhaseTimer } from "@/components/phase-timer";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { TextArea, TextField } from "@/components/ui/field";
import { useGameState } from "@/hooks/use-game-state";
import { useRoundGating } from "@/hooks/use-round-gating";
import { requestJson } from "@/lib/client/api";
import { hostTokenKey } from "@/lib/client/storage";
import { advancingCount, isFinalRound, roundConfig } from "@/lib/game/progression";
import { tiedAtCutLine } from "@/lib/game/ranking";
import { formatScore, titleForScoringMode } from "@/lib/utils";
import type { GameSession, ScoringMode } from "@/lib/types";

type NewGameResponse = {
  session: GameSession;
  hostToken: string;
  archive: {
    keptImageCount: number;
    cleanedImageCount: number;
    removedStorageObjectCount: number;
  };
};

type RenewGameResponse = {
  session: GameSession;
  hostToken: string;
  cleanup: { removedStorageObjectCount: number };
};

type AbandonGameResponse = {
  ok: boolean;
  cleanup: { deletedGameCount: number; removedStorageObjectCount: number };
};

type ConfirmationAction = "renew" | "abandon" | "advance";

// Parallel lanes for the generation queue. Four collapses a 25-student round from ~15
// minutes to ~4 while staying clear of OpenAI image rate limits.
const DEFAULT_GENERATION_CONCURRENCY = 4;
const SCORING_CONCURRENCY = 6;
const BATCH_JOB_CEILING = 120;

const CONFIRMATIONS: Record<
  ConfirmationAction,
  { title: string; body: string; confirmLabel: string }
> = {
  renew: {
    title: "Renew game?",
    body: "This deletes the current game, players, prompts, votes, rankings, and stored images, then creates a fresh join code.",
    confirmLabel: "Renew game"
  },
  abandon: {
    title: "Back to home?",
    body: "This completely abandons the current game, deletes its data and stored images, and returns to the home screen.",
    confirmLabel: "Back to home"
  },
  advance: {
    title: "Advance the round?",
    body: "Advancing eliminates everyone below the cut line. This cannot be undone.",
    confirmLabel: "Advance round"
  }
};

export function HostDashboard({ joinCode }: { joinCode: string }) {
  const router = useRouter();
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [nextInstruction, setNextInstruction] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);
  const [voteWeightDraft, setVoteWeightDraft] = useState(0.5);
  const [generationConcurrency, setGenerationConcurrency] = useState(
    DEFAULT_GENERATION_CONCURRENCY
  );
  const [viewMode, setViewMode] = useState<"control" | "lobby" | "reveal">("control");
  const [revealIndex, setRevealIndex] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mutationLock = useRef(false);

  useEffect(() => {
    setHostToken(window.localStorage.getItem(hostTokenKey(joinCode)));
    setOrigin(window.location.origin);
    setAuthReady(true);
  }, [joinCode]);

  const {
    state,
    error: stateError,
    loading,
    reload
  } = useGameState(joinCode, { hostToken }, authReady && Boolean(hostToken));
  const joinUrl = origin ? `${origin}/join/${joinCode}` : "";

  useEffect(() => {
    if (!joinUrl) return;
    void QRCode.toDataURL(joinUrl, { margin: 1, width: 280 }).then(setQrCode);
  }, [joinUrl]);

  useEffect(() => {
    if (state) {
      setVoteWeightDraft(state.session.vote_weight);
    }
  }, [state?.session.vote_weight]);

  useEffect(() => {
    if (!authReady || loading || !hostToken || !state || state.isHost) {
      return;
    }
    window.localStorage.removeItem(hostTokenKey(joinCode));
    setHostToken(null);
    setMessage(null);
    setError("Your host session expired. Enter the Host PIN to unlock this dashboard again.");
  }, [authReady, hostToken, joinCode, loading, state]);

  const {
    currentRound,
    submissions: currentSubmissions,
    images: currentImages,
    votes: currentVotes,
    rankings: currentRankings,
    completedImages,
    scoredImages,
    blockedImages,
    activePlayers,
    scoringMode,
    requiresVoting,
    canOpenSubmissions,
    canCloseSubmissions,
    canGenerate,
    canOpenVoting,
    canCloseVoting,
    canScoreImages,
    canRecomputeRankings,
    canAdvance
  } = useRoundGating(state);
  const mutationBusy = Boolean(busy);

  function beginMutation(key: string) {
    if (mutationLock.current) {
      return false;
    }
    mutationLock.current = true;
    setBusy(key);
    return true;
  }

  function finishMutation() {
    mutationLock.current = false;
    setBusy(null);
  }

  async function unlock(event: FormEvent) {
    event.preventDefault();
    if (!beginMutation("unlock")) return;
    setError(null);
    try {
      const data = await requestJson<{ hostToken: string }>(
        `/api/games/${joinCode}/host/verify`,
        { pin }
      );
      window.localStorage.setItem(hostTokenKey(joinCode), data.hostToken);
      setHostToken(data.hostToken);
      setMessage("Host unlocked.");
      await reload();
    } catch (unlockError) {
      setError(unlockError instanceof Error ? unlockError.message : "Could not unlock host");
    } finally {
      finishMutation();
    }
  }

  async function post(path: string, body: Record<string, unknown> = {}) {
    if (!hostToken || !beginMutation(path)) return;
    setError(null);
    setMessage(null);
    try {
      const result = await requestJson<Record<string, unknown>>(path, {
        hostToken,
        ...body
      });
      await reload();
      return result;
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Action failed");
    } finally {
      finishMutation();
    }
  }

  async function runBatch(kind: "generate" | "score") {
    if (!hostToken || !beginMutation(kind)) return;
    const noun = kind === "generate" ? "image" : "score";
    const path = `/api/games/${joinCode}/host/${
      kind === "generate" ? "generate-next" : "score-next"
    }`;
    setError(null);
    setMessage(kind === "generate" ? "Generating dragon images..." : "Scoring images...");

    let done = 0;
    let failed = 0;
    let drained = false;
    let fatal: Error | null = null;
    let processed = 0;

    // Each worker claims its own row server-side (claim_next_image uses FOR UPDATE SKIP
    // LOCKED), so workers never collide and never generate the same dragon twice. Running a
    // handful in parallel is what turns a 25-student round from ~15 minutes into ~4.
    async function worker() {
      while (!drained && !fatal && processed < BATCH_JOB_CEILING) {
        processed += 1;
        let result;
        try {
          result = await requestJson<{
            processed: boolean;
            failed?: boolean;
            error?: string;
          }>(path, { hostToken });
        } catch (workerError) {
          fatal = workerError instanceof Error ? workerError : new Error("Batch failed");
          return;
        }

        // One student's failure must never abandon the rest of the class.
        if (result.failed) {
          failed += 1;
        } else if (!result.processed) {
          drained = true;
          return;
        } else {
          done += 1;
        }

        setMessage(
          failed
            ? `${done} ${noun}s done, ${failed} failed. Still working...`
            : `${done} ${noun}s done. Still working...`
        );
        void reload();
      }
    }

    try {
      const lanes = kind === "generate" ? generationConcurrency : SCORING_CONCURRENCY;
      await Promise.all(Array.from({ length: lanes }, () => worker()));

      if (fatal) {
        throw fatal;
      }

      if (!drained) {
        setMessage(
          `Batch paused after ${BATCH_JOB_CEILING} jobs. Press the button again to continue.`
        );
      } else {
        if (kind === "score") {
          await requestJson(`/api/games/${joinCode}/host/rankings`, { hostToken });
        }
        setMessage(
          failed
            ? `${done} ${noun}s done, ${failed} could not be completed. Retry or skip them below.`
            : kind === "generate"
              ? "Image generation complete."
              : "AI scoring complete."
        );
      }
      await reload();
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "Batch failed");
      await reload();
    } finally {
      finishMutation();
    }
  }

  async function promptRename(playerId: string, currentName: string) {
    const next = window.prompt("New display name for this player:", currentName);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === currentName) return;
    await post(`/api/games/${joinCode}/host/rename-player`, { playerId, name: trimmed });
  }

  async function confirmRemovePlayer(playerId: string, name: string) {
    if (!window.confirm(`Remove ${name} from the game? Their prompts and images go too.`)) {
      return;
    }
    await post(`/api/games/${joinCode}/host/remove-player`, { playerId });
  }

  async function openAdvanceConfirmation() {
    // advanceRound recomputes rankings from scratch and ignores the persisted rows, so the
    // dialog must be built from a fresh recompute or it can name a different set of
    // survivors than the server is about to choose.
    await post(`/api/games/${joinCode}/host/rankings`);
    setConfirmation("advance");
  }

  async function exportResults() {
    if (!hostToken || !beginMutation("export")) return;
    setError(null);
    try {
      const results = await requestJson<Record<string, unknown>>(
        `/api/games/${joinCode}/host/export`,
        { hostToken }
      );
      const blob = new Blob([JSON.stringify(results, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dragon-game-${joinCode}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Results downloaded. Safe to renew or archive now.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Could not export results");
    } finally {
      finishMutation();
    }
  }

  async function updateSettings(settings: Record<string, boolean>) {
    await post(`/api/games/${joinCode}/host/settings`, settings);
  }

  async function startTimer(seconds: number | null) {
    await post(`/api/games/${joinCode}/host/timer`, { seconds });
  }

  async function retryImage(imageId: string) {
    await post(`/api/games/${joinCode}/host/retry-image`, { imageId });
  }

  async function skipImage(imageId: string) {
    await post(`/api/games/${joinCode}/host/skip-image`, { imageId });
  }

  async function updateScoring(scoringMode: ScoringMode, voteWeight: number) {
    await post(`/api/games/${joinCode}/host/scoring`, { scoringMode, voteWeight });
  }

  async function commitVoteWeight(value: number) {
    if (value === state?.session.vote_weight) return;
    await updateScoring(state?.session.scoring_mode ?? "voting_first", value);
  }

  async function advance() {
    const result = await post(`/api/games/${joinCode}/host/advance`, {
      additionalInstruction: nextInstruction
    });
    if (result) {
      setNextInstruction("");
      setMessage("Round advanced.");
    }
  }

  async function archiveAndStartNewGame() {
    if (!hostToken) return;
    const path = `/api/games/${joinCode}/host/new-game`;
    if (!beginMutation(path)) return;
    setError(null);
    setMessage(null);
    try {
      const data = await requestJson<NewGameResponse>(path, { hostToken });
      window.localStorage.setItem(hostTokenKey(data.session.join_code), data.hostToken);
      router.push(`/host/${data.session.join_code}`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Could not create new game");
    } finally {
      finishMutation();
    }
  }

  async function renewGame() {
    if (!hostToken) return;
    const path = `/api/games/${joinCode}/host/renew`;
    if (!beginMutation(path)) return;
    setError(null);
    setMessage(null);
    setConfirmation(null);
    try {
      const data = await requestJson<RenewGameResponse>(path, { hostToken });
      window.localStorage.setItem(hostTokenKey(data.session.join_code), data.hostToken);
      router.push(`/host/${data.session.join_code}`);
    } catch (renewError) {
      setError(renewError instanceof Error ? renewError.message : "Could not renew game");
    } finally {
      finishMutation();
    }
  }

  async function abandonGame() {
    if (!hostToken) return;
    const path = `/api/games/${joinCode}/host/abandon`;
    if (!beginMutation(path)) return;
    setError(null);
    setMessage(null);
    setConfirmation(null);
    try {
      await requestJson<AbandonGameResponse>(path, { hostToken });
      window.localStorage.removeItem(hostTokenKey(joinCode));
      router.push("/");
    } catch (abandonError) {
      setError(abandonError instanceof Error ? abandonError.message : "Could not leave game");
    } finally {
      finishMutation();
    }
  }

  // Name exactly who is about to be cut, and warn when the boundary is a genuine tie.
  const advanceDetail = (() => {
    if (!currentRound) return null;
    if (isFinalRound(currentRound.round_number)) {
      return "This is the final round, so advancing ends the game and reveals the winners.";
    }
    const ranked = [...currentRankings].sort((left, right) => left.rank - right.rank);
    const cutLine = advancingCount(currentRound.round_number, ranked.length);
    const advancing = ranked.slice(0, cutLine);
    const eliminated = ranked.slice(cutLine);
    const nameFor = (playerId: string) =>
      state?.players.find((item) => item.id === playerId)?.name ?? "Unknown";
    if (!ranked.length) {
      return "No rankings have been computed yet, so nobody can advance.";
    }
    const tied = tiedAtCutLine(ranked, currentRound.round_number);
    return [
      `Advancing ${advancing.length}: ${advancing.map((r) => nameFor(r.player_id)).join(", ")}.`,
      eliminated.length
        ? `Eliminating ${eliminated.length}: ${eliminated.map((r) => nameFor(r.player_id)).join(", ")}.`
        : "Nobody is eliminated at this cut line.",
      tied.length
        ? `Heads up: ${tied.map((r) => nameFor(r.player_id)).join(", ")} are tied on ${tied[0].total_score} across the cut line, and the tie is being broken by who submitted first.`
        : ""
    ]
      .filter(Boolean)
      .join(" ");
  })();

  const confirmationCopy = confirmation ? CONFIRMATIONS[confirmation] : null;
  const confirmationBusyKey = confirmation
    ? `/api/games/${joinCode}/host/${confirmation}`
    : "";

  const nameFor = (playerId: string) =>
    state?.players.find((item) => item.id === playerId)?.name ?? "Trainer";

  /**
   * The single next action. The teacher is mid-sentence in front of thirty students, so the
   * dashboard names one thing, makes it 96px tall, and puts everything else behind it.
   */
  const primaryAction = (() => {
    if (!currentRound) {
      return {
        label: "Start game",
        hint: "Generates the first challenge dragon",
        icon: <Sparkles className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: `/api/games/${joinCode}/host/start`,
        kind: "start" as const
      };
    }
    if (canOpenSubmissions) {
      return {
        label: "Open submissions",
        hint: "Students can start writing",
        icon: <Unlock className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: `/api/games/${joinCode}/host/action`,
        kind: "open_submissions" as const
      };
    }
    if (canCloseSubmissions) {
      return {
        label: "Lock in prompts",
        hint: `${currentSubmissions.length} of ${activePlayers.length} submitted`,
        icon: <Lock className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: `/api/games/${joinCode}/host/action`,
        kind: "close_submissions" as const
      };
    }
    if (canGenerate) {
      return {
        label: "Draw the dragons",
        hint: `${completedImages.length} of ${currentSubmissions.length} drawn · ${generationConcurrency} lanes`,
        icon: <Sparkles className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: "generate",
        kind: "generate" as const
      };
    }
    if (canOpenVoting) {
      return {
        label: "Open voting",
        hint: "Every dragon is ready",
        icon: <Vote className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: `/api/games/${joinCode}/host/action`,
        kind: "open_voting" as const
      };
    }
    if (canCloseVoting) {
      return {
        label: requiresVoting ? "Close voting" : "Finalize round",
        hint: `${currentVotes.length} votes cast`,
        icon: <Lock className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: `/api/games/${joinCode}/host/action`,
        kind: "close_voting" as const
      };
    }
    if (canScoreImages) {
      return {
        label: "Score with AI",
        hint: `${scoredImages.length} of ${completedImages.length} scored`,
        icon: <Sparkles className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: "score",
        kind: "score" as const
      };
    }
    if (canAdvance) {
      return {
        label: isFinalRound(currentRound.round_number) ? "End game" : "Advance round",
        hint: isFinalRound(currentRound.round_number)
          ? "Reveals the winners"
          : "Cuts everyone below the line",
        icon: <ArrowRight className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: `/api/games/${joinCode}/host/advance`,
        kind: "advance" as const
      };
    }
    if (canRecomputeRankings) {
      return {
        label: "Recompute ranks",
        hint: "Rebuilds the standing from current votes",
        icon: <Trophy className="h-8 w-8" aria-hidden />,
        disabled: mutationBusy,
        busyKey: `/api/games/${joinCode}/host/rankings`,
        kind: "rankings" as const
      };
    }
    return {
      label: "Waiting",
      hint: blockedImages.length
        ? `${blockedImages.length} image${blockedImages.length === 1 ? "" : "s"} need attention`
        : "Nothing to do right now",
      icon: <RefreshCw className="h-8 w-8" aria-hidden />,
      disabled: true,
      busyKey: "",
      kind: "none" as const
    };
  })();

  function runPrimaryAction(kind: string) {
    if (kind === "start") return void post(`/api/games/${joinCode}/host/start`);
    if (kind === "generate") return void runBatch("generate");
    if (kind === "score") return void runBatch("score");
    if (kind === "advance") return void openAdvanceConfirmation();
    if (kind === "rankings") return void post(`/api/games/${joinCode}/host/rankings`);
    if (kind === "none") return;
    return void post(`/api/games/${joinCode}/host/action`, { action: kind });
  }

  const phaseLabel = currentRound?.voting_open
    ? "Voting open"
    : currentRound?.submission_open
      ? "Submissions open"
      : currentRound
        ? "Between phases"
        : "Lobby";

  if (!authReady) {
    return <HostSplash title="Loading host controls" body="Checking this browser's session." />;
  }

  if (!hostToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ground px-5 py-8">
        <form onSubmit={unlock} className="w-full max-w-md border border-line bg-panel p-7">
          <p className="numeric text-[13px] font-bold tracking-[0.1em] text-sea">{joinCode}</p>
          <h1 className="title mt-1.5 text-[40px]">Host unlock</h1>
          <div className="mt-6 space-y-3">
            <label
              htmlFor="hostPin"
              className="font-mono text-[12px] uppercase tracking-[0.22em] text-muted-2"
            >
              Host PIN
            </label>
            <TextField
              id="hostPin"
              type="password"
              autoComplete="current-password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="Enter PIN"
              minLength={4}
              maxLength={32}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "host-unlock-error" : undefined}
              required
            />
            {error ? (
              <p id="host-unlock-error" role="alert" className="text-[15px] font-semibold text-danger">
                {error}
              </p>
            ) : null}
            <Button className="w-full" loading={busy === "unlock"} type="submit">
              Unlock dashboard
            </Button>
          </div>
        </form>
      </main>
    );
  }

  if (loading && !state) {
    return <HostSplash title="Loading dashboard" body="Syncing the latest game state." />;
  }

  if (stateError && !state) {
    return (
      <HostSplash title="Could not load the dashboard" body={stateError}>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          <Button variant="ghost" onClick={() => void reload()}>
            Try again
          </Button>
          <Button
            onClick={() => {
              window.localStorage.removeItem(hostTokenKey(joinCode));
              setHostToken(null);
              setError("Enter the Host PIN to unlock this dashboard again.");
            }}
          >
            Unlock again
          </Button>
        </div>
      </HostSplash>
    );
  }

  if (state && !state.isHost) {
    return <HostSplash title="Refreshing host access" body="One moment." />;
  }

  return (
    <main className="flex min-h-screen flex-col bg-ground">
      {/* ---------------------------------------------------------- header */}
      <header className="shrink-0 border-b border-white/[0.12] bg-ground-2">
        <div className="h-[5px] w-full bg-fire" />
        <div className="flex flex-wrap items-center justify-between gap-6 px-6 py-5 lg:px-10">
          <div className="min-w-0">
            <p className="font-mono text-[12px] uppercase tracking-[0.22em] text-sea">
              {phaseLabel}
            </p>
            <h1 className="title mt-1 truncate text-[32px]">
              {currentRound?.title ?? "Lobby"}
            </h1>
          </div>

          {/* The one thing to do next, deliberately oversized. */}
          <div className="flex shrink-0 items-center gap-5">
            <Button
              size="lg"
              className="min-h-24 px-11 text-[clamp(28px,3vw,42px)]"
              icon={primaryAction.icon}
              loading={Boolean(primaryAction.busyKey) && busy === primaryAction.busyKey}
              disabled={primaryAction.disabled}
              onClick={() => runPrimaryAction(primaryAction.kind)}
            >
              {primaryAction.label}
            </Button>
            <p className="max-w-[180px] text-[14px] leading-snug text-muted">
              {primaryAction.hint}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-7">
            <PhaseTimer endsAt={currentRound?.phase_ends_at ?? null} size="lg" />
            <div className="flex flex-col items-end gap-2">
              <StatusPill tone="gold">{joinCode}</StatusPill>
              {state?.session.practice_mode ? (
                <StatusPill tone="gold">Practice · no spend</StatusPill>
              ) : null}
              <StatusPill
                tone={currentRound?.voting_open || currentRound?.submission_open ? "fire" : "neutral"}
                live={Boolean(currentRound?.voting_open || currentRound?.submission_open)}
              >
                {phaseLabel}
              </StatusPill>
            </div>
          </div>
        </div>
      </header>

      {(message || error || stateError) && (
        <div
          role={error || stateError ? "alert" : "status"}
          aria-live={error || stateError ? "assertive" : "polite"}
          className={`flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3 text-[15px] font-semibold lg:px-10 ${
            error || stateError
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-sea/30 bg-sea/10 text-sea"
          }`}
        >
          <span>{error ?? stateError ?? message}</span>
          <span className="flex gap-2">
            {stateError ? (
              <Button size="sm" variant="ghost" onClick={() => void reload()}>
                Retry sync
              </Button>
            ) : null}
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
          </span>
        </div>
      )}

      <div className="flex-1 p-6 lg:p-0">
        {viewMode === "lobby" ? (
          <LobbyStage
            joinCode={joinCode}
            joinUrl={joinUrl}
            qrCode={qrCode}
            players={state?.players ?? []}
            starting={busy === `/api/games/${joinCode}/host/start`}
            canStart={!mutationBusy && !currentRound}
            onStart={() => void post(`/api/games/${joinCode}/host/start`)}
          />
        ) : viewMode === "reveal" ? (
          <RevealStage
            images={completedImages}
            index={revealIndex}
            onIndexChange={setRevealIndex}
            resetKey={currentRound?.id ?? ""}
            roundTitle={currentRound?.title ?? "Lobby"}
            nameFor={(playerId) =>
              state?.session.anonymous_voting && currentRound?.voting_open
                ? "Hidden until results"
                : nameFor(playerId)
            }
            rankFor={(playerId) =>
              currentRankings.find((item) => item.player_id === playerId)?.rank ?? null
            }
            votesFor={(playerId) =>
              currentVotes.filter((item) => item.voted_for_player_id === playerId).length
            }
            promptFor={(playerId) => {
              if (state?.session.anonymous_voting && currentRound?.voting_open) return null;
              const submission = currentSubmissions.find((item) => item.player_id === playerId);
              return submission?.follow_up_prompt ?? submission?.initial_prompt ?? null;
            }}
          />
        ) : state?.session.status === "ended" && currentRankings.length ? (
          <WinnersStage
            rankings={currentRankings}
            nameFor={nameFor}
            imageFor={(playerId) =>
              currentImages.find((item) => item.player_id === playerId && item.image_url)
                ?.image_url ?? null
            }
            votesFor={(playerId) =>
              currentVotes.filter((item) => item.voted_for_player_id === playerId).length
            }
            promptFor={(playerId) => {
              const submission = currentSubmissions.find((item) => item.player_id === playerId);
              return submission?.follow_up_prompt ?? submission?.initial_prompt ?? null;
            }}
            onExport={() => void exportResults()}
            onNewGame={() => void archiveAndStartNewGame()}
            newGameLoading={busy === `/api/games/${joinCode}/host/new-game`}
          />
        ) : (
          /* ------------------------------------------------ control body */
          <div className="grid gap-px bg-white/10 lg:h-full lg:grid-cols-[520px_1fr_560px]">
            {/* -------- left: the challenge -------- */}
            <div className="flex min-h-0 flex-col gap-5 bg-ground p-7">
              <p className="eyebrow">The challenge</p>
              {currentRound?.challenge_image_url ? (
                <img
                  src={currentRound.challenge_image_url}
                  alt="This round's challenge dragon"
                  className="aspect-square w-full border border-line object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center border border-dashed border-line-strong bg-panel text-center">
                  <p className="px-6 text-[16px] text-muted">
                    The challenge dragon appears once you start the game.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-px bg-white/10">
                <Metric label="Joined" value={state?.players.length ?? 0} />
                <Metric label="Active" value={activePlayers.length} />
                <Metric label="Locked" value={currentSubmissions.length} />
              </div>

              <div className="border border-line bg-panel-2 p-4">
                <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-sea">
                  Join at
                </p>
                <p className="numeric mt-1 break-all text-[15px] text-ink-2">{joinUrl}</p>
                <p className="numeric mt-3 text-[40px] font-extrabold leading-none tracking-[0.06em] text-fire">
                  {joinCode}
                </p>
              </div>
            </div>

            {/* -------- centre: the room -------- */}
            <div className="flex min-h-0 flex-col gap-4.5 bg-ground p-7">
              <div className="flex items-end justify-between gap-5">
                <div>
                  <p className="eyebrow">The room</p>
                  <p className="numeric mt-1 text-[30px] font-extrabold leading-none">
                    {currentSubmissions.length}
                    <span className="text-dim"> / {activePlayers.length}</span>
                  </p>
                </div>
                <p className="font-mono text-[13px] uppercase tracking-[0.16em] text-muted-2">
                  {currentRound?.voting_open ? "voted" : "prompts locked"}
                </p>
              </div>

              <div className="h-2.5 w-full bg-white/10">
                <div
                  className="h-full bg-fire transition-all"
                  style={{
                    width: `${
                      activePlayers.length
                        ? Math.round(
                            ((currentRound?.voting_open
                              ? currentVotes.length
                              : currentSubmissions.length) /
                              activePlayers.length) *
                              100
                          )
                        : 0
                    }%`
                  }}
                />
              </div>

              <div className="grid min-h-0 flex-1 content-start gap-x-3 gap-y-2 overflow-auto sm:grid-cols-2">
                {(state?.players ?? []).map((player) => {
                  const hasSubmitted = currentSubmissions.some(
                    (submission) => submission.player_id === player.id
                  );
                  const hasVoted = currentVotes.some(
                    (voteItem) => voteItem.voter_player_id === player.id
                  );
                  const marked = currentRound?.voting_open ? hasVoted : hasSubmitted;
                  return (
                    <div
                      key={player.id}
                      className="group flex items-center gap-2.5 border border-line bg-panel-2 px-3 py-2"
                    >
                      <span
                        aria-hidden
                        className={`h-2.5 w-2.5 shrink-0 ${marked ? "bg-fire" : "bg-white/15"}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">
                        {player.name}
                      </span>
                      {player.is_eliminated ? (
                        <span className="numeric shrink-0 text-[11px] uppercase tracking-[0.12em] text-muted-3">
                          out
                        </span>
                      ) : player.current_rank ? (
                        <span className="numeric shrink-0 text-[12px] font-bold text-gold">
                          #{player.current_rank}
                        </span>
                      ) : null}
                      <span className="hidden shrink-0 gap-1 group-hover:flex group-focus-within:flex">
                        <button
                          type="button"
                          disabled={mutationBusy}
                          onClick={() => void promptRename(player.id, player.name)}
                          className="px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-sea hover:bg-white/10 disabled:opacity-40"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={mutationBusy}
                          onClick={() => void confirmRemovePlayer(player.id, player.name)}
                          className="px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-danger hover:bg-white/10 disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </span>
                    </div>
                  );
                })}
                {(state?.players ?? []).length === 0 ? (
                  <p className="text-[16px] text-muted">
                    Nobody has joined yet. Switch to Lobby view to show the code.
                  </p>
                ) : null}
              </div>

              <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted-3">
                Filled square = {currentRound?.voting_open ? "voted" : "prompt locked"} · hover a
                row to rename or remove
              </p>
            </div>

            {/* -------- right: results -------- */}
            <div className="flex min-h-0 flex-col gap-4.5 bg-ground p-7">
              <div className="flex items-end justify-between gap-4">
                <p className="eyebrow">Results</p>
                {blockedImages.length ? (
                  <StatusPill tone="danger">{blockedImages.length} need attention</StatusPill>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-px bg-white/10">
                <MetricPanel
                  title="Drawn"
                  value={`${completedImages.length}/${currentSubmissions.length}`}
                />
                <MetricPanel
                  title="Votes"
                  value={
                    state?.session.audience_voting
                      ? `${currentVotes.filter((v) => !v.is_audience_vote).length}+${currentVotes.filter((v) => v.is_audience_vote).length}`
                      : currentVotes.length
                  }
                />
                <MetricPanel
                  title="Scored"
                  value={`${scoredImages.length}/${completedImages.length}`}
                />
              </div>

              {busy === "generate" || busy === "score" ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="border border-fire/40 bg-fire/[0.08] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[12px] font-bold uppercase tracking-[0.14em] text-fire">
                      {busy === "generate" ? "Drawing dragons" : "Scoring"}
                    </span>
                    <span className="numeric text-[13px] font-bold text-ink">
                      {busy === "generate"
                        ? `${completedImages.length}/${currentSubmissions.length}`
                        : `${scoredImages.length}/${completedImages.length}`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 w-full overflow-hidden bg-white/10">
                    <div className="lane-sweep h-full w-1/3 bg-fire" />
                  </div>
                </div>
              ) : null}

              <div className="grid min-h-0 flex-1 content-start gap-3 overflow-auto sm:grid-cols-2">
                {currentImages.map((image) => {
                  const status = image.generation_status;
                  const isComplete = status === "complete" && image.image_url;
                  const needsAttention = status !== "complete" && status !== "skipped";
                  const ranking = currentRankings.find(
                    (item) => item.player_id === image.player_id
                  );
                  return (
                    <article key={image.id} className="border border-line bg-panel-2">
                      {isComplete ? (
                        <img
                          src={image.image_url ?? ""}
                          alt={nameFor(image.player_id)}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center bg-panel px-3 text-center">
                          <div>
                            <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted-2">
                              {status === "generating"
                                ? "Drawing…"
                                : status === "pending"
                                  ? "Queued"
                                  : status === "skipped"
                                    ? "Skipped"
                                    : "Failed"}
                            </p>
                            {image.generation_error ? (
                              <p className="mt-1.5 text-[11px] leading-snug text-danger">
                                {image.generation_error}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      )}
                      <div className="border-t border-line p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate text-[14px] font-bold text-ink">
                            {nameFor(image.player_id)}
                          </h3>
                          {ranking ? (
                            <span className="numeric shrink-0 text-[12px] font-extrabold text-gold">
                              #{ranking.rank}
                            </span>
                          ) : null}
                        </div>
                        {isComplete ? (
                          <p className="numeric mt-1 text-[12px] text-muted">
                            {
                              currentVotes.filter(
                                (v) => v.voted_for_player_id === image.player_id
                              ).length
                            }{" "}
                            votes · {formatScore(image.ai_similarity_score)} AI
                          </p>
                        ) : null}
                        {needsAttention ? (
                          <div className="mt-2 grid grid-cols-2 gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={mutationBusy}
                              onClick={() => void retryImage(image.id)}
                            >
                              Retry
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={mutationBusy}
                              onClick={() => void skipImage(image.id)}
                            >
                              Skip
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
                {currentImages.length === 0 ? (
                  <div className="col-span-full flex min-h-[200px] items-center justify-center border border-dashed border-line-strong bg-panel-2 p-6 text-center">
                    <p className="text-[15px] text-muted">
                      Dragons appear here once prompts are locked and drawn.
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- footer */}
      <footer className="shrink-0 border-t border-white/[0.12] bg-ground-2 px-6 py-3.5 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex gap-2">
            {(["control", "lobby", "reveal"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={`px-4 py-2.5 font-mono text-[13px] font-extrabold uppercase tracking-[0.14em] transition ${
                  viewMode === mode
                    ? "bg-fire text-ground"
                    : "border border-line text-muted hover:text-ink"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-muted-3">
              Timer
            </span>
            {[60, 120, 300].map((seconds) => (
              <Button
                key={seconds}
                size="sm"
                variant="ghost"
                disabled={mutationBusy || !currentRound}
                onClick={() => void startTimer(seconds)}
              >
                {seconds / 60}m
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              disabled={mutationBusy || !currentRound}
              onClick={() => void startTimer(null)}
            >
              Clear
            </Button>
          </div>

          {/* Occasional and destructive actions live in the drawer. The footer holds only
              what a teacher touches while the game is running. */}
          <Button
            size="sm"
            variant="ghost"
            icon={<Settings2 className="h-4 w-4" aria-hidden />}
            onClick={() => setSettingsOpen(true)}
          >
            Settings
          </Button>
        </div>
      </footer>

      {/* --------------------------------------------------------- drawer */}
      {settingsOpen ? (
        <div
          className="fixed inset-0 z-40 flex justify-end bg-[color:var(--scrim)]"
          role="dialog"
          aria-modal="true"
          aria-label="Game settings"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            className="flex h-full w-full max-w-md flex-col gap-6 overflow-auto border-l border-line bg-panel-2 p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4">
              <h2 className="title text-[30px]">Settings</h2>
              <Button size="sm" variant="ghost" onClick={() => setSettingsOpen(false)}>
                Close
              </Button>
            </div>

            <div className="space-y-3">
              <p className="eyebrow">Classroom</p>
              <Toggle
                label="Audience voting"
                hint="Eliminated students keep voting instead of watching."
                checked={Boolean(state?.session.audience_voting)}
                disabled={mutationBusy}
                onChange={(value) => void updateSettings({ audienceVoting: value })}
              />
              <Toggle
                label="Anonymous voting"
                hint="Hides authors' names until results, so friends are not an advantage."
                checked={Boolean(state?.session.anonymous_voting)}
                disabled={mutationBusy}
                onChange={(value) => void updateSettings({ anonymousVoting: value })}
              />
              <Toggle
                label="Reveal prompts after each round"
                hint="Shows the class what the best prompts actually said."
                checked={Boolean(state?.session.reveal_prompts)}
                disabled={mutationBusy}
                onChange={(value) => void updateSettings({ revealPrompts: value })}
              />
            </div>

            <div className="space-y-3">
              <p className="eyebrow">Scoring</p>
              <select
                id="scoringMode"
                value={scoringMode}
                disabled={mutationBusy}
                onChange={(event) =>
                  void updateScoring(
                    event.target.value as ScoringMode,
                    state?.session.vote_weight ?? 0.5
                  )
                }
                className="min-h-12 w-full border border-line bg-panel px-3 text-[15px] font-semibold text-ink"
              >
                <option value="voting_first">Voting first</option>
                <option value="voting_only">Voting only</option>
                <option value="ai_only">AI only</option>
                <option value="blended">Blended</option>
              </select>
              <label
                htmlFor="voteWeight"
                className="font-mono text-[12px] uppercase tracking-[0.16em] text-muted-2"
              >
                Blended vote weight
              </label>
              <input
                id="voteWeight"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={voteWeightDraft}
                disabled={mutationBusy || scoringMode !== "blended"}
                aria-valuetext={`${Math.round(voteWeightDraft * 100)}% vote weight`}
                onChange={(event) => setVoteWeightDraft(Number(event.target.value))}
                onPointerUp={(event) => void commitVoteWeight(Number(event.currentTarget.value))}
                onKeyUp={(event) => void commitVoteWeight(Number(event.currentTarget.value))}
                onBlur={(event) => void commitVoteWeight(Number(event.currentTarget.value))}
                className="w-full accent-[color:var(--fire)]"
              />
              <p className="text-[14px] text-muted">
                {titleForScoringMode(scoringMode)} · {Math.round(voteWeightDraft * 100)}% vote
                weight. Safe to change mid-game — it only affects the next recompute, so it is
                the way out if AI scoring stalls.
              </p>
            </div>

            <div className="space-y-3">
              <p className="eyebrow">Generation</p>
              <label
                htmlFor="lanes"
                className="font-mono text-[12px] uppercase tracking-[0.16em] text-muted-2"
              >
                Parallel lanes
              </label>
              <select
                id="lanes"
                value={generationConcurrency}
                disabled={mutationBusy}
                onChange={(event) => setGenerationConcurrency(Number(event.target.value))}
                className="min-h-12 w-full border border-line bg-panel px-3 text-[15px] font-semibold text-ink"
              >
                <option value={1}>1 · slowest, safest</option>
                <option value={2}>2</option>
                <option value={4}>4 · recommended</option>
                <option value={6}>6</option>
                <option value={8}>8 · may hit rate limits</option>
              </select>
              <p className="text-[14px] text-muted">
                4 lanes is the recommended balance. 8 may hit rate limits.
              </p>
            </div>

            <div className="space-y-3 border-t border-line pt-5">
              <p className="eyebrow">Game</p>
              <Button
                variant="ghost"
                className="w-full"
                icon={<Download className="h-4 w-4" aria-hidden />}
                loading={busy === "export"}
                disabled={mutationBusy || !currentRound}
                onClick={() => void exportResults()}
              >
                Export results
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                icon={<Crown className="h-4 w-4" aria-hidden />}
                disabled={mutationBusy || !currentRound || state?.session.status === "ended"}
                onClick={() => {
                  setSettingsOpen(false);
                  void post(`/api/games/${joinCode}/host/action`, { action: "end_game" });
                }}
              >
                End game now
              </Button>
              <Button
                variant="danger"
                className="w-full"
                icon={<RefreshCw className="h-4 w-4" aria-hidden />}
                disabled={mutationBusy}
                onClick={() => {
                  setSettingsOpen(false);
                  setConfirmation("renew");
                }}
              >
                Renew game
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                icon={<Home className="h-4 w-4" aria-hidden />}
                disabled={mutationBusy}
                onClick={() => {
                  setSettingsOpen(false);
                  setConfirmation("abandon");
                }}
              >
                Back to home
              </Button>
            </div>

            <div className="space-y-3">
              <p className="eyebrow">Next round</p>
              <TextArea
                id="nextInstruction"
                value={nextInstruction}
                onChange={(event) => setNextInstruction(event.target.value)}
                placeholder={
                  currentRound
                    ? roundConfig(currentRound.round_number)?.nextInstructionPlaceholder ?? ""
                    : "Start the game first."
                }
                maxLength={1000}
              />
              <p className="text-right font-mono text-[12px] text-muted-3">
                {nextInstruction.length}/1000
              </p>
              <Button
                className="w-full"
                icon={<ArrowRight className="h-4 w-4" aria-hidden />}
                loading={busy === `/api/games/${joinCode}/host/advance`}
                disabled={mutationBusy || !canAdvance}
                onClick={() => {
                  setSettingsOpen(false);
                  void openAdvanceConfirmation();
                }}
              >
                {currentRound && isFinalRound(currentRound.round_number)
                  ? "End game"
                  : "Advance round"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmationCopy ? (
        <ConfirmDialog
          title={confirmationCopy.title}
          body={confirmationCopy.body}
          confirmLabel={confirmationCopy.confirmLabel}
          loading={busy === confirmationBusyKey}
          detail={confirmation === "advance" ? advanceDetail : null}
          onExport={
            confirmation === "renew" || confirmation === "abandon"
              ? () => void exportResults()
              : undefined
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            if (confirmation === "renew") void renewGame();
            if (confirmation === "abandon") void abandonGame();
            if (confirmation === "advance") {
              setConfirmation(null);
              void advance();
            }
          }}
        />
      ) : null}
    </main>
  );
}

function HostSplash({
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
      <div className="w-full max-w-md border border-line bg-panel p-7 text-center" role="status" aria-live="polite">
        <h1 className="title text-[34px]">{title}</h1>
        <p className="mt-2 text-[16px] text-ink-soft">{body}</p>
        {children}
      </div>
    </main>
  );
}
