import { hostAuthSchema, renewGame } from "@/lib/game/service";
import { fail, ok, readJson } from "@/lib/http";

type RouteContext = {
  params: Promise<{ joinCode: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { joinCode } = await context.params;
    const input = hostAuthSchema.parse(await readJson(request));
    return ok(await renewGame(joinCode, input), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
