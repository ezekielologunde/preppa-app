---
project: Preppa
type: decisions
status: active
last_updated: 2026-09-12
tags: [project/preppa, type/decisions]
---

# Decisions

Part of [[Project]]. Extracted from `AUDIT.md`, `docs/REDESIGN-DIRECTION.md`, `SPRINT-27-FEED-VIDEO-PLAN.md`, and code comments.

## Scoping autonomous work to what genuinely doesn't need the user (2026-09-12)

- **Asked to "do all you can that doesn't need me" against the Launch-Plan P0 list — the right response was triage, not attempting everything.** Real-money E2E testing (item 2), Stripe Connect on a physical phone (item 3), and native auth QA (item 12) all genuinely require hardware/a real card/the user's presence — confirmed `ANDROID_HOME` isn't even set in this environment, so there's no emulator shortcut either. Cook recruitment (item 8), launch geography (item 9), and legal sign-off (item 13) are business/ops decisions only the user can make. Dev/prod separation (item 5) needs a recurring-cost approval already declined once — not something to re-spend without asking again. None of these were attempted; correctly identifying "needs the user" is itself the useful output, not a reason to force something anyway.
- **What was left — the safety-report alerting gap — was chosen because it was fully within reach and genuinely valuable, not because it was easy.** It required tracing through `pg_get_functiondef` on live functions (not assuming from file names) to discover `public_support_requests` even existed and that it was completely unwired; a shallower pass would have reported "not traced to a call site" again, same as the prior review did.
- **Declined the confirmed-dead `cod`-branch cleanup (8 files) despite having time for it** — real production data confirms zero orders ever used `method='cod'`, so it's genuinely safe to remove, but it's a purely cosmetic, multi-file, type-cascading refactor with no functional payoff and real diff-review risk, already explicitly deferred three times in [[Tasks]]/[[Bugs]]/[[Launch-Plan]]. "Can do it safely" and "should do it unprompted" aren't the same bar — low-value, higher-blast-radius cleanup stays opt-in.
- **Verified the new alerting live in production with a real synthetic row, not a dry read of the SQL** — inserted a real `immediate_risk=true` test report, confirmed both admins actually received a genuine notification + email (`net._http_response` 200s), then deleted the test row and its notifications. A trigger that "should fire" per the SQL isn't the same as one confirmed to fire.

## Correcting an incomplete root cause instead of re-closing the ticket (2026-09-11)

