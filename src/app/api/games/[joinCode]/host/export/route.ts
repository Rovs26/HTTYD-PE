import { exportGameResults, hostAuthSchema } from "@/lib/game/service";
import { fail, ok, readJson } from "@/lib/http";

type RouteContext = {
  params: Promise<{ joinCode: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { joinCode } = await context.params;
    const input = hostAuthSchema.parse(await readJson(request));
    const results = await exportGameResults(joinCode, input);
    return ok(results, {
      headers: {
        "content-disposition": `attachment; filename="dragon-game-${joinCode}.json"`
      }
    });
  } catch (error) {
    return fail(error);
  }
}
