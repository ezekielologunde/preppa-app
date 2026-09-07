---
project: Preppa
type: decisions
status: active
last_updated: 2026-09-07
tags: [project/preppa, type/decisions]
---

# Decisions

Part of [[Project]]. Extracted from `AUDIT.md`, `docs/REDESIGN-DIRECTION.md`, `SPRINT-27-FEED-VIDEO-PLAN.md`, and code comments.

## Legacy patterns explicitly not carried forward

An older, separate implementation lineage (pre-dating this repo) used patterns this codebase
deliberately does not repeat: email addresses as participant identifiers, relatively broad RLS
`update` permissions paired with trigger guards instead of tight policies, client-visible payment-
method enums (e.g. raw Cash/Venmo/Zelle choices), and public review-creation gated mainly on
caller identity before later hardening. The current model — `SECURITY DEFINER` RPC + `auth.uid()`
gate + inline `audit_log` write, server-priced money paths, Stripe as the sole payment rail — is
the one to keep hardening; don't reintroduce the looser patterns above even under time pressure.

## Payout reconciliation (2026-09-07)

- **A reconciler must never mint a new Stripe idempotency key for an existing payout row** — it only ever replays the original `payout_<id>` key (Stripe guarantees this returns the original transfer, never a second one) or looks the transfer up by `metadata.payout_id`. Minting a fresh key on a stuck row is exactly the double-payout risk the whole design exists to avoid.
- **An unresolvable stuck payout is parked as `needs_review`, never auto-failed** — freeing the reserved amount on a guess risks paying the cook twice if the original transfer actually landed. A human resolves it after checking the Stripe dashboard directly.
- **Migration history is reconstructed from the live database's own `supabase_migrations.schema_migrations` table**, not guessed or squashed into a single baseline — this preserves the real, git-bisectable history and lets each historical migration's rationale (kept in its own comments) survive intact.
- **New payout migrations vendor into the repo even though the corresponding pg_cron jobs already exist live** — the migration is the source of truth going forward; running it again in CI is a guarded no-op (`to_regnamespace('cron')` check) so local/CI environments without pg_cron aren't affected.

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
