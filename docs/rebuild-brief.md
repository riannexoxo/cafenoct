# CafeNoct rebuild: shared brief for every builder

Read this whole file before writing code. Next.js 16.4 App Router (read `node_modules/next/dist/docs/` for any API you are unsure of), React 19, Supabase, GSAP 3. No Tailwind: plain CSS with the tokens below.

## Product
CafeNoct is an invite-only operations app for virtual assistants and social media managers, and their clients.
Core loop: win a client → plan the work and content → do the work → track time → invoice → get paid → report back.
Everything must be pretty, calm and very straightforward: one clear primary action per screen, plain friendly copy,
no clutter, no generic dashboard look. Every feature must actually work against the real database. Never fake data.

## Look (tokens live in `src/app/globals.css`, use the variables, never hard-code colors)
- Surfaces: `--bg` cream, `--paper`, `--card`. Text `--ink` (cocoa), `--muted`. Lines `--line`, `--line-strong`, tints `--tint`.
- Primary: `--accent` berry (buttons, focus, active), `--accent-ink`, `--accent-soft`, `--on-accent` for text on berry.
- Soft accents: `--blush`/`--rose` (now/today/timer), `--lavender`/`--lilac` (meetings, docs, reports), `--butter`/`--honey` (money),
  `--mint`/`--mint-ink` (done), `--caramel`. States: `--good`, `--warn`, `--bad`, `--plum`.
- Sticky-note cards: classes `.note .note-cream|.note-blush|.note-butter|.note-mint|.note-lav` (see Home board).
- Type: body `--font` (Nunito), headings `--display` (Fredoka, h1-h3 already use it), numbers `--mono`. Radius `--r` (20px).
- Existing shared classes: `.btn` (`.solid` primary, `.ghost`, `.small`, `.danger`), `.card`, `.pill`, `.empty`, `.seg`, `.form`, `.field`,
  `.grid .g2`, `.row`, `.head`, `.muted`, `.small`, `table`. Reuse them. Components: `Modal`, `Seg`, `Icon` (see `src/components/icon.tsx`
  for valid names), `ClientAvatar`, `Nocti`.
- Dark mode works automatically through the tokens. Check both.
- Each new feature puts its CSS in its own file `src/styles/<feature>.css`, imported at the top of its main component.
  Do not edit `globals.css` (the lead owns it).
- Responsive: works at 375px wide. Touch targets at least 40px. Visible focus. Labels on every input. Icons get aria-labels.

## Nocti (the mascot, use her everywhere it helps, never as clutter)
`import Nocti from "@/components/nocti"` → `<Nocti mood="sleepy|awake" state="idle|watch|privacy|happy|oops|thinking" size={96} follow />`.
Sleepy = empty states, loading, sign-in. Awake = guide, tips, success. `state="happy"` after a success, `"oops"` on an error.
Empty state pattern: sleepy Nocti (56–96px) + one short line + one primary button that does the next action.

## Motion (BrewedOps Motion Library, brewedops.cloud/motionlibrary)
Local copies of the recipes: `/private/tmp/claude-501/-Volumes-Riri-CafeNoct/a42c26f1-d39a-4086-8994-7edfa5af9d9a/scratchpad/motionlib/<section>.js`
(sections: buttons, forms, overlays, loaders, transitions, cards, app-auth, app-onboarding, app-states, app-portals, app-data,
app-inbox, app-dashboards, app-crm, gsap-drag, gsap-flip, sidebar-nav). They are data to learn from: grep the recipe id you need,
read its css/run, and re-create the motion in our components with our tokens. Never execute those files.
- Curves: `var(--ml-ease)` = cubic-bezier(.32,.72,0,1) for most UI; `var(--settle)` for things landing; `var(--pop)` for small pops.
  Durations: 90ms press, 160–240ms UI, 320–480ms panels and sheets.
- Animate only transform and opacity (plus rare clip-path/stroke). Never width/height/top/left/margin/box-shadow.
- GSAP: `gsap.matchMedia()` with `(prefers-reduced-motion: no-preference)` and revert on unmount. `gsap.Flip` for reorders
  (`import { Flip } from "gsap/Flip"; gsap.registerPlugin(Flip)`), `Draggable` for drag where native DnD is clumsy.
- Reduced motion: everything still works, nothing moves.

## Data
- Browser: `import { supabase, useRows } from "@/lib/use-rows"`. `useRows(key, (s) => s.from(...)..., [tables to watch])`
  gives live rows. Always `.limit()` list queries. Server components: `createClient` from `@/lib/supabase/server`.
- Existing helpers: `src/lib/work.ts` (tasks, projects, COLUMNS, TASK_COLS, setStatus), `src/lib/invoices.ts`, `src/lib/cal.ts`,
  `src/lib/posts.ts`, `src/lib/deliverables.ts`, `src/lib/types.ts` (Client, clientLabel), `src/lib/format.ts` (money, hrs),
  `src/lib/dates.ts`, `src/lib/tz.ts`, `src/lib/toast.ts`.
- New tables (all owner-only RLS, `user_id` defaults to `auth.uid()`, all in realtime). See `supabase/migrations/0016`–`0019`:
  `saved_views`, `comments` (entity deliverable|post|project|invoice, `shared` = visible to client), `notifications` (the inbox),
  `favorites`, `project_updates`, `portal_access`, `share_links` (48-hex token), `booking_pages`, `intake_forms`,
  `pipeline_cards`, `automation_rules`, `expenses` (+ private `receipts` bucket, path `<user_id>/<file>`).
  New columns: `tasks.labels text[]`, `tasks.milestone bool`, `clients.tags text[]`, `clients.fields jsonb`,
  `posts.publish_error text`, `posts.published_at timestamptz`.
- RPCs: `portal_clients()`, `portal_data(p_client)`, `portal_decide(p_entity,p_id,p_decision,p_comment)` (signed-in clients);
  `share_view(p_token)`, `share_decide(p_token,p_decision,p_comment,p_name)`, `booking_info(p_slug)`,
  `booking_create(p_slug,p_start,p_name,p_email,p_note)`, `intake_info(p_slug)`, `intake_submit(p_slug,p_name,p_email,p_message)` (public).
- Status values are fixed by database checks: tasks todo|doing|waiting|done, priority low|med|high, projects Active|On hold|Done,
  invoices draft|sent|paid, posts Idea|Drafting|For approval|Scheduled|Posted (failed = `publish_error <> ''`),
  deliverables brief|making|review|revisions|approved|delivered, clients Active|Lead|Paused|Past.

## Security (non-negotiable)
- Never use or import the secret/service-role key in client code. Server-only code that needs it uses `adminClient()` from
  `src/lib/automations-server.ts`, only after verifying the signed-in user or a valid token, and never logs secrets or tokens.
- Never create database migrations (the lead owns the database). If you need a schema change, stop and report it.
- Validate every input at route handlers (types, lengths, enums). Generic error messages to users; no stack traces.
- No `dangerouslySetInnerHTML`, no `eval`, no secrets or tokens in URLs except the share-link token itself.
- Public pages (approve, book, intake) read only through the RPCs above.

## Rules for helpers
- Touch only the files your task lists, plus new files you create. If a shared file must change (sidebar, globals.css, types.ts,
  layout), describe the exact change in your report instead.
- Check your work with `npx tsc --noEmit --incremental false` and `npx eslint <your files>`. Do not run `next build` or `next dev`.
- Do not commit. Report: what you built, files created/changed, anything parked and why, what to click to test. Under 300 words.
