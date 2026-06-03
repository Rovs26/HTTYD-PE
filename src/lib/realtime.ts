import { hasSupabaseServerConfig } from "@/lib/config";

function realtimeRestUrl() {
  if (!process.env.SUPABASE_URL) {
    return null;
  }

  return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/realtime/v1/api/broadcast`;
}

export async function broadcastGameUpdate(
  joinCode: string,
  event: string,
  payload: Record<string, unknown> = {}
) {
  const url = realtimeRestUrl();
  if (!url || !hasSupabaseServerConfig()) {
    return;
  }

  try {
    await fetch(url, {
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
      })
    });
  } catch (error) {
    console.warn("Realtime broadcast failed", error);
  }
}
