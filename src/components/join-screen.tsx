"use client";

import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { DragonMark } from "@/components/dragon-mark";
import { Button } from "@/components/ui/button";
import { Label, TextField } from "@/components/ui/field";
import { requestJson } from "@/lib/client/api";
import { playerNameKey, playerTokenKey } from "@/lib/client/storage";
import type { Player } from "@/lib/types";

type JoinResponse = {
  player: Player;
  playerToken: string;
};

export function JoinScreen({ joinCode }: { joinCode: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existingName = window.localStorage.getItem(playerNameKey(joinCode));
    if (existingName) setName(existingName);
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
    <main className="arena-grid flex min-h-screen items-center justify-center px-5 py-8">
      <form onSubmit={join} className="panel w-full max-w-md rounded-lg p-6">
        <div className="mb-7 text-center">
          <DragonMark className="mx-auto mb-4 h-20 w-20" />
          <p className="font-mono text-sm font-black text-cyan-200">Game code {joinCode}</p>
          <h1 className="mt-1 text-4xl font-black">Enter the arena</h1>
        </div>
        <div className="space-y-3">
          <Label htmlFor="studentName">Name or username</Label>
          <TextField
            id="studentName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Astrid, Hiccup, Toothless..."
            maxLength={80}
            required
          />
          {error ? <p className="text-sm font-semibold text-red-200">{error}</p> : null}
          <Button className="w-full" loading={busy} icon={<LogIn className="h-4 w-4" />} type="submit">
            Join Game
          </Button>
        </div>
      </form>
    </main>
  );
}
