# Claude Design brief — How to Train Your Dragon: Prompt Engineering

Redesign the interface of a live classroom game. The behaviour, data flow and API are finished
and must not change — this is a visual and layout pass over screens that already work.

## What this is

A Kahoot-style ice breaker for teaching prompt engineering. A teacher projects a host screen;
students play on their phones. Everyone sees the same AI-generated dragon as a target, then
writes prompts trying to recreate or beat it.

Three rounds, elimination between each:

1. **Create Your Dragon** — write a prompt from scratch against a challenge image
2. **Train the Scene** — add interaction, movement or setting; the dragon's identity must survive
3. **Final Dragon Trial** — a harder trial with action, stakes and dramatic lighting

Each round: submissions open → students write → host closes → images generate → students vote →
AI scores similarity → rankings → the top players advance. A class of 30 cuts to 10, then 4.

The prompts students write are the actual lesson. After each round everyone can read every
prompt, ordered best-placed first. That reveal is the most important teaching moment in the
product and currently looks like a plain list.

## Two very different surfaces

**The projector**, seen from the back of a classroom, 3–8 metres away, by 30 people at once.
Big type, high contrast, readable at a glance. This is a stage, not a dashboard.

**The phone**, held by a teenager who is competing, waiting, or knocked out. Thumb-reachable
controls, no horizontal scroll, works one-handed.

The host screen is currently a dense control panel used for both jobs. It has three modes and
they deserve genuinely different treatments.

## Screens to design

### Landing (`/`)
Create a host game (organizer access code + host PIN + a "practice game" toggle that runs on
placeholder dragons for free) and join by six-character code. Currently a two-column form.

### Join (`/join/[code]`)
One field: the student's name. First thing a student sees. Should feel like entering an arena.

### Host — Lobby mode
Pre-game. Large join code, QR code, and the names of students appearing live as they join.
Should build anticipation and be readable from anywhere in the room.

### Host — Control mode
The teacher's operating panel while the game runs. Contains, roughly in order of use:
- Round state pills (submissions open/closed, voting open/closed, practice badge)
- The challenge image
- Phase controls: Start, Open/Close Submissions, Generate Images, Open/Close Voting,
  AI Score, Recompute Rankings, End Game Now
- A parallel-lanes selector (1–8) for generation speed
- Ranking mode (voting first / voting only / AI only / blended) and a blended vote-weight slider
- Three classroom toggles: audience voting, anonymous voting, reveal prompts
- Phase timer: 1m / 2m / 5m / clear, with a live countdown
- Next-round instruction textarea, and Advance Round
- Export Results, Renew Game, Back to Home
- A player roster: each row shows name, in/out/rank, whether they have submitted, whether they
  have voted, and Rename / Remove actions
- Counters: generated, votes, AI scored
- A results grid of every student's dragon, including ones still queued, generating, failed or
  skipped, with Retry / Skip on anything unresolved

This is a lot. The design job is triage: what the teacher needs *right now* should be
unmissable, and everything else should recede without being hidden. Consider surfacing only the
controls legal in the current phase.

### Host — Reveal mode
One dragon at a time, large, with its votes, AI score and rank, and previous/next. The theatre
of the game. Should feel like a reveal, not a slideshow.

### Host — winners
End of game. Champion plus three runners-up with their dragons.

### Student — the main play screen (`/play/[code]`)
One scrolling column that changes with the phase:
- **Waiting / lobby** — challenge image not yet generated
- **Writing** — the challenge image, the round instruction, a prompt textarea, a character
  count, and a six-dimension scaffold (subject, action, setting, lighting, mood, composition)
  whose dots light up as the prompt appears to cover each one
- **Review before lock** — a confirmation step showing the prompt back before it is locked forever
- **Locked, generating** — their prompt, and a live status: queued / being drawn / failed
- **Voting** — a grid of rival dragons to vote on. Under anonymous voting the authors show as
  "Trainer 3" rather than names
- **Results** — their dragon, AI score, the rationale explaining the score, their rank, a full
  round leaderboard, and every prompt from the round
- **Eliminated** — an explicit "you did not advance" with their placing, then spectator content:
  the gallery, the leaderboard, and an audience vote if the host enabled it
- **Game over** — final placing and the closing leaderboard

Two states matter more than they look. **Eliminated** covers two thirds of the class for most of
the lesson — it must not feel like a dead end. And **waiting** is where students spend the most
time; it should give them something to look at.

## Constraints

- Next.js 16 App Router, React 19, Tailwind v4, TypeScript strict
- Existing primitives to keep or evolve: `src/components/ui/button.tsx` (primary / secondary /
  danger / ghost, loading state), `src/components/ui/field.tsx` (TextField, TextArea, Label),
  `src/components/status-pill.tsx` (neutral / hot / cool / gold), `src/components/dragon-mark.tsx`
- Design tokens live in `src/app/globals.css` as CSS variables. Current palette is a dark slate
  ground with ember `#f97316`, gold `#facc15`, teal `#2dd4bf`, ruby `#ef4444`. Treat this as a
  starting point, not a requirement — but keep the dark ground for the projector.
- Icons are `lucide-react`
- Touch targets at least 44px; the phone layout must never scroll horizontally
- Keep the existing accessibility work: live regions announcing phase changes, `role="alert"` on
  errors, vote buttons named by their author, visible focus states
- Do not change component props, state shape, API routes, or anything in `src/lib/`

## The feel

It should look like a game, not an admin tool: Norse, cinematic, a bit of forge-fire and
sea-mist. It is for teenagers, but it is run by a teacher in front of a class, so it needs to
stay legible and calm under pressure. Avoid anything that would make a 30-second phase change
confusing.

Where you have room to be bold, spend it on the reveal and the winners — those are the moments
the room is looking at the screen together.
