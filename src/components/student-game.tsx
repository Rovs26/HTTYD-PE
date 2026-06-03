"use client";

import { CheckCircle2, Crown, Send, Swords, Vote } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { DragonMark } from "@/components/dragon-mark";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Label, TextArea } from "@/components/ui/field";
import { useGameState } from "@/hooks/use-game-state";
import { requestJson } from "@/lib/client/api";
import { playerTokenKey } from "@/lib/client/storage";
import { formatScore } from "@/lib/utils";

export function StudentGame({ joinCode }: { joinCode: string }) {
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setPlayerToken(window.localStorage.getItem(playerTokenKey(joinCode)));
  }, [joinCode]);

  const { state, loading, reload } = useGameState(joinCode, { playerToken });
  const currentRound = state?.currentRound ?? null;
  const currentPlayer = state?.currentPlayer ?? null;
  const currentSubmission = state?.submissions.find(
    (submission) => submission.round_id === currentRound?.id
  );
  const previousSubmissions = state?.submissions.filter(
    (submission) => submission.round_id !== currentRound?.id
  );
  const completedImages = useMemo(
    () =>
      state?.generatedImages.filter(
        (image) => image.round_id === currentRound?.id && image.generation_status === "complete"
      ) ?? [],
    [currentRound?.id, state?.generatedImages]
  );
  const currentVote = state?.votes.find((voteItem) => voteItem.voter_player_id === currentPlayer?.id);
  const myImage = completedImages.find((image) => image.player_id === currentPlayer?.id);
  const myRanking = state?.rankings.find((ranking) => ranking.player_id === currentPlayer?.id);
  const isActive = Boolean(currentPlayer && !currentPlayer.is_eliminated);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!playerToken) return;
    setBusy("submit");
    setError(null);
    setMessage(null);
    try {
      await requestJson(`/api/games/${joinCode}/submit`, { playerToken, prompt });
      setPrompt("");
      setMessage("Prompt locked. Watch the host screen for the reveal.");
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
      setMessage("Vote locked.");
      await reload();
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Could not vote");
    } finally {
      setBusy(null);
    }
  }

  if (!playerToken) {
    return (
      <main className="arena-grid flex min-h-screen items-center justify-center px-5 py-8">
        <div className="panel w-full max-w-md rounded-lg p-6 text-center">
          <DragonMark className="mx-auto mb-4 h-20 w-20" />
          <h1 className="text-3xl font-black">Join first</h1>
          <p className="mt-2 font-semibold text-slate-300">This phone is not registered for {joinCode} yet.</p>
          <Link
            href={`/join/${joinCode}`}
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-amber-300 px-4 py-2 text-sm font-black uppercase text-slate-950"
          >
            Join Game
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="arena-grid min-h-screen px-4 py-5">
      <div className="mx-auto grid max-w-4xl gap-5">
        <header className="panel-strong rounded-lg p-4">
          <div className="flex items-center gap-3">
            <DragonMark className="h-12 w-12" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-black uppercase text-cyan-200">Code {joinCode}</p>
              <h1 className="truncate text-2xl font-black">Dragon prompt arena</h1>
            </div>
            <StatusPill tone={currentRound?.voting_open ? "hot" : currentRound?.submission_open ? "cool" : "neutral"}>
              Round {state?.session.current_round || 0}
            </StatusPill>
          </div>
        </header>

        {(error || message) && (
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

        {loading ? (
          <div className="panel rounded-lg p-5 text-center font-bold text-slate-300">Loading...</div>
        ) : null}

        {!currentPlayer ? (
          <div className="panel rounded-lg p-5 text-center">
            <h2 className="text-2xl font-black">Session expired</h2>
            <p className="mt-2 font-semibold text-slate-300">Join again to reconnect your phone.</p>
            <Link
              href={`/join/${joinCode}`}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-amber-300 px-4 py-2 text-sm font-black uppercase text-slate-950"
            >
              Rejoin
            </Link>
          </div>
        ) : null}

        {currentPlayer ? (
          <>
            <section className="panel rounded-lg p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black uppercase text-amber-200">
                    {currentPlayer.name}
                  </p>
                  <h2 className="text-3xl font-black">{currentRound?.title ?? "Waiting for host"}</h2>
                </div>
                {currentPlayer.is_eliminated ? (
                  <StatusPill tone="hot">Spectating</StatusPill>
                ) : (
                  <StatusPill tone="cool">Active</StatusPill>
                )}
              </div>

              {currentRound?.challenge_image_url ? (
                <img
                  src={currentRound.challenge_image_url}
                  alt="Original dragon challenge"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-white/20 bg-slate-950/50 text-center">
                  <div className="px-6">
                    <Swords className="mx-auto mb-3 h-12 w-12 text-amber-300" />
                    <p className="text-xl font-black">Waiting for the host to start.</p>
                  </div>
                </div>
              )}

              {currentRound?.additional_instruction ? (
                <div className="mt-4 rounded-md border border-cyan-300/30 bg-cyan-500/15 p-4">
                  <p className="text-xs font-black uppercase text-cyan-100">New challenge</p>
                  <p className="mt-1 font-bold text-cyan-50">{currentRound.additional_instruction}</p>
                </div>
              ) : null}
            </section>

            {previousSubmissions?.length ? (
              <section className="panel rounded-lg p-5">
                <h2 className="mb-3 text-xl font-black">Your locked prompt chain</h2>
                <div className="grid gap-3">
                  {previousSubmissions.map((submission, index) => (
                    <div key={submission.id} className="rounded-md border border-white/10 bg-slate-950/45 p-3">
                      <p className="text-xs font-black uppercase text-amber-200">Round {index + 1}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-200">
                        {submission.follow_up_prompt ?? submission.initial_prompt}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="panel rounded-lg p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-2xl font-black">Prompt submission</h2>
                {currentSubmission ? (
                  <StatusPill tone="gold">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> Locked
                  </StatusPill>
                ) : null}
              </div>

              {!isActive ? (
                <p className="font-semibold text-slate-300">
                  You are cheering from the stands this round.
                </p>
              ) : currentSubmission ? (
                <div className="rounded-md border border-amber-300/30 bg-amber-300/10 p-4">
                  <p className="text-sm font-black uppercase text-amber-100">Submitted prompt</p>
                  <p className="mt-2 whitespace-pre-wrap font-semibold text-orange-50">
                    {currentSubmission.follow_up_prompt ?? currentSubmission.initial_prompt}
                  </p>
                </div>
              ) : currentRound?.submission_open ? (
                <form onSubmit={submit} className="space-y-3">
                  <Label htmlFor="prompt">
                    {currentRound.round_number === 1 ? "Write your dragon prompt" : "Add a follow-up instruction"}
                  </Label>
                  <TextArea
                    id="prompt"
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder={
                      currentRound.round_number === 1
                        ? "Describe the dragon, setting, light, mood, camera angle, texture, and style..."
                        : "Improve your earlier prompt with one strong new instruction..."
                    }
                    required
                    minLength={8}
                    maxLength={4000}
                  />
                  <Button loading={busy === "submit"} icon={<Send className="h-4 w-4" />} className="w-full" type="submit">
                    Submit and Lock
                  </Button>
                </form>
              ) : (
                <p className="font-semibold text-slate-300">Waiting for the host to open submissions.</p>
              )}
            </section>

            {myImage ? (
              <section className="panel rounded-lg p-5">
                <h2 className="mb-4 text-2xl font-black">Your generated dragon</h2>
                <img src={myImage.image_url ?? ""} alt="Your generated dragon" className="aspect-square w-full rounded-lg object-cover" />
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-md bg-white/5 p-3">
                    <p className="text-2xl font-black text-amber-200">
                      {formatScore(myImage.ai_similarity_score)}
                    </p>
                    <p className="text-xs font-black uppercase text-slate-300">AI score</p>
                  </div>
                  <div className="rounded-md bg-white/5 p-3">
                    <p className="text-2xl font-black text-cyan-200">
                      {myRanking?.rank
                        ? `#${myRanking.rank}`
                        : "wait"}
                    </p>
                    <p className="text-xs font-black uppercase text-slate-300">Rank</p>
                  </div>
                </div>
              </section>
            ) : null}

            {currentRound?.voting_open ? (
              <section className="panel rounded-lg p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="text-2xl font-black">Vote for the best dragon</h2>
                  <Vote className="h-6 w-6 text-cyan-300" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {completedImages
                    .filter((image) => image.player_id !== currentPlayer.id)
                    .map((image) => {
                      const player = state?.players.find((item) => item.id === image.player_id);
                      const selected = currentVote?.voted_for_player_id === image.player_id;
                      return (
                        <article key={image.id} className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/55">
                          <img src={image.image_url ?? ""} alt={player?.name ?? "Dragon"} className="aspect-square w-full object-cover" />
                          <div className="space-y-3 p-3">
                            <h3 className="truncate text-lg font-black">{player?.name ?? "Player"}</h3>
                            <Button
                              className="w-full"
                              variant={selected ? "secondary" : "primary"}
                              loading={busy === image.player_id}
                              disabled={Boolean(currentVote && !selected)}
                              onClick={() => void voteFor(image.player_id)}
                            >
                              {selected ? "Vote locked" : "Vote"}
                            </Button>
                          </div>
                        </article>
                      );
                    })}
                </div>
              </section>
            ) : (
              <section className="panel rounded-lg p-5 text-center">
                <Crown className="mx-auto mb-3 h-10 w-10 text-amber-300" />
                <p className="text-xl font-black">Watch the host screen for the reveal.</p>
              </section>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
