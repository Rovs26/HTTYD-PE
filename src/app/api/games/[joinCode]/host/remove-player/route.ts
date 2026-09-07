import { removePlayer, playerIdSchema } from "@/lib/game/service";
import { fail, ok, readJson } from "@/lib/http";

type RouteContext = {
  params: Promise<{ joinCode: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { joinCode } = await context.params;
    const input = playerIdSchema.parse(await readJson(request));
    return ok(await removePlayer(joinCode, input));
  } catch (error) {
    return fail(error);
  }
}
