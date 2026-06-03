import { createGame, createGameSchema } from "@/lib/game/service";
import { fail, ok, readJson } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const input = createGameSchema.parse(await readJson(request));
    return ok(await createGame(input), { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
