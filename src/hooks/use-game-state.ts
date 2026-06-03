"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { GameState } from "@/lib/types";

type Auth = {
  hostToken?: string | null;
  playerToken?: string | null;
};

export function useGameState(joinCode: string, auth: Auth) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (auth.hostToken) params.set("hostToken", auth.hostToken);
    if (auth.playerToken) params.set("playerToken", auth.playerToken);
    return params.toString();
  }, [auth.hostToken, auth.playerToken]);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/games/${joinCode}${query ? `?${query}` : ""}`, {
        cache: "no-store"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Could not load game");
      }
      setState(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load game");
    } finally {
      setLoading(false);
    }
  }, [joinCode, query]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`game:${joinCode.toUpperCase()}`)
      .on("broadcast", { event: "*" }, () => void load())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [joinCode, load]);

  return { state, error, loading, reload: load };
}
