"use client";

import { PlusCircle, Swords } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { DragonMark } from "@/components/dragon-mark";
import { Button } from "@/components/ui/button";
import { Label, TextField } from "@/components/ui/field";
import { requestJson } from "@/lib/client/api";
import { hostTokenKey } from "@/lib/client/storage";
import type { GameSession } from "@/lib/types";

type CreateGameResponse = {
  session: GameSession;
  hostToken: string;
};

export function LandingClient() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGame(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await requestJson<CreateGameResponse>("/api/games", { pin });
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
    if (!joinCode.trim()) {
      setError("Enter a join code first.");
      return;
    }
    router.push(`/join/${joinCode.trim().toUpperCase()}`);
  }

  return (
    <main className="arena-grid min-h-screen px-5 py-8 sm:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col justify-center gap-8">
        <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-7">
            <div className="flex items-center gap-4">
              <DragonMark />
              <div>
                <p className="text-sm font-black uppercase text-cyan-200">Live AI image challenge</p>
                <h1 className="dragon-title max-w-3xl text-4xl font-black leading-[0.98] text-orange-50 sm:text-6xl lg:text-7xl">
                  How to Train Your Dragon: Prompt Engineering
                </h1>
              </div>
            </div>
            <p className="max-w-2xl text-lg font-semibold leading-relaxed text-orange-100/82 sm:text-xl">
              A Kahoot-style classroom arena where students write prompts, generate dragons,
              vote, and climb through three elimination rounds.
            </p>
            {error ? (
              <div className="rounded-md border border-red-300/40 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100">
                {error}
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <form onSubmit={createGame} className="panel rounded-lg p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">Create Host Game</h2>
                  <p className="text-sm font-semibold text-slate-300">Projector control room</p>
                </div>
                <PlusCircle className="h-8 w-8 text-amber-300" aria-hidden />
              </div>
              <div className="space-y-3">
                <Label htmlFor="pin">Host PIN</Label>
                <TextField
                  id="pin"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="Choose a host PIN"
                  minLength={4}
                  maxLength={32}
                  required
                />
                <Button className="w-full" loading={busy} type="submit">
                  Create Game
                </Button>
              </div>
            </form>

            <form onSubmit={joinGame} className="panel rounded-lg p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black">Join Game</h2>
                  <p className="text-sm font-semibold text-slate-300">Student phone entry</p>
                </div>
                <Swords className="h-8 w-8 text-cyan-300" aria-hidden />
              </div>
              <div className="space-y-3">
                <Label htmlFor="joinCode">Join code</Label>
                <TextField
                  id="joinCode"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={8}
                />
                <Button className="w-full" variant="secondary" type="submit">
                  Join
                </Button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
