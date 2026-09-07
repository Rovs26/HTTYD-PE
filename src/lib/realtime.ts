import { after } from "next/server";
import { hasSupabaseServerConfig } from "@/lib/config";
import { log } from "@/lib/logger";

function realtimeRestUrl() {
  if (!process.env.SUPABASE_URL) {
    return null;
  }

  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/realtime/v1/api/broadcast`;
}

async function sendBroadcast(
  joinCode: string,
  event: string,
  payload: Record<string, unknown>
) {
  const url = realtimeRestUrl();
  if (!url || !hasSupabaseServerConfig()) {
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          {
            topic: `game:${joinCode}`,
            event,
            payload: {
              ...payload,
              at: new Date().toISOString()
            }
          }
        ]
      }),
      signal: AbortSignal.timeout(3_000)
    });

    if (!response.ok) {
      log.warn("Realtime broadcast failed", { status: response.status, joinCode, event });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.name : "UnknownError";
    log.warn("Realtime broadcast failed", { reason, joinCode, event });
  }
}

/**
 * Notifies every client in the room. Deliberately does not block the response: awaiting a
 * 3-second-timeout fetch inside the request path added up to 3s to every student submit and
 * vote. `after` runs it once the response has been sent; outside a request scope (unit tests,
 * scripts) it falls back to a detached promise.
 */
export async function broadcastGameUpdate(
  joinCode: string,
  event: string,
  payload: Record<string, unknown> = {}
) {
  try {
    after(() => sendBroadcast(joinCode, event, payload));
  } catch {
    void sendBroadcast(joinCode, event, payload);
  }
}
