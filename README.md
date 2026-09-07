# How To Train Your Dragon: Prompt Engineering

An interactive classroom ice breaker where students compete by writing prompts that recreate or improve an AI-generated dragon image.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres, Storage, and Realtime Broadcast
- OpenAI image generation and vision scoring
- Vitest unit tests and Playwright e2e scaffolding

## Local setup

Requires Node.js 20.9 or newer, npm 10, a Supabase project, and the Supabase CLI.

1. Install dependencies and create the local environment file:

```bash
npm ci
cp .env.example .env.local
```

2. Fill in `.env.local`. Use a unique random `APP_SECRET` of at least 32 characters.

   Game creation is deliberately open: there is no access code. On a public deployment that means anyone with the URL can create a game and trigger image generation, so bound the cost with `MAX_IMAGES_PER_GAME` and `MAX_PLAYERS_PER_GAME`, and put the site behind Vercel Deployment Protection if it should not be public.

3. Initialize and link the Supabase CLI, then apply the checked-in migration:

```bash
supabase login
supabase init
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Run `supabase init` only if `supabase/config.toml` does not exist. The project ref is the subdomain in `https://YOUR_PROJECT_REF.supabase.co`. `supabase db push` applies every file in `supabase/migrations/`. `0001_init.sql` creates the schema and the public image bucket; `0002_generation_recovery.sql` adds the generation-queue recovery columns (`generation_started_at`, `generation_attempts`, `scoring_attempts`), the `skipped` generation status, and the indexes matching the hot query paths. `0003_parallel_generation.sql` adds the `claim_next_image` and `count_generated_images` functions that make parallel generation safe. `0004_classroom_experience.sql` adds the classroom options, phase timer, and audience-vote flag; `0005_practice_mode.sql` adds the practice flag. All five must be applied before the app will run correctly.

4. Start the app:

```bash
npm run dev
```

Run all fast checks with `npm run check`; run the browser smoke tests with `npm run e2e`.

## Deploy to Vercel

1. Import this repository as a Next.js project and select Node.js 22.
2. Add the variables from `.env.example` in Vercel Project Settings, scoped to Production. Set `NEXT_PUBLIC_APP_URL` to the canonical HTTPS origin, keep `AI_PROVIDER=openai`, and provide `APP_SECRET` as a server-only secret. Environment variables are snapshotted per deployment, so redeploy after changing one.
3. Keep `SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` server-only; never rename either with a `NEXT_PUBLIC_` prefix. The app does not use a direct Postgres connection string, so one is not required in Vercel.
4. Deploy, then verify host creation, student join, image generation, voting, scoring, and Realtime updates from two separate browsers.

Rotate any secret that has appeared in chat, screenshots, logs, or source control before deploying. Update both Vercel and `.env.local` after rotation. Changing `APP_SECRET` invalidates existing host and player tokens. Redeploy after changing any `NEXT_PUBLIC_` variable because those values are included in the browser build.

## Notes

- Real image generation uses `OPENAI_IMAGE_MODEL`, defaulting to `gpt-image-2`.
- Image generation defaults to `OPENAI_IMAGE_SIZE=1024x1024`, `OPENAI_IMAGE_OUTPUT_FORMAT=jpeg`, `OPENAI_CHALLENGE_IMAGE_QUALITY=medium`, and `OPENAI_STUDENT_IMAGE_QUALITY=medium`. All generated game images are capped to `low` or `medium`; `high`, `auto`, `hd`, and `standard` are forced down to `medium`.
- Student image generation first uses `OPENAI_PROMPT_MODEL`, defaulting to `gpt-5.4-mini`, as a prompt companion that merges the base challenge, host round instruction, and student's locked prompt chain before calling the Images API.
- Host challenge image generation also uses the prompt companion. Round 1 creates the dragon identity, Round 2 adds interaction or background, and Round 3 creates a harder final trial.
- Clicking `Advance Round` immediately generates the next host challenge image from the previous challenge plus the host's next-round instruction.
- Vision scoring uses `OPENAI_EVAL_MODEL`, defaulting to `gpt-5.4-mini`, and `OPENAI_VISION_DETAIL=low` to reduce image-token cost.
- Every OpenAI call uses a `OPENAI_TIMEOUT_MS` timeout (default 120s) and up to two SDK retries, so one hung request cannot occupy the generation queue.

## Recovering a stuck round

Image generation is a queue the host drains from the dashboard. A job is claimed by flipping its row to
`generating`; if that attempt never finishes (serverless timeout, closed host tab, dropped Wi-Fi) the row is
automatically requeued after three minutes on the next `Generate Images` press.

Each image gets three automatic attempts. A prompt the image model refuses is marked failed immediately
rather than retried, because retrying a refusal only costs money. Any image still `pending` or `failed`
appears in the Results Arena with **Retry** and **Skip** buttons:

- **Retry** clears the attempt counter and requeues that one image.
- **Skip** drops that submission from the round. The round can then proceed without it, and the skipped
  entry is excluded from readiness checks.

`End Game Now` finalizes the game from any round state, so a class that runs out of time still reaches the
winners screen.

## Generation speed and spend limits

