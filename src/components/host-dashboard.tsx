"use client";

import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowRight,
  Crown,
  Home,
  ImageIcon,
  Lock,
  Play,
  PlusCircle,
  RefreshCw,
  Sparkles,
  Trophy,
  Unlock,
  Users,
  Vote
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DragonMark } from "@/components/dragon-mark";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Label, TextArea, TextField } from "@/components/ui/field";
import { useGameState } from "@/hooks/use-game-state";
import { requestJson } from "@/lib/client/api";
import { hostTokenKey } from "@/lib/client/storage";
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
  cleanup: {
    removedStorageObjectCount: number;
  };
};

type AbandonGameResponse = {
  ok: boolean;
  cleanup: {
    deletedGameCount: number;
    removedStorageObjectCount: number;
  };
};

type ConfirmationAction = "renew" | "abandon";

export function HostDashboard({ joinCode }: { joinCode: string }) {
  const router = useRouter();
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [nextInstruction, setNextInstruction] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationAction | null>(null);

  useEffect(() => {
    setHostToken(window.localStorage.getItem(hostTokenKey(joinCode)));
    setOrigin(window.location.origin);
  }, [joinCode]);

  const { state, loading, reload } = useGameState(joinCode, { hostToken });
  const joinUrl = origin ? `${origin}/join/${joinCode}` : "";

  useEffect(() => {
    if (!joinUrl) return;
    void QRCode.toDataURL(joinUrl, { margin: 1, width: 280 }).then(setQrCode);
  }, [joinUrl]);

  const currentRound = state?.currentRound ?? null;
  const currentSubmissions = useMemo(
    () => state?.submissions.filter((submission) => submission.round_id === currentRound?.id) ?? [],
    [currentRound?.id, state?.submissions]
  );
  const currentImages = useMemo(
    () =>
      state?.generatedImages.filter((image) => image.round_id === currentRound?.id) ?? [],
    [currentRound?.id, state?.generatedImages]
  );
  const currentVotes = useMemo(
    () => state?.votes.filter((vote) => vote.round_id === currentRound?.id) ?? [],
    [currentRound?.id, state?.votes]
  );
  const currentRankings = useMemo(
    () => state?.rankings.filter((ranking) => ranking.round_id === currentRound?.id) ?? [],
    [currentRound?.id, state?.rankings]
  );
  const activePlayers = state?.players.filter((player) => !player.is_eliminated) ?? [];
  const completedImages = currentImages.filter((image) => image.generation_status === "complete");
  const scoredImages = completedImages.filter((image) => image.ai_similarity_score !== null);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy("unlock");
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
      setBusy(null);
    }
  }

  async function post(path: string, body: Record<string, unknown> = {}) {
    if (!hostToken) return;
    setBusy(path);
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
      setBusy(null);
    }
  }

  async function runBatch(kind: "generate" | "score") {
    if (!hostToken) return;
    setBusy(kind);
    setError(null);
    setMessage(kind === "generate" ? "Generating dragon images..." : "Scoring images...");
    try {
      for (let count = 0; count < 40; count += 1) {
        const result = await requestJson<{
          processed: boolean;
          failed?: boolean;
          error?: string;
        }>(`/api/games/${joinCode}/host/${kind === "generate" ? "generate-next" : "score-next"}`, {
          hostToken
        });
        await reload();
        if (result.failed) {
          throw new Error(result.error ?? "One job failed and can be retried.");
        }
        if (!result.processed) {
          setMessage(kind === "generate" ? "Image generation complete." : "AI scoring complete.");
          return;
        }
      }
      setMessage("Batch paused after 40 jobs. Press the button again to continue.");
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "Batch failed");
    } finally {
      setBusy(null);
    }
  }

  async function updateScoring(scoringMode: ScoringMode, voteWeight: number) {
    await post(`/api/games/${joinCode}/host/scoring`, { scoringMode, voteWeight });
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
    setBusy(path);
    setError(null);
    setMessage(null);
    try {
      const data = await requestJson<NewGameResponse>(path, { hostToken });
      window.localStorage.setItem(hostTokenKey(data.session.join_code), data.hostToken);
      router.push(`/host/${data.session.join_code}`);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Could not create new game");
    } finally {
      setBusy(null);
    }
  }

  async function renewGame() {
    if (!hostToken) return;
    const path = `/api/games/${joinCode}/host/renew`;
    setBusy(path);
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
      setBusy(null);
    }
  }

  async function abandonGame() {
    if (!hostToken) return;
    const path = `/api/games/${joinCode}/host/abandon`;
    setBusy(path);
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
      setBusy(null);
    }
  }

  const confirmationCopy =
    confirmation === "renew"
      ? {
          title: "Renew game?",
          body: "This deletes the current game, players, prompts, votes, rankings, and stored images, then creates a fresh join code.",
          confirmLabel: "Renew Game",
          busyKey: `/api/games/${joinCode}/host/renew`,
          onConfirm: renewGame
        }
      : confirmation === "abandon"
        ? {
            title: "Back to home?",
            body: "This completely abandons the current game, deletes its data and stored images, and returns to the home screen.",
            confirmLabel: "Back to Home",
            busyKey: `/api/games/${joinCode}/host/abandon`,
            onConfirm: abandonGame
          }
        : null;

  if (!hostToken) {
    return (
      <main className="arena-grid flex min-h-screen items-center justify-center px-5 py-8">
        <form onSubmit={unlock} className="panel w-full max-w-md rounded-lg p-6">
          <div className="mb-6 flex items-center gap-4">
            <DragonMark className="h-12 w-12" />
            <div>
              <p className="font-mono text-sm font-black text-cyan-200">{joinCode}</p>
              <h1 className="text-3xl font-black">Host unlock</h1>
            </div>
          </div>
          <div className="space-y-3">
            <Label htmlFor="hostPin">Host PIN</Label>
            <TextField
              id="hostPin"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              placeholder="Enter PIN"
              required
            />
            {error ? <p className="text-sm font-semibold text-red-200">{error}</p> : null}
            <Button className="w-full" loading={busy === "unlock"} type="submit">
              Unlock Dashboard
            </Button>
          </div>
        </form>
      </main>
    );
  }

  return (
    <main className="arena-grid min-h-screen px-4 py-5 sm:px-6">
      <div className="mx-auto grid max-w-[1800px] gap-5">
        <header className="panel-strong rounded-lg p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <DragonMark />
              <div>
                <p className="text-sm font-black uppercase text-cyan-200">Host dashboard</p>
                <h1 className="text-3xl font-black leading-tight sm:text-5xl">
                  How to Train Your Dragon: Prompt Engineering
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                icon={<Home className="h-4 w-4" />}
                variant="ghost"
                onClick={() => setConfirmation("abandon")}
              >
                Back to Home
              </Button>
              <StatusPill tone="gold">Code {joinCode}</StatusPill>
              <StatusPill tone={state?.session.status === "active" ? "cool" : "neutral"}>
                {state?.session.status ?? "loading"}
              </StatusPill>
              <StatusPill tone={currentRound?.submission_open ? "cool" : "neutral"}>
                {currentRound?.submission_open ? "Submissions open" : "Submissions closed"}
              </StatusPill>
              <StatusPill tone={currentRound?.voting_open ? "hot" : "neutral"}>
                {currentRound?.voting_open ? "Voting open" : "Voting closed"}
              </StatusPill>
            </div>
          </div>
        </header>

        {(message || error) && (
          <div
            className={`rounded-md border px-4 py-3 text-sm font-bold ${
              error
                ? "border-red-300/40 bg-red-500/15 text-red-100"
                : "border-cyan-300/40 bg-cyan-500/15 text-cyan-100"
            }`}
          >
            {error ?? message}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <aside className="grid content-start gap-5">
            <div className="panel rounded-lg p-5">
              <h2 className="mb-4 text-xl font-black">Join Portal</h2>
              <div className="rounded-lg bg-white p-3">
                {qrCode ? (
                  <img src={qrCode} alt={`QR code for ${joinUrl}`} className="mx-auto h-auto w-full" />
                ) : (
                  <div className="aspect-square animate-pulse rounded-md bg-slate-200" />
                )}
              </div>
              <p className="mt-3 break-all font-mono text-sm font-bold text-cyan-100">{joinUrl}</p>
            </div>

            <div className="panel rounded-lg p-5">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-black">
                <Users className="h-5 w-5 text-cyan-300" /> Players
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Joined" value={state?.players.length ?? 0} />
                <Metric label="Active" value={activePlayers.length} />
                <Metric label="Locked" value={currentSubmissions.length} />
              </div>
              <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
                {(state?.players ?? []).map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <span className="truncate font-bold">{player.name}</span>
                    <span className="text-xs font-black uppercase text-slate-300">
                      {player.is_eliminated ? "out" : player.current_rank ? `#${player.current_rank}` : "in"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          <div className="grid gap-5">
            <section className="grid gap-5 lg:grid-cols-[1fr_420px]">
              <div className="panel rounded-lg p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-black text-amber-200">
                      Round {state?.session.current_round || 0}
                    </p>
                    <h2 className="text-3xl font-black">{currentRound?.title ?? "Lobby"}</h2>
                  </div>
                  <Button
                    icon={<RefreshCw className="h-4 w-4" />}
                    variant="ghost"
                    onClick={() => void reload()}
                  >
                    Refresh
                  </Button>
                </div>

                {currentRound?.challenge_image_url ? (
                  <img
                    src={currentRound.challenge_image_url}
                    alt="Original dragon challenge"
                    className="aspect-square w-full max-h-[640px] rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex aspect-square max-h-[640px] items-center justify-center rounded-lg border border-dashed border-white/20 bg-slate-950/50 text-center">
                    <div className="max-w-sm px-6">
                      <ImageIcon className="mx-auto mb-3 h-12 w-12 text-amber-300" />
                      <p className="text-xl font-black">Challenge image appears after Start Game.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="panel rounded-lg p-5">
                <h2 className="mb-4 text-xl font-black">Controls</h2>
                <div className="grid gap-3">
                  <Button
                    icon={<Play className="h-4 w-4" />}
                    loading={busy === `/api/games/${joinCode}/host/start`}
                    disabled={Boolean(currentRound)}
                    onClick={() => void post(`/api/games/${joinCode}/host/start`)}
                  >
                    Start Game
                  </Button>
                  <Button
                    icon={<RefreshCw className="h-4 w-4" />}
                    variant="danger"
                    loading={busy === `/api/games/${joinCode}/host/renew`}
                    onClick={() => setConfirmation("renew")}
                  >
                    Renew Game
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      icon={<Unlock className="h-4 w-4" />}
                      disabled={!currentRound}
                      onClick={() =>
                        void post(`/api/games/${joinCode}/host/action`, {
                          action: "open_submissions"
                        })
                      }
                    >
                      Open
                    </Button>
                    <Button
                      variant="ghost"
                      icon={<Lock className="h-4 w-4" />}
                      disabled={!currentRound}
                      onClick={() =>
                        void post(`/api/games/${joinCode}/host/action`, {
                          action: "close_submissions"
                        })
                      }
                    >
                      Close
                    </Button>
                  </div>
                  <Button
                    icon={<Sparkles className="h-4 w-4" />}
                    loading={busy === "generate"}
                    disabled={!currentRound || currentSubmissions.length === 0}
                    onClick={() => void runBatch("generate")}
                  >
                    Generate Images
                  </Button>
                  <Button
                    variant="secondary"
                    icon={<Vote className="h-4 w-4" />}
                    disabled={completedImages.length === 0}
                    onClick={() =>
                      void post(`/api/games/${joinCode}/host/action`, { action: "open_voting" })
                    }
                  >
                    Open Voting
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={!currentRound}
                    onClick={() =>
                      void post(`/api/games/${joinCode}/host/action`, { action: "close_voting" })
                    }
                  >
                    Close Voting
                  </Button>
                  <Button
                    icon={<Sparkles className="h-4 w-4" />}
                    variant="ghost"
                    loading={busy === "score"}
                    disabled={completedImages.length === 0}
                    onClick={() => void runBatch("score")}
                  >
                    AI Score Images
                  </Button>
                  <Button
                    icon={<Trophy className="h-4 w-4" />}
                    variant="ghost"
                    disabled={!currentRound}
                    onClick={() => void post(`/api/games/${joinCode}/host/rankings`)}
                  >
                    Recompute Rankings
                  </Button>
                </div>

                <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
                  <Label htmlFor="scoringMode">Ranking mode</Label>
                  <select
                    id="scoringMode"
                    value={state?.session.scoring_mode ?? "voting_first"}
                    onChange={(event) =>
                      void updateScoring(
                        event.target.value as ScoringMode,
                        state?.session.vote_weight ?? 0.5
                      )
                    }
                    className="min-h-11 w-full rounded-md border border-white/15 bg-slate-950/70 px-3 font-bold text-orange-50"
                  >
                    <option value="voting_first">Voting first</option>
                    <option value="voting_only">Voting only</option>
                    <option value="ai_only">AI only</option>
                    <option value="blended">Blended</option>
                  </select>
                  <Label htmlFor="voteWeight">Blended vote weight</Label>
                  <input
                    id="voteWeight"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={state?.session.vote_weight ?? 0.5}
                    onChange={(event) =>
                      void updateScoring(
                        state?.session.scoring_mode ?? "voting_first",
                        Number(event.target.value)
                      )
                    }
                    className="w-full accent-amber-300"
                  />
                  <p className="text-sm font-semibold text-slate-300">
                    {titleForScoringMode(state?.session.scoring_mode ?? "voting_first")} ·{" "}
                    {Math.round((state?.session.vote_weight ?? 0.5) * 100)}% vote weight
                  </p>
                </div>

                <div className="mt-5 space-y-3 border-t border-white/10 pt-5">
                  <Label htmlFor="nextInstruction">Next challenge instruction</Label>
                  <TextArea
                    id="nextInstruction"
                    value={nextInstruction}
                    onChange={(event) => setNextInstruction(event.target.value)}
                    placeholder="Make the dragon more cinematic, add glowing eyes, place it in a misty cove..."
                  />
                  <Button
                    icon={<ArrowRight className="h-4 w-4" />}
                    disabled={!currentRound}
                    onClick={() => void advance()}
                    className="w-full"
                  >
                    {currentRound?.round_number === 3 ? "End Game" : "Advance Round"}
                  </Button>
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-3">
              <MetricPanel title="Generated" value={`${completedImages.length}/${currentSubmissions.length}`} />
              <MetricPanel title="Votes" value={currentVotes.length} />
              <MetricPanel title="AI scored" value={`${scoredImages.length}/${completedImages.length}`} />
            </section>

            <section className="panel rounded-lg p-5">
              <h2 className="mb-4 text-2xl font-black">Results Arena</h2>
              {loading ? <p className="font-semibold text-slate-300">Loading game...</p> : null}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {completedImages.map((image) => {
                  const player = state?.players.find((item) => item.id === image.player_id);
                  const ranking = currentRankings.find(
                    (item) => item.player_id === image.player_id
                  );
                  const votes = currentVotes.filter(
                    (voteItem) => voteItem.voted_for_player_id === image.player_id
                  ).length;

                  return (
                    <article
                      key={image.id}
                      className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/55"
                    >
                      {image.image_url ? (
                        <img src={image.image_url} alt={player?.name ?? "Generated dragon"} className="aspect-square w-full object-cover" />
                      ) : null}
                      <div className="space-y-2 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="truncate text-lg font-black">{player?.name ?? "Player"}</h3>
                          {ranking ? <StatusPill tone="gold">#{ranking.rank}</StatusPill> : null}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <MiniStat label="Votes" value={votes} />
                          <MiniStat label="AI" value={formatScore(image.ai_similarity_score)} />
                          <MiniStat label="Total" value={ranking?.total_score.toFixed(0) ?? "wait"} />
                        </div>
                        {image.ai_similarity_rationale ? (
                          <p className="line-clamp-3 text-xs font-semibold text-slate-300">
                            {image.ai_similarity_rationale}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            {state?.session.status === "ended" && currentRankings.length ? (
              <section className="panel-strong rounded-lg p-5">
                <h2 className="mb-4 flex items-center gap-2 text-3xl font-black">
                  <Crown className="h-8 w-8 text-amber-300" /> Final Winners
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {["Champion", "1st runner up", "2nd runner up", "3rd runner up"].map(
                    (label, index) => {
                      const ranking = currentRankings[index];
                      const player = state.players.find((item) => item.id === ranking?.player_id);
                      const image = currentImages.find(
                        (item) =>
                          item.round_id === currentRound?.id &&
                          item.player_id === ranking?.player_id &&
                          item.image_url
                      );
                      return (
                        <div
                          key={label}
                          className="overflow-hidden rounded-lg border border-amber-300/25 bg-amber-300/10"
                        >
                          {image?.image_url ? (
                            <img
                              src={image.image_url}
                              alt={player?.name ?? label}
                              className="aspect-square w-full object-cover"
                            />
                          ) : null}
                          <div className="p-4">
                            <p className="text-xs font-black uppercase text-amber-200">{label}</p>
                            <p className="mt-1 text-2xl font-black">{player?.name ?? "TBD"}</p>
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
                <div className="mt-5 flex justify-end border-t border-amber-300/20 pt-5">
                  <Button
                    icon={<PlusCircle className="h-4 w-4" />}
                    variant="secondary"
                    loading={busy === `/api/games/${joinCode}/host/new-game`}
                    onClick={() => void archiveAndStartNewGame()}
                  >
                    Archive & New Game
                  </Button>
                </div>
              </section>
            ) : null}
          </div>
        </section>
      </div>
      {confirmationCopy ? (
        <ConfirmDialog
          title={confirmationCopy.title}
          body={confirmationCopy.body}
          confirmLabel={confirmationCopy.confirmLabel}
          loading={busy === confirmationCopy.busyKey}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void confirmationCopy.onConfirm()}
        />
      ) : null}
    </main>
  );
}

function ConfirmDialog({
  title,
  body,
  confirmLabel,
  loading,
  onCancel,
  onConfirm
}: {
  title: string;
  body: string;
  confirmLabel: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div className="panel-strong w-full max-w-md rounded-lg p-5 shadow-2xl shadow-slate-950/50">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-md bg-red-500/20 text-red-100">
            <AlertTriangle className="h-6 w-6" aria-hidden />
          </div>
          <h2 id="confirm-title" className="text-2xl font-black">
            {title}
          </h2>
        </div>
        <p className="text-sm font-semibold leading-relaxed text-slate-200">{body}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-white/10 bg-slate-950/45 px-2 py-3 text-center">
      <p className="text-2xl font-black text-amber-200">{value}</p>
      <p className="text-xs font-black uppercase text-slate-300">{label}</p>
    </div>
  );
}

function MetricPanel({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="panel rounded-lg p-5">
      <p className="text-sm font-black uppercase text-cyan-200">{title}</p>
      <p className="mt-1 text-4xl font-black">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-white/5 px-2 py-2">
      <p className="text-sm font-black text-orange-50">{value}</p>
      <p className="text-[10px] font-black uppercase text-slate-400">{label}</p>
    </div>
  );
}
