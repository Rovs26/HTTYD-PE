import { getGameState } from "@/lib/game/service";
import { fail, ok } from "@/lib/http";

type RouteContext = {
  params: Promise<{ joinCode: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { joinCode } = await context.params;
    const url = new URL(request.url);
    return ok(
      await getGameState(joinCode, {
        hostToken:
          request.headers.get("x-host-token") ?? url.searchParams.get("hostToken"),
        playerToken:
          request.headers.get("x-player-token") ?? url.searchParams.get("playerToken")
      }),
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return fail(error);
  }
}
