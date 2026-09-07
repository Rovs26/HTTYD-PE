import { advanceRound, advanceRoundSchema } from "@/lib/game/service";
import { fail, ok, readJson } from "@/lib/http";

// Image generation and vision scoring routinely exceed the platform default.
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{ joinCode: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { joinCode } = await context.params;
    const input = advanceRoundSchema.parse(await readJson(request));
    return ok(await advanceRound(joinCode, input));
  } catch (error) {
    return fail(error);
  }
}
