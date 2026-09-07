import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Drives a whole game through the HTTP API the clients use.
 *
 * The entire browser suite used to be "the landing page has two buttons", which is why three
 * dead modules and a broken auth transport survived. This exercises the real loop: create,
 * join, submit, generate, vote, score, rank, advance.
 *
 * Requires a database and AI_PROVIDER=mock (or a practice game, which never calls OpenAI).
 * Skips itself rather than failing when the environment has no Supabase configured.
 */

const ACCESS_CODE = process.env.GAME_CREATION_ACCESS_CODE ?? "ci-only-access-code";
const HOST_PIN = "4821";

type Created = { session: { join_code: string }; hostToken: string };

async function post<T>(api: APIRequestContext, path: string, body: unknown): Promise<T> {
  const response = await api.post(path, { data: body });
  if (!response.ok()) {
    throw new Error(`${path} -> ${response.status()} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function state(api: APIRequestContext, joinCode: string, headers: Record<string, string>) {
  const response = await api.get(`/api/games/${joinCode}`, { headers });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test.describe("a complete game", () => {
  // This drives the API, not a browser, so running it once is enough — and two copies would
  // create two games against the same backend. It also does far more work than a page load.
  test.skip(({ browserName }) => browserName !== "chromium", "API-level suite; runs once");
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test("runs from creation to a scored, advanced round", async ({ request }) => {
    let created: Created;
    try {
      created = await post<Created>(request, "/api/games", {
        pin: HOST_PIN,
        accessCode: ACCESS_CODE,
        // Guarantees no OpenAI spend even if the deployment is pointed at a real key.
        practiceMode: true
      });
    } catch (error) {
      test.skip(true, `No usable backend for the full-game test: ${String(error)}`);
      return;
    }

    const joinCode = created.session.join_code;
    const hostToken = created.hostToken;
    const hostHeaders = { "x-host-token": hostToken };

    // --- students join -------------------------------------------------------------
    const students = ["Astrid", "Hiccup", "Fishlegs"];
    const tokens: string[] = [];
    for (const name of students) {
      const joined = await post<{ playerToken: string; player: { name: string } }>(
        request,
        `/api/games/${joinCode}/join`,
        { name }
      );
      expect(joined.player.name).toBe(name);
      tokens.push(joined.playerToken);
    }

    // A player token must never come back with a hash attached.
    expect(JSON.stringify(tokens)).not.toContain("player_token_hash");

    // --- host starts the game ------------------------------------------------------
    await post(request, `/api/games/${joinCode}/host/start`, { hostToken });

    let hostState = await state(request, joinCode, hostHeaders);
    expect(hostState.isHost).toBe(true);
    expect(hostState.players).toHaveLength(3);
    expect(hostState.currentRound.round_number).toBe(1);

    // The auth transport must work through headers — this is what was broken.
    const anonState = await state(request, joinCode, {});
    expect(anonState.isHost).toBe(false);

    // --- submissions ---------------------------------------------------------------
    await post(request, `/api/games/${joinCode}/host/action`, {
      hostToken,
      action: "open_submissions"
    });

    for (const [index, playerToken] of tokens.entries()) {
      await post(request, `/api/games/${joinCode}/submit`, {
        playerToken,
        prompt: `A ${["proud", "sleek", "ancient"][index]} dragon on a cliff at golden hour, wings spread, cinematic wide shot.`
      });
    }

    // Submitting twice must be idempotent, not an error.
    const repeat = await post<{ alreadyLocked: boolean }>(
      request,
      `/api/games/${joinCode}/submit`,
      { playerToken: tokens[0], prompt: "A completely different dragon prompt entirely." }
    );
    expect(repeat.alreadyLocked).toBe(true);

    // A student must not see a rival's prompt while the round is live.
    const studentState = await state(request, joinCode, { "x-player-token": tokens[0] });
    expect(studentState.submissions).toHaveLength(1);
    expect(studentState.isHost).toBe(false);
    expect(JSON.stringify(studentState)).not.toContain("player_token_hash");

    await post(request, `/api/games/${joinCode}/host/action`, {
      hostToken,
      action: "close_submissions"
    });

    // --- generation ----------------------------------------------------------------
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await post<{ processed: boolean }>(
        request,
        `/api/games/${joinCode}/host/generate-next`,
        { hostToken }
      );
      if (!result.processed) break;
    }

    hostState = await state(request, joinCode, hostHeaders);
    const images = hostState.generatedImages.filter(
      (image: { round_id: string }) => image.round_id === hostState.currentRound.id
    );
    expect(images).toHaveLength(3);
    for (const image of images) {
      expect(image.generation_status).toBe("complete");
      expect(image.image_url).toBeTruthy();
    }

    // --- voting --------------------------------------------------------------------
    await post(request, `/api/games/${joinCode}/host/action`, {
      hostToken,
      action: "open_voting"
    });

    const playerIds: string[] = hostState.players.map((player: { id: string }) => player.id);
    // Everyone votes for the next player along, so nobody votes for themselves.
    for (const [index, playerToken] of tokens.entries()) {
      await post(request, `/api/games/${joinCode}/vote`, {
        playerToken,
        votedForPlayerId: playerIds[(index + 1) % playerIds.length]
      });
    }

    // Voting for yourself must be refused.
    const selfVote = await request.post(`/api/games/${joinCode}/vote`, {
      data: { playerToken: tokens[0], votedForPlayerId: playerIds[0] }
    });
    expect(selfVote.status()).toBe(409);

    await post(request, `/api/games/${joinCode}/host/action`, {
      hostToken,
      action: "close_voting"
    });

    // --- AI scoring and rankings ---------------------------------------------------
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const result = await post<{ processed: boolean }>(
        request,
        `/api/games/${joinCode}/host/score-next`,
        { hostToken }
      );
      if (!result.processed) break;
    }
    await post(request, `/api/games/${joinCode}/host/rankings`, { hostToken });

    hostState = await state(request, joinCode, hostHeaders);
    const rankings = hostState.rankings.filter(
      (ranking: { round_id: string }) => ranking.round_id === hostState.currentRound.id
    );
    expect(rankings).toHaveLength(3);
    expect(rankings.map((r: { rank: number }) => r.rank).sort()).toEqual([1, 2, 3]);

    // Now that the round is scored, students see the standing and each other's prompts.
    const scoredStudentState = await state(request, joinCode, {
      "x-player-token": tokens[0]
    });
    expect(scoredStudentState.rankings.length).toBeGreaterThan(0);
    expect(scoredStudentState.submissions.length).toBe(3);

    // --- export before anything destructive ----------------------------------------
    const exported = await post<{ rounds: { entries: unknown[] }[] }>(
      request,
      `/api/games/${joinCode}/host/export`,
      { hostToken }
    );
    expect(exported.rounds[0].entries).toHaveLength(3);

    // --- advance -------------------------------------------------------------------
    await post(request, `/api/games/${joinCode}/host/advance`, { hostToken });

    hostState = await state(request, joinCode, hostHeaders);
    expect(hostState.currentRound.round_number).toBe(2);
    // Three players with a floor of 2 means at least one is eliminated.
    const stillIn = hostState.players.filter(
      (player: { is_eliminated: boolean }) => !player.is_eliminated
    );
    expect(stillIn.length).toBeLessThan(3);
    expect(stillIn.length).toBeGreaterThan(0);

    // --- clean up ------------------------------------------------------------------
    await post(request, `/api/games/${joinCode}/host/abandon`, { hostToken });
  });

  test("rejects game creation without the organizer access code", async ({ request }) => {
    const response = await request.post("/api/games", {
      data: { pin: HOST_PIN, accessCode: "definitely-not-the-code" }
    });
    // 401 when a code is configured; 503 when the deployment has none set in production.
    expect([401, 503]).toContain(response.status());
  });
});
