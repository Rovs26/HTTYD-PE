"use client";

import { useCallback, useEffect, useState } from "react";
import { requestJson } from "@/lib/client/api";
import { hostTokenKey } from "@/lib/client/storage";

/**
 * The host's session lives in this browser's localStorage. This owns reading it, unlocking
 * with the PIN, and dropping it when the server stops recognising it — which is how a host
 * whose token was rotated by someone else re-entering the PIN gets told to unlock again.
 */
export function useHostAuth(joinCode: string) {
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    setHostToken(window.localStorage.getItem(hostTokenKey(joinCode)));
    setAuthReady(true);
  }, [joinCode]);

  const unlock = useCallback(
    async (pin: string) => {
      const data = await requestJson<{ hostToken: string }>(
        `/api/games/${joinCode}/host/verify`,
        { pin }
      );
      window.localStorage.setItem(hostTokenKey(joinCode), data.hostToken);
      setHostToken(data.hostToken);
      return data.hostToken;
    },
    [joinCode]
  );

  const forget = useCallback(() => {
    window.localStorage.removeItem(hostTokenKey(joinCode));
    setHostToken(null);
  }, [joinCode]);

  /** Store a token for a different game, used when renewing or archiving into a new one. */
  const adoptGame = useCallback((nextJoinCode: string, token: string) => {
    window.localStorage.setItem(hostTokenKey(nextJoinCode), token);
  }, []);

  return { hostToken, authReady, unlock, forget, adoptGame };
}
