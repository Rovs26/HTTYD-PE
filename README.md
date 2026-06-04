# How To Train Your Dragon: Prompt Engineering

An interactive classroom ice breaker where students compete by writing prompts that recreate or improve an AI-generated dragon image.

## Stack

- Next.js App Router + TypeScript
- Supabase Postgres, Storage, and Realtime Broadcast
- OpenAI image generation and vision scoring
- Vitest unit tests and Playwright e2e scaffolding

## Setup

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and run `supabase/migrations/0001_init.sql`.
3. Fill in Supabase, OpenAI, and `APP_SECRET` values.
4. Install dependencies and run the app:

```bash
npm install
npm run dev
```

## Notes

- Real image generation uses `OPENAI_IMAGE_MODEL`, defaulting to `gpt-image-2`.
- Image generation defaults to `OPENAI_IMAGE_SIZE=1024x1024`, `OPENAI_IMAGE_OUTPUT_FORMAT=jpeg`, `OPENAI_CHALLENGE_IMAGE_QUALITY=medium`, and `OPENAI_STUDENT_IMAGE_QUALITY=medium`. All generated game images are capped to `low` or `medium`; `high`, `auto`, `hd`, and `standard` are forced down to `medium`.
- Student image generation first uses `OPENAI_PROMPT_MODEL`, defaulting to `gpt-5.4-mini`, as a prompt companion that merges the base challenge, host round instruction, and student's locked prompt chain before calling the Images API.
- Host challenge image generation also uses the prompt companion. Round 1 creates the dragon identity, Round 2 adds interaction or background, and Round 3 creates a harder final trial.
- Clicking `Advance Round` immediately generates the next host challenge image from the previous challenge plus the host's next-round instruction.
- Vision scoring uses `OPENAI_EVAL_MODEL`, defaulting to `gpt-5.4-mini`, and `OPENAI_VISION_DETAIL=low` to reduce image-token cost.
- After a game ends, the host can use `Archive & New Game` to preserve rankings and final top-four images while removing the other generated image files from Supabase Storage.
- If a live game gets messed up, the host can use `Renew Game` to discard the current game entirely, remove its stored images, and start over with a new join code.
- `Back to Home` asks for confirmation, abandons the current game completely, deletes its stored data/images, and returns the host to the landing page.
- Creating a fresh host game also cleans up older game sessions and their stored images, so a one-time classroom run can stay focused on the newest join code.
- If OpenAI or Supabase image storage is not configured, the app uses a deterministic development fallback so the UI can still be explored without spending API credits.
- Supabase browser auth accepts `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; legacy projects can use `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
