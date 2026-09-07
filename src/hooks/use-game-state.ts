"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import type { GameState } from "@/lib/types";

type Auth = {
  hostToken?: string | null;
  playerToken?: string | null;
};

const POLL_INTERVAL_MS = 10_000;
// Every broadcast used to trigger an immediate refetch from every connected client. With
// thirty phones in a room, one student submitting produced thirty full state reads. Events
// arriving inside this window collapse into a single refetch.
const BROADCAST_COALESCE_MS = 600;

export function useGameState(joinCode: string, auth: Auth, enabled = true) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [removed, setRemoved] = useState(false);

  const inFlight = useRef(false);
  const refetchQueued = useRef(false);
  const disposed = useRef(false);
  const coalesceTimer = useRef<number | null>(null);

  const headers = useMemo(() => {
    const nextHeaders: Record<string, string> = {};
    if (auth.hostToken) nextHeaders["x-host-token"] = auth.hostToken;
    if (auth.playerToken) nextHeaders["x-player-token"] = auth.playerToken;
    return nextHeaders;
  }, [auth.hostToken, auth.playerToken]);

  const load = useCallback(async () => {
    if (!enabled || removed || disposed.current) {
      return;
    }

    // Never abort a request that is already on its way. The previous implementation aborted
    // on every call, so a burst of events could starve a client of any completed response and
    // leave mutations resolving against stale state. Coalesce instead: note that another
    // refresh is wanted and run it once when this one lands.
    if (inFlight.current) {
      refetchQueued.current = true;
      return;
    }

    inFlight.current = true;
    try {
      const response = await fetch(`/api/games/${joinCode}`, {
        cache: "no-store",
        headers
      });
      const data = await response.json().catch(() => ({}));
      if (disposed.current) {
        return;
      }
      if (response.status === 404) {
        setState(null);
        setError("This game was removed or renewed. Use the newest host tab or create a new game.");
        setRemoved(true);
        return;
      }
      if (!response.ok) {
        throw new Error(data.error ?? "Could not load game");
      }
      setState(data);
      setError(null);
    } catch (loadError) {
      if (disposed.current) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Could not load game");
    } finally {
      inFlight.current = false;
      if (!disposed.current) {
        setLoading(false);
      }
      if (refetchQueued.current && !disposed.current) {
        refetchQueued.current = false;
        // Call through the ref rather than recursing, so this stays memoizable.
        void loadRef.current?.();
      }
    }
  }, [enabled, headers, joinCode, removed]);

  const loadRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  const reload = useCallback(async () => {
    if (removed) {
      setRemoved(false);
      setLoading(true);
      return;
    }
    await load();
  }, [load, removed]);

  useEffect(() => {
    setState(null);
    setError(null);
    setLoading(enabled);
    setRemoved(false);
  }, [auth.hostToken, auth.playerToken, enabled, joinCode]);

  useEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
    };
  }, [auth.hostToken, auth.playerToken, enabled, joinCode]);

  useEffect(() => {
    if (!enabled || removed) {
      return;
    }

    void load();
    const interval = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, load, removed]);

  // A phone that was locked or backgrounded comes back to whatever was on screen when it
  // slept. Refetch the moment it is visible again, or the network returns.
  useEffect(() => {
    if (!enabled || removed) {
      return;
    }

    const resume = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [enabled, load, removed]);

  useEffect(() => {
    if (!enabled || removed) {
      return;
    }

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      // Realtime is not configured; the interval poll above is the only sync path.
      return;
    }

    const channel = supabase
      .channel(`game:${joinCode.toUpperCase()}`)
      .on("broadcast", { event: "*" }, () => {
        if (coalesceTimer.current !== null) {
          return;
        }
        coalesceTimer.current = window.setTimeout(() => {
          coalesceTimer.current = null;
          void load();
        }, BROADCAST_COALESCE_MS);
      })
      .subscribe();

    return () => {
      if (coalesceTimer.current !== null) {
        window.clearTimeout(coalesceTimer.current);
        coalesceTimer.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, joinCode, load, removed]);

  return { state, error, loading, reload };
}