- **"Fixed" a real incident on 09-10, then four more alerts fired on the identical fix — the honest move is to re-open and re-diagnose, not assume alert fatigue or bad luck.** The 09-10 fix (offsetting `detect-admin-anomalies`/`detect-system-health-issues`) was real and correct, but the write-up's confidence ("Root cause was self-inflicted scheduling") outran the evidence — it never checked whether the *other* jobs in that cluster could cause the same symptom on their own. They could: `charge-due-cycles`/`reconcile-payouts`/`stripe-sync-worker` collide independently of the two detect jobs.
- **When two jobs share a schedule, check which of them actually make the risky call before assuming all of them are load-bearing** — `advance_cycles()`/`reap_experience_holds()` share `*/5 * * * *` with the two HTTP-dispatching jobs but are pure SQL (verified via `pg_get_functiondef`, not assumed from the function name); staggering them would have been wasted effort and a false sense of completeness.
- **A job that must run every minute (`stripe-sync-worker`) can't be scheduled away from a collision — raise its tolerance instead of chasing an impossible offset.** `timeout_milliseconds` on `net.http_post` defaults to 5000 and is a real parameter, not a pg_net limitation; for three non-latency-sensitive background dispatchers, 15000 removes the false-positive risk directly instead of only reducing its odds.
- Same "investigate before dismissing" instinct from [[#Diagnosing the monitoring system's own false alarm (2026-09-10)]] applied a second time — the user kept forwarding new alert emails rather than assuming the first fix worked, which is what surfaced that it hadn't fully.

## Legacy patterns explicitly not carried forward

An older, separate implementation lineage (pre-dating this repo) used patterns this codebase
deliberately does not repeat: email addresses as participant identifiers, relatively broad RLS
`update` permissions paired with trigger guards instead of tight policies, client-visible payment-
method enums (e.g. raw Cash/Venmo/Zelle choices), and public review-creation gated mainly on
caller identity before later hardening. The current model — `SECURITY DEFINER` RPC + `auth.uid()`
gate + inline `audit_log` write, server-priced money paths, Stripe as the sole payment rail — is
the one to keep hardening; don't reintroduce the looser patterns above even under time pressure.

## Diagnosing the monitoring system's own false alarm (2026-09-10)

- **When your own monitoring pages you, investigate before dismissing OR before panicking** — two real "outbound request failure" alerts arrived; the instinct to check could have stopped at "eh, transient blip, ignore it" or overreacted as "the payment infra is failing." Neither was right: reading `cron.job_run_details` directly showed every payment/payout job succeeded both times, and reading the *timing* of the failing job's own execution (took ~4.7s, suspiciously close to the 5000ms timeout in the alert) pointed straight at a scheduling collision, not infrastructure failure.
- **A monitoring job's own schedule is part of the system it's supposed to protect, not exempt from load-planning** — `detect-admin-anomalies`/`detect-system-health-issues` were added without checking what else already ran on `*/5 * * * *`; the fix (offsetting to :07/:22/:37/:52) is a one-line schedule change once diagnosed, but would have kept recurring indefinitely if the alerts had just been dismissed as noise.
- **Fix what you can at your actual privilege level, not what would be ideal** — the normal fix for an unindexed 112K-row table is an index; `must be owner of table job_run_details` ruled that out (Supabase's hosted pg_cron tables aren't owned by the project role). Periodic deletion was the fix actually available, and it's sufficient — the monitoring only ever looks back 15 minutes, so 3 days of retention is already generous, not a compromise.

## Transactional email scope correction (2026-09-08)

- **"Verify X delivers" sometimes reveals X doesn't exist — say so plainly rather than testing around it.** Launch-Plan item 14 assumed cook-application, order-lifecycle, and payout emails existed and asked to verify delivery; grepping every Edge Function showed none of them ever call an email API — only `notify()` (in-app + push). Reported this as a scope correction (a product decision: build the email, or accept in-app/push as the real channel), not as "verified, working."
- **Check the actual DNS/routing provider, not just the help-center copy listing an address** — `support@`/`safety@`/`abuse@preppa.live` were assumed to work because they're listed publicly; Cloudflare's own Email Routing dashboard showed the whole domain's routing was Disabled (missing SPF) and two of the three addresses had no rule at all. The public-facing claim and the actual infrastructure state were different things.

## Admin launch dashboard (2026-09-08)

- **Never trust a new metrics query without checking it against live data first** — before calling `admin_dashboard_metrics()` done, ran it against production and found `live_meals_count` was silently counting dead seed-kitchen inventory as real. A metric that "runs without error" isn't the same as a metric that's *correct*; verify the actual numbers make sense given what you already know about the data (0 verified kitchens today, so 0 live meals was the only sane answer).
- **System health (uptime/error-rate monitoring) is deliberately out of scope for a SQL RPC** — money and marketplace metrics are all derivable from Postgres; Vercel deploy status, Edge Function error rates, and cron failures live outside the database and need real external monitoring, not a query pretending to cover something it can't see.

## Fake seed kitchen cleanup (2026-09-08)

- **Append-only tables are respected as a hard constraint, not worked around** — when deleting the 6 fake seed kitchens hit `block_mutation()` errors on `ledger_entries`/`subscription_events`/`messages`, the response was to stop and change approach (permanently `reject`/`pause` the kitchens instead), never to drop or bypass the trigger. The same principle already applied to `audit_log` earlier this session; the ledger's immutability is a real accounting-integrity guarantee, not an inconvenience.
- **Every multi-statement production DML change this session ran inside an explicit `begin`/`commit`, never partial** — three separate delete attempts each failed partway through and rolled back cleanly with zero rows changed, confirmed by re-querying before trying a different approach. Never `commit` speculatively hoping unrelated tables are unaffected.
- **"Not currently reachable" (RLS-blocked) is not the same bar as "shouldn't exist"** — the fake kitchens were confirmed customer-unreachable via RLS before any DB change, but real rows sitting in production (with real dev/test order and ledger history attached) were still worth permanently closing rather than leaving as a landmine for if RLS or verification logic ever changes.
- **A data-layer finding doesn't obligate finishing the matching code-layer refactor in the same pass** — closing the 6 kitchens in the DB fully resolves the "reachable as real inventory" risk; removing the `COOKS`/`CookId` fallback system was deferred because it touches a non-optional field (`Meal.cook`) that *real* meals also default through, making it a genuine refactor rather than dead-code deletion — see [[Tasks]].

## Credential rotation (2026-09-08)

- **When an exposed secret's exact identity can't be recovered (the leaking file was already deleted), rotate every plausible candidate rather than guess** — both Full-access Resend keys were rotated, not just one, since there was no way to tell which had been in the exposed CSV.
- **Rotate to *less* privilege, not just a new value** — the replacement Resend key is `Sending access`-only and domain-restricted (vs. the old `Full access`); the replacement Mux token is `Video`-only (vs. the old Data/Video/System/Robots). A credential incident is a natural forcing function to also fix over-broad scope, not just swap the value.
- **Prefer a provider's zero-downtime rotation path when one exists** — Google Cloud's OAuth clients support multiple simultaneous secrets; added the new one, confirmed it live in Supabase, only then disabled the old one, rather than a delete-then-recreate that would have caused an outage window.
- **Verify a rotated secret actually works before revoking the old one**, using the same temporary-debug-function-then-stub pattern already proven for the Stripe live/test-mode check earlier this session — never assume a copy-paste succeeded, and never leave verification code with real credential handling deployed longer than the single request it takes to check.

## Payout reconciliation (2026-09-07)

- **A reconciler must never mint a new Stripe idempotency key for an existing payout row** — it only ever replays the original `payout_<id>` key (Stripe guarantees this returns the original transfer, never a second one) or looks the transfer up by `metadata.payout_id`. Minting a fresh key on a stuck row is exactly the double-payout risk the whole design exists to avoid.
- **An unresolvable stuck payout is parked as `needs_review`, never auto-failed** — freeing the reserved amount on a guess risks paying the cook twice if the original transfer actually landed. A human resolves it after checking the Stripe dashboard directly.
- **Migration history is reconstructed from the live database's own `supabase_migrations.schema_migrations` table**, not guessed or squashed into a single baseline — this preserves the real, git-bisectable history and lets each historical migration's rationale (kept in its own comments) survive intact.
- **New payout migrations vendor into the repo even though the corresponding pg_cron jobs already exist live** — the migration is the source of truth going forward; running it again in CI is a guarded no-op (`to_regnamespace('cron')` check) so local/CI environments without pg_cron aren't affected.

## Admin anomaly detection (2026-09-07)

- **Dedupe anomaly alerts using `audit_log` itself** (an `action = 'anomaly_alerted'` row with a `meta.kind` + time-window check), not a new table — the existing append-only log already has the right shape (actor/entity/time) and this avoids adding a second source of truth just to remember "already alerted this window."
- **Query the existing Stripe-sync mirror tables (`stripe.charges`/`stripe.refunds`) for refund-volume and payment-failure detection**, guarded with `to_regclass(...)` so the checks are a no-op on a fresh local/CI stack that lacks the Stripe sync schema — no new instrumentation or webhook handler needed, the data was already being mirrored.
- **Alert routing to Slack/email is built as inert-by-default plumbing** (`notify_admins()` posts to an `admin_alert_webhook_url` Vault secret only if one exists) rather than blocking the whole feature on getting a webhook URL first — same pattern as the Stripe-test-key deferral for [[Payments]] environment separation: ship what doesn't need external input, document what does.

## Product / positioning

- **Feature-flag, don't delete** — `src/config/flags.ts` hides unfinished surfaces (`rewards`, `live`) rather than removing code, so a flag flip brings a surface back.
- **PrepPlus web-only at the entry point** — IAP policy requires gating native entry points to `Platform.OS==='web'`.
- **No money tied to views/likes** — engagement counters stay decorative until a fraud model exists.
- **Ship gating rule** — GO is disallowed while any Critical/High audit finding is open or any primary journey is incomplete.
- **Store submission deliberately deferred** until the first real transaction is proven; account enrollment (Stripe, Apple, Google, Expo) starts immediately due to lead times.

## Backend / data

- **Supabase is system of record; providers own media only** — ownership, state, moderation, commerce links, engagement, audit all stay in Supabase; Cloudflare/Mux own ingest/transcode/delivery.
- **App-controlled per-cycle subscription billing**, not naive Stripe recurring — the Stripe-native legacy path was retired to 410 stubs rather than left reachable.
- **SECURITY DEFINER RPC + `auth.uid()` gate + inline audit_log write** is the frozen backend idiom for all privileged writes.
- **Advisory locks + Stripe idempotency keys on every money-moving call** — the standard remediation pattern (payout, quote-accept, refunds, order creation).
- **Ambiguous Stripe errors leave state `pending`, not resolved** — protects against double-payout/double-charge at the cost of requiring manual reconciliation (no job exists yet — see [[Tasks]]).
- **`is_active_kitchen_owner()`** (ownership + verified) replaces bare `is_kitchen_owner()` for capability-bearing writes, so suspension actually revokes capability; read-only historical surfaces deliberately kept on the looser check.
- **Ground truth for "is it deployed" is the live database/functions, not git** — the audits repeatedly found merged-but-undeployed and deployed-but-unmerged drift in both directions.

## Provider choices

- **Cloudflare Stream (planned) for uploaded video** — Direct Creator Upload keeps tokens off the client; play raw HLS against pooled players, not the Stream iframe player.
- **AWS IVS for live (scaffold only, not built)** — native broadcast SDK requires a dev-build/EAS config the app doesn't ship yet; deferred to a post-sprint private beta. Hard security lock: no stream-key endpoint, no live-control RPC exposed.
- *(Note: an earlier, different Mux-based livestream implementation shipped 2026-07-13 and predates the Cloudflare plan; it's the one currently flag-disabled.)*

## Navigation / IA

- Feed added to the tab bar with nothing re-parented — an explicit founder override of the council's recommendation to hold the bar at 5 icons, accepted as a reversible, non-blocking tradeoff.
- No global center-Create menu, no For-You/Following dual feed, no comments (this sprint).

## Design

- **"Warm Trust" redesign** — single restrained accent + neutral canvas + warmth via photography, replacing gradient-saturated orange; gradients retired from default UI (kept only as image-loading fallback). Partially reversed in practice: the brand gradient was restored for Splash/Onboarding "for a premium first impression."

## Related

- [[Project]] · [[Architecture]] · [[Payments]] · [[Changelog]]
