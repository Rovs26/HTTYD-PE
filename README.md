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
- Vision scoring uses `OPENAI_EVAL_MODEL`, defaulting to `gpt-5.5`.
- If OpenAI or Supabase image storage is not configured, the app uses a deterministic development fallback so the UI can still be explored without spending API credits.
