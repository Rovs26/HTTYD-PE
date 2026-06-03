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
- Image generation defaults to `OPENAI_IMAGE_SIZE=768x768`, `OPENAI_CHALLENGE_IMAGE_QUALITY=medium`, and `OPENAI_STUDENT_IMAGE_QUALITY=low` for faster classroom rounds.
- Student image generation first uses `OPENAI_PROMPT_MODEL`, defaulting to `gpt-5.4-mini`, as a prompt companion that merges the base challenge, host round instruction, and student's locked prompt chain before calling the Images API.
- Vision scoring uses `OPENAI_EVAL_MODEL`, defaulting to `gpt-5.4-mini`, and `OPENAI_VISION_DETAIL=low` to reduce image-token cost.
- After a game ends, the host can use `Archive & New Game` to preserve rankings and final top-four images while removing the other generated image files from Supabase Storage.
- If OpenAI or Supabase image storage is not configured, the app uses a deterministic development fallback so the UI can still be explored without spending API credits.
- Supabase browser auth accepts `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; legacy projects can use `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
