# CafeNoct overnight report ☕

Everything is on the `rebuild` branch, committed locally. **Nothing is pushed or deployed.**
Build, typecheck, lint and `npm audit` (runtime) are clean. The database got 6 additive migrations (0016–0021),
all on the live project. No drops, renames or data rewrites.

One thing first: **your live site still runs Next.js 16.3.8, which has 2 critical remote-code-execution holes.**
This branch upgrades to 16.4.6. Deploying it closes them.

## What got built, phase by phase

| Phase | Status | What you get |
|---|---|---|
| Design system + home board | Done | xo.rianne palette, Fredoka + Nunito, sticky-note board, animated Nocti (breathes, blinks, looks at the cursor, eyes shut while you type a password, hops on success) |
| Core sections in the new look | Done | Shared buttons, cards, inputs, nav and tables restyled. Sleepy Nocti on every empty state |
| Nocti walkthrough | Done | 4 real first steps (client, task, timer, invoice), ticks itself off from your data, skippable, "Take the tour" in the sidebar |
| Spreadsheet mode + CSV | Done | Sheet grids for tasks and invoices. CSV export for tasks, invoices and clients. CSV import for tasks and clients with preview and error report |
| Account recovery | Built, not tested end to end | `/forgot-password`, `/auth/confirm`, `/account/password`. Waiting on your invite code and test inbox, as agreed |
| Turnstile-ready auth | Done | Off until you add keys. Sign-up is checked server-side |
| Timer double-log fix | Done | `stop_timer()` claims the timer and logs the time in one transaction |
| A · One dataset, many views | Done | Work page has Board, Table, Calendar and Timeline. Trello cards, labels, milestones, comments, activity, duplicate, saved views, project status updates |
| B · Social planner | Done, posting parked at Meta | Covers in the calendar, drag to reschedule, Week view, Instagram grid planner, queue (draft, approval, scheduled, failed, posted), Publish now, approval links, best time to post |
| C · Client portal | Done | Invite a client and they see projects, deliverables (signed previews), posts and invoices. Approve, request changes, comment. Monthly report PDF |
| D · Pipeline + automations | Done | `/pipeline` board with values and next steps. Rule builder with 3 presets, run by the database the moment a status changes |
| E · Wallet | Done | Month vs last month, expenses with receipts, per-client earnings, 12-month chart, expected income with days overdue, searchable transactions. Existing balance math unchanged |
| F · Time tracker | Done | Ranges, filters, per-client and per-project totals, weekly report, task on entries, one-click timers, invoice from unbilled time |
| G · Inbox + threads | Done | `/inbox` with live unread badge. Comment threads on deliverables, invoices and projects (tasks already had them) |

## Feature harvest

**Built**
- Cmd+K search across clients, projects, tasks, invoices, posts and docs, plus favorites and recents.
- Favorites (★ in Cmd+K).
- Duplicate a task in one click.
- Relations (a task knows its client, project and comments).
- Drag and drop everywhere: board, calendar, IG grid and pipeline.
- Checklists with progress, card covers, activity trail.
- Timeline view, milestones, project status updates.
- Intake forms (`/form/<slug>`): a submission becomes a task.
- Booking page (`/book/<slug>`) with no double booking.
- Approval links that need no account.
- Monthly client report PDF.
- Client timeline and contact record (tags, custom fields).
- Pipelines, workflow automations, and a "review request" preset (creates a task when a project is done).
- One-click timers and weekly time reports.
- Expense and receipt capture.
- Best time to post, auto-built client report, one real-time inbox, threads, saved items (★ in the inbox).

**Already existed:** recurring tasks, due-date push nudges (Automations), docs beside the work.

**Parked**
- Unified social inbox: needs Meta/TikTok comment and message permissions plus app review.
- Real TikTok posting: needs an audited TikTok app.
- Instagram/Facebook posting: built, but needs `instagram_content_publish` and `pages_manage_posts` approved in Meta app review, then a reconnect.
- Review request *emails*: no email sending yet (custom SMTP is out of scope). The preset makes a task instead.
- Workload view: CafeNoct is one person per workspace today, so it adds little. Per-client hours are on the Time page.
- Reactions and likes, mentions: no second person to react to.
- Template gallery beyond the existing project templates.
- Guest access to *views*: the portal and approval links cover the real need.

## Migrations applied (live project `rtdccildxzkeegyetrpi`)
- `0016_workspace`: `tasks.labels`, `tasks.milestone`, `clients.tags`, `clients.fields`; tables `saved_views`, `comments`, `notifications`, `favorites`, `project_updates`.
- `0017_social_queue`: `posts.publish_error`, `posts.published_at`. A failed post is recorded here instead of a new status, so the existing check constraint stays.
- `0018_portal_and_links`: tables `portal_access`, `share_links`, `booking_pages`, `intake_forms`, plus the client and public functions (below).
- `0019_pipeline_rules_expenses`: tables `pipeline_cards`, `automation_rules`, `expenses`; private `receipts` bucket; `cn_run_rules` status trigger on tasks, deliverables, invoices and projects.
- `0020_stop_timer`: the atomic timer stop.
- `0021_security_hardening`: client/project ownership trigger on the new tables; stricter approve rules; rate limit on approval links.