Images generate in parallel. Each worker claims a row atomically through `claim_next_image`
(`FOR UPDATE SKIP LOCKED`), so lanes never collide and two host tabs cannot generate — or pay for — the
same dragon twice. The **Parallel lanes** control on the dashboard sets how many run at once; 4 is the
default and takes a 25-student round from roughly 15 minutes to roughly 4. Lower it if OpenAI starts
returning rate-limit errors.

Two hard ceilings bound a session's cost, both configurable in the environment:

| Variable | Default | What it caps |
| --- | --- | --- |
| `MAX_IMAGES_PER_GAME` | 200 | Images a single game may generate |
| `MAX_PLAYERS_PER_GAME` | 60 | Players who may join one game |

Join, submit, vote, host-PIN and game-creation requests are also rate limited in-process. Because each
serverless instance keeps its own counters this is a speed bump rather than a guarantee — the two limits
above are what actually bound spend.
- After a game ends, the host can use `Archive & New Game` to preserve rankings and final top-four images while removing the other generated image files from Supabase Storage.
- If a live game gets messed up, the host can use `Renew Game` to discard the current game entirely, remove its stored images, and start over with a new join code.
- `Back to Home` asks for confirmation, abandons the current game completely, deletes its stored data/images, and returns the host to the landing page.
- Creating a fresh host game also cleans up older game sessions and their stored images, so a one-time classroom run can stay focused on the newest join code.
- If OpenAI or Supabase image storage is not configured, the app uses a deterministic development fallback so the UI can still be explored without spending API credits.
- Supabase browser auth accepts `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; legacy projects can use `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Classroom options

Three switches on the host dashboard change how the lesson plays. Each one is off or on per game, and
the host can flip them mid-session.

| Option | Default | Effect |
| --- | --- | --- |
| Audience voting | off | Eliminated students keep voting. Their ballots are stored with `is_audience_vote = true` so the two groups can be told apart, and they count toward the result. Without this, the four finalists decide the final among themselves. |
| Anonymous voting | off | While voting is open, rivals' names are replaced server-side with stable "Trainer N" labels. Real names return the moment the round is scored. The masking happens in `buildGameStateView`, not in the browser, so the names genuinely are not sent. |
| Reveal prompts | on | After a round is scored, every student can read every prompt from that round, ordered best-placed first. In a game about prompt engineering this is the lesson, so it defaults on. |

A **phase timer** can be set to 1, 2 or 5 minutes. It is advisory: the countdown appears on both the
projector and every phone, but nothing closes automatically — the host still drives every transition.

## Host views

The dashboard has three modes, switched from the header:

- **Control** — the full operating panel.
- **Lobby** — a projector screen with a large join code, the QR code, and the names of everyone who has
  joined so far. Use this before Start Game.
- **Reveal** — one dragon at a time, large, with its votes, AI score and rank. The four-column
  thumbnail grid is unreadable from the back of a classroom; this is not.

Each player row shows whether they have submitted a prompt and, during voting, whether they have voted,
so the host is not closing a phase blind. **Rename** fixes an unsuitable display name without ejecting
the student; **Remove** deletes the player along with their prompts and stored images.

## Practice mode

Tick **Practice game** when creating a game and the whole session runs on placeholder dragons:
no OpenAI calls, no spend, every other part of the flow identical. Use it to rehearse before a
lesson, or to demo the game. Practice games are marked on the host dashboard so one is never
mistaken for the real thing.

The switch is per game and stored on the session, so it does not depend on `AI_PROVIDER` and
does not need a redeploy.

## Exporting a lesson

**Export Results** downloads the whole game as JSON: every prompt each student wrote, the
combined prompt chain the image was generated from, image URLs, AI scores and rationales,
vote counts and final placings. Renew, Abandon and Archive all destroy this, so their
confirmation dialogs offer the export first.

## Project layout

The game engine is split by responsibility. `src/lib/game/service.ts` is a facade that
re-exports it, so route handlers have a single import:

| Module | Responsibility |
| --- | --- |
| `schemas.ts` | Request shapes for every endpoint |
| `session.ts` | Identity, authentication, session lifecycle plumbing |
| `queries.ts` | The state clients poll, and the results export |
| `lifecycle.ts` | Create / unlock / join / configure / tear down |
| `rounds.ts` | Round state machine, ranking, elimination |
| `generation.ts` | Image and AI-scoring queue |
| `participation.ts` | Submitting a prompt, casting a vote |
| `progression.ts` | Round count, titles, cut lines — the shape of the game |
| `public-state.ts` | What each role is allowed to see |
| `rules.ts`, `ranking.ts`, `round-gating.ts` | Pure decision logic, all unit tested |

Round count, cut lines, titles, default instructions and the student-facing prompt copy all
live in `progression.ts`. Cut lines scale with class size: a full class still cuts to 10 then
4, while a class of 12 cuts to 6 then 3 rather than losing almost nobody.

## Development

```bash
npm run dev:mock    # the whole app on placeholder dragons, no OpenAI key needed
npm run check       # lint, typecheck, unit tests
npm run e2e:game    # drives a complete game through the API against the mock provider
```

`npm run e2e` forces `AI_PROVIDER=mock` for the dev server it starts, so a local browser run
can never reach a real image model.