Every new table has RLS on, with owner-only policies (`user_id = auth.uid()`, authenticated role) created in the same migration.
The 5 server-only tables (`app_owners`, `invites`, `canva_tokens`, `social_tokens`, `va_playbook_leads`) are untouched.
`record_email_payment`, `handle_new_user`, `require_invite` and `rls_auto_enable` are untouched.

**How client access works.** No table has a client or public policy.
- **Clients** read and act only through SECURITY DEFINER functions, each with `search_path = ''`:
  - `portal_clients`, `portal_data`, `portal_decide`: signed-in client accounts only.
  - `share_view`, `share_decide`: a 48-character random token, no account needed.
  - `booking_*`, `intake_*`: public.
- Each function first proves access (an active `portal_access` row for that exact client and owner, or a valid unexpired token), then returns or changes only that one client's rows.
- The automation trigger runs as the person making the change and can never block it: errors go to the Inbox.
- Booking uses a per-owner lock, so two people can't take one slot.

## Security
- **Secret scan.** No keys anywhere in git history. The service-role key is read from env, server-only, never logged.
- **Auth.**
  - Friendly errors, including Supabase's 2-emails-an-hour limit.
  - One message for bad or used invite codes, so codes can't be probed.
  - New passwords need 10+ characters, with a strength meter. Show/hide toggle and caps-lock hint.
  - No open redirects.
- **Headers.** Frame blocking, nosniff, HSTS, referrer and permissions policy. Auth pages are never cached; public pages are noindex.
- **Audit.** A full audit ran on the diff: nothing High or Critical. All 3 Medium issues fixed in `0021` and code:
  - A VA could point a portal at another VA's client.
  - A portal invite could be used with any email.
  - Portal invites could mint accounts with no overall cap.
- **My own catch.** I fixed one more on the way: signed file previews are limited to the item owner's own storage folder.

**Proposals I did not apply** (they touch existing functions or settings, which your rules reserve for you):
1. Revoke `EXECUTE` on the trigger functions `handle_new_user`, `require_invite` and `rls_auto_enable` from anon/authenticated. They're callable over the API today. Revoking doesn't affect how they fire as triggers.
2. Set `search_path` on `touch_updated_at`.
3. Add a nonce-based `script-src` to the CSP. Worth testing on a preview deploy first.
4. Ask for email confirmation on sign-up instead of `email_confirm: true`. Waits for custom SMTP because of the 2-emails-an-hour cap.

## Click-through test (about 20 minutes)
1. `/login`: Nocti shuts her eyes on the password, the eye toggle works, Forgot password works.
2. Home board: cards drift in; quick add Task, Event and Invoice.
3. Cmd+K: search a client, then a task. ★ Favorite this page.
4. Work: switch Board, Table, Calendar and Timeline. Drag a card to Done. Edit a cell in Table. Save a view. Export and import CSV.
5. Content: Week view, drag a post, Grid (pick a client, drag tiles), Queue. Open a post, Send for approval, open the link in a private window, request changes.
6. Inbox: that change request should be there, and the post is back to Drafting.
7. Client page: Timeline, Details (add a tag), Monthly report, then Save as PDF. Portal invite: copy the link.
8. Private window: sign up with that link using the invited email. You land in `/portal`. Approve a deliverable set to "With client".
9. Pipeline: Import clients, drag a card. Automations: tap "Celebrate payments", mark an invoice paid, check the Inbox.
10. Wallet: add an expense with a receipt; check this month's income matches what you expect.
11. Time: Dates range, filters, "Invoice … unbilled". Calendar: drag and resize a time block.
12. Settings: make a booking page and a request form, then try both links signed out.
13. Night mode and phone width (375px) on a few pages; turn on Reduce Motion on your Mac.

## Deploy checklist
1. **Supabase → Auth → URL configuration:** add redirect URLs `https://cafenoct.vercel.app/auth/confirm` and `http://localhost:3000/auth/confirm`.
2. **Supabase → Auth → Email templates → Reset password:** change the link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/account/password`.
3. **Supabase → Auth:**
   - Turn on *Leaked password protection*, *Secure password change* and minimum password length 10.
4. **Turnstile (optional, do it after deploying):**
   - Cloudflare: make a widget for your domain.
   - Vercel env: `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`. Redeploy.
   - Then Supabase → Auth → Bot protection: Turnstile, with the same secret.
5. **Meta (for real posting):** request `instagram_content_publish` and `pages_manage_posts` in app review, or add them to your Login for Business config. Then reconnect accounts.
6. **Recovery test:** send me an invite code and a test inbox, and I'll run the end-to-end reset test.
7. **Ship:** review the branch, then tell me to push `rebuild` and open a PR. Vercel builds a preview to click through before you merge to production.

## Known limits
- Nothing was click-tested while signed in: I didn't use your account and didn't create test accounts.
- Sign-in, forgot password and the public pages were checked in the browser. Signed-in screens passed typecheck, lint and build only.
- Monthly report month edges use UTC.
- Expenses don't reduce wallet balances (it's your call whether they should).
- The time page totals read up to 5,000 entries per range.
- The pipeline can't reorder two cards that share a position, which only happens after an automation moves several at once.
- The USB drive is slow. `npm ci` takes about 12 minutes there.
