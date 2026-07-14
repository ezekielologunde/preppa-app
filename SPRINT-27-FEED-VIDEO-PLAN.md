# Sprint 27 — Feed Navigation, Creator Video & Livestream Foundation
### Implementation Plan & Deliverables (planning artifact — **no code or DB changes applied yet**)

_Grounded in the live codebase (`preppa-app`, git repo) and Supabase project `fwidhpzwldneeaphrxgg`. Pressure-tested by a 4-lens expert council: backend/data-integrity, security red-team, mobile-video performance, product/IA-scope. Every SQL block below is a **proposed migration spec** — nothing here has been executed._

---

## 0. Executive summary & verdict

The sprint's headline goal — creator video in the feed — is an **extension of systems that already exist and are real**, not a new build. The feed is DB-backed today; `posts.media_type` already permits `'video'`; the webhook, notification, audit, RLS, and idempotent-RPC patterns needed for a secure upload pipeline are all present and confirmed-real. The council's unanimous directive: **reuse the frozen patterns; add zero new client-writable state.** Doing so makes ~12 of the 20 red-team attacks structurally impossible rather than merely defended.

**Verdict by slice:**

| Slice | Scope | Verdict |
|---|---|---|
| **1 — Feed as a real tab** | Feed in bottom bar + persist Save + harden commerce card + prepper "Post" affordance | **GO** |
| **2 — Follows** | `follows` table, follow/unfollow, single All/Following filter | **GO WITH ACCEPTED RISKS** (empty-state UX at ~8 kitchens) |
| **3 — Video upload** | posts migration + Cloudflare edge fn + webhook + composer + player | **GO WITH ACCEPTED RISKS** (new provider, cost, mobile upload) — gated on the 8 regression tests + 8 perf gates |
| **4 — Meal Drops** | model as a scheduled/expiring post (NOT a new entity) | **DEFER** — build only if 1–3 show engagement |
| **5 — Live (IVS)** | provider abstraction + `live_sessions` schema, dormant flag | **NO GO for broadcasting this sprint**; scaffold-only is GO |

**Cut from the original spec (council-recommended, endorsed):** 12-signal rule-based ranking, Meal Drops as a new entity/table, For-You/Following dual-feed, the global center-Create menu, comments. Engagement counters stay **decorative — no money tied to views/likes** until a fraud model exists.

---

## 1. Existing-system audit (what's real → reuse, don't rebuild)

`AUDIT.md` is stale (predates messaging, subscriptions, experiences, and the feed). Verified current state:

### Feed — REAL, DB-backed, but flat
- Tables `posts` and `post_likes` (both RLS-enabled, 0 rows today).
- `posts` columns: `id, kitchen_id, caption, tag, meal_id, cover_url, media_type text DEFAULT 'photo', video_url text NULL, like_count int, status text DEFAULT 'published', created_at`.
- **Live CHECK constraints (verified):** `posts_status_check = status IN ('published','removed')`; `posts_media_type_check = media_type IN ('photo','video')` → **video is already an allowed media type.**
- **Live RLS policies (verified):** `posts_public_read` = `status='published' AND kitchen verified`; `posts_owner_read` = owner sees all own rows regardless of status (this is what lets a creator preview drafts).
- Client seam: [`src/lib/feed.ts`](src/lib/feed.ts) — `fetchFeed`, `createPost`, `togglePostLike`, `fetchMyMenuMeals`.
- UI: [`app/(tabs)/feeds.tsx`](app/(tabs)/feeds.tsx) — full-screen vertical paging `FlatList` (`pagingEnabled`, `getItemLayout`, `windowSize=3`), one memoized `<Reel>` per item, photo cover via `GradBox`/expo-image + gradient, like/share/save rail, meal-pin "Order" CTA. **No sections, no ranking, no follows. Save is ephemeral `useState` (never persists). The commerce card trusts a cached `mealId` with no availability check (bug — see §7.4).**
- Poster: [`app/hub/post-reel.tsx`](app/hub/post-reel.tsx) — photo-only, web-only upload; literally says "Short video is coming soon."

### Backend conventions — REAL, reuse verbatim
- **SECURITY DEFINER RPCs** with `auth.uid()` gate + inline `audit_log` write. `create_post` finds the caller's *verified* kitchen and validates that a featured meal belongs to that kitchen; `toggle_post_like` maintains `like_count` **inside** the RPC via `get diagnostics row_count` + `ON CONFLICT DO NOTHING` (the idempotent-counter idiom).
- `notify(p_user, p_kind, p_title, p_body)` — exception-swallowing notification helper. `is_admin()`.
- `audit_log(actor_id, action, entity, entity_id, meta jsonb, created_at)`; `notifications(user_id, kind, title, body, read_at, created_at)`.
- **`stripe-webhook`** (edge fn, `verify_jwt:false`) is the Supabase Stripe Sync Engine: signature verified via `constructEventAsync`; idempotency is **intrinsic to natural-key `ON CONFLICT` upserts** (no separate dedupe table); business logic runs in DB triggers. This is the literal template for the media webhook.
- **Cron workers** `charge-due-cycles`, `stripe-worker` (`verify_jwt:false`) — the template for a reconciliation sweeper.
- **`subscription_events(event, from_status, to_status, actor, meta, created_at)`** — the precedent for a state-transition log; reuse this shape if we add `post_events`, don't invent one.
- RLS on all 45 tables; append-only `ledger_entries` with `block_mutation`.

### Design system — REAL, reuse
- Tokens [`src/theme/theme.ts`](src/theme/theme.ts) (`GRAD`, palettes, `radius`, `type()`, `shadow`); primitives `src/ui/*` (`Icon`, `Press`, `GradBox`, `Screen`, `TopBar`, `Dock`); feature flags [`src/config/flags.ts`](src/config/flags.ts) (`feed: true`). Hub form kit (`KField/KInput/KChoice/KBtn`) exported from `my-hub`. **No parallel feed design system is needed or permitted.**

### Duplication flags (reject these — they violate the freeze)
1. `video_post_links` — premature; a short video is 1:1 with its post; every attribute fits on `posts`.
2. Any bespoke "media events sync engine" mirroring the Stripe Sync Engine — reuse the *signature + natural-key idempotent transition* idiom in a small handler; don't rebuild an engine.
3. Copying `meals`/`services` price/title into any pinned-entity table — reference by id, resolve at read time.
4. Re-inlining the verified-kitchen gate in a second RPC — extract `current_verified_kitchen()` and share it.
5. A new notification/audit path — reuse `notify()` + `audit_log`.

---

## 2. Provider decision record

### Uploaded short video → **Cloudflare Stream** ✅
- **Why:** Direct Creator Upload lets the client PUT bytes straight to Cloudflare without exposing the account token; provider-side encoding → HLS; automatic thumbnails; signed playback available. Bytes never traverse Supabase Edge/Storage (a hard constraint).
- **Pricing model:** storage billed per stored minute ($5 / 1,000 stored min), delivery billed per **delivered (viewed) minute** ($1 / 1,000 delivered min). **Delivery cost is set by client playback behavior** — see the cost analysis (§14).
- **Integration surface:** one edge function to mint a one-time upload URL; one webhook to confirm encoding; raw HLS manifest (`.../manifest/video.m3u8`) played against our own pooled players (NOT the Stream iframe player — opaque, un-poolable, budget-hostile).

### Live broadcasting → **AWS IVS behind an adapter, scaffold only** ⏸️
- **Why IVS (later):** native broadcast SDK, low-latency playback, separate IVS Chat product.
- **Hard caveat:** the native broadcast SDK means **Expo Go is insufficient — requires an Expo dev build / EAS native config.** The app ships web-first today. Therefore live broadcasting is **deferred to a post-sprint private beta**; this sprint ships only the provider-neutral abstraction + dormant schema + `FLAGS.live=false`.
- **Security lock (this sprint):** ship **no** endpoint that returns a stream key and **no** live-control RPC. Keep `live_sessions.stream_key` server-only (no RLS SELECT grant, even to owners).

### System-of-record split
Supabase remains authoritative for ownership, post/publication state, moderation state, commerce links, engagement, and audit. Provider APIs own media ingest, transcode, and playback delivery only.

---

## 3. Navigation / Information Architecture

**Your decision: add Feed to the bar, change nothing else.** Implemented as:

- Add `feeds: { ico: 'video', lbl: 'Feed' }` to the `TABS` map in [`app/(tabs)/_layout.tsx`](app/(tabs)/_layout.tsx) (route already registered + flag-gated).
- Add the Feed entry to [`src/components/SideRail.tsx`](src/components/SideRail.tsx) (wide-screen ≥700px nav) so the rail and bar agree.
- Resulting bars: **customers see Home · Experiences · Feed · Orders · Profile (5)**; **approved preppers see 6** (My-Hub is prepper-only and stays).

**Tradeoff noted (your call overrides the council recommendation, which is fine):** the reviewers recommended re-parenting Experiences → Home/Discover and My-Hub → Profile to keep the bar at 5 and match the approved marketplace reframe. Keeping all surfaces means approved preppers get a 6-icon bar. This is reversible later; it does not block the sprint. `discover` remains a pushed route (not a tab), unchanged.

**No global center-Create menu.** The prepper creation actions already live correctly in My-Hub. For the feed, the only new create affordance is an **approved-prepper-only "Post" button in the Feed header** deep-linking to the (extended) `post-reel` composer.

**Feed sections:** ship a **single feed** in Slice 1 (reverse-chron). Add a **single All/Following segmented filter** in Slice 2 (defaults to All). **No For-You/Meal-Drops/Live section tabs this sprint** (no content, no ranking, no drops entity, no live).

---

## 4. Data model — migration spec (proposed; **NOT applied**)

**Decision: keep `status` as text + widen the CHECK. Do NOT convert to a native enum** — `create_post`, `toggle_post_like`, and both RLS policies compare `status` to text literals; an enum forces `::text` casts everywhere and is awkward to evolve. Table is 0 rows, so the migration is trivial either way; extensibility is the tiebreaker.

### 4.1 Extend `posts` (Slice 3)
```sql
-- widen status; keep DEFAULT 'published' (create_post writes it explicitly; video path always sets 'draft')
alter table posts drop constraint posts_status_check;
alter table posts add constraint posts_status_check
  check (status in ('draft','processing','scheduled','published','removed','failed'));

alter table posts
  add column moderation_status text not null default 'approved'
    check (moderation_status in ('pending','approved','rejected','flagged')),
  add column provider text check (provider in ('cloudflare_stream')),
  add column provider_asset_id text,
  add column provider_upload_id text,
  add column provider_playback_id text,
  add column duration_ms int,
  add column width int,
  add column height int,
  add column scheduled_for timestamptz,
  add column published_at timestamptz,
  add column visibility text not null default 'public'
    check (visibility in ('public','followers','unlisted')),
  add column comments_enabled boolean not null default true,
  add column updated_at timestamptz not null default now();

-- ownership + idempotency anchor: one post per provider asset
create unique index posts_provider_asset_uidx
  on posts (provider_asset_id) where provider_asset_id is not null;

-- keep updated_at fresh
create trigger posts_set_updated_at before update on posts
  for each row execute function set_updated_at();  -- reuse existing helper if present, else add
```
- `video_url` (existing) is legacy for the photo path; for video, derive the HLS manifest from `provider_playback_id` at read time. **A URL is never the readiness signal** — visibility is governed by `status` + `moderation_status`.
- `aspect_ratio`: derive from `width/height` at read time; no column.

### 4.2 Fold moderation into the read policy (Slice 3 — **required line item**)
```sql
-- the ONE policy that keeps non-published/unmoderated rows invisible
drop policy posts_public_read on posts;
create policy posts_public_read on posts for select using (
  status = 'published'
  and moderation_status = 'approved'
  and exists (select 1 from kitchens k
              where k.id = posts.kitchen_id
                and k.verification_status = 'verified'::verification_status
                -- and k not suspended  (add the existing suspension predicate)
  )
);
-- posts_owner_read stays as-is (owner previews own drafts).
```

### 4.3 Engagement tables (Slice 1: saves; Slice 2: follows; Slice 3: views)
```sql
create table post_saves (
  post_id uuid not null references posts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  kitchen_id  uuid not null references kitchens(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, kitchen_id)
);
create table post_views (
  post_id uuid not null references posts(id) on delete cascade,
  viewer_id uuid not null references profiles(id) on delete cascade,
  view_day date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  primary key (post_id, viewer_id, view_day)  -- anti-replay: one counted view per user per day
);
-- add view_count int not null default 0 to posts in the Slice 3 migration
-- RLS: owner-scoped inserts via RPC only; counts read through the feed query. No client UPDATE on counters.
```

### 4.4 Live schema (Slice 5 — created dormant)
```sql
create table live_sessions (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references kitchens(id),
  provider text check (provider in ('aws_ivs')),
  provider_channel_id text, provider_stream_id text, playback_id text,
  stream_key text,                     -- SECRET: no RLS SELECT grant, ever
  status text not null default 'draft'
    check (status in ('draft','scheduled','ready','starting','live','reconnecting','ended','failed','suspended','replay_processing','replay_ready')),
  title text, description text,
  scheduled_start_at timestamptz, started_at timestamptz, ended_at timestamptz,
  replay_asset_id text,                -- when archived → also create a normal posts row referencing this
  visibility text default 'public', chat_enabled boolean default false, orders_enabled boolean default true,
  moderation_status text default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table live_pinned_entities (
  live_session_id uuid not null references live_sessions(id) on delete cascade,
  entity_type text not null check (entity_type in ('meal','plan','experience','kitchen')),
  entity_id uuid not null,             -- reference only; resolve price/title/availability at read time
  position int not null default 0,
  pinned_at timestamptz not null default now(), unpinned_at timestamptz,
  primary key (live_session_id, entity_type, entity_id)
);
```

---

## 5. Server functions — RLS & RPCs

### 5.1 Shared gate (Slice 3) — eliminate the drift hazard
```sql
create or replace function current_verified_kitchen() returns uuid
language sql stable security definer set search_path=public as $$
  select id from kitchens
  where owner_id = auth.uid() and verification_status = 'verified'::verification_status
  -- and not suspended
  order by created_at desc limit 1
$$;
```
Refactor `create_post` to call it; the new video RPC calls it too. **One definition of the trust gate.**

### 5.2 `create_video_draft(...)` — SECURITY DEFINER RPC (Slice 3)
Signature: `(p_provider_asset_id text, p_provider_upload_id text, p_caption text, p_tag text, p_meal_id uuid) returns uuid`.
- `v_kitchen := current_verified_kitchen();` → raise if null.
- Validate `p_meal_id` (if set) belongs to `v_kitchen` (existing `create_post` rule; extend to any transactable link type later).
- Insert `posts(kitchen_id, caption, tag, meal_id, media_type='video', status='draft', moderation_status='pending', provider='cloudflare_stream', provider_asset_id, provider_upload_id)`.
- `insert audit_log('video_upload_created','post',v_post,jsonb_build_object('kitchen',v_kitchen,'asset',p_provider_asset_id))`.
- Return `post_id`. **`provider_asset_id` is bound to the kitchen here, at mint time** — the linchpin that makes the webhook safe.

### 5.3 Engagement RPCs (copy the `toggle_post_like` idiom)
- `toggle_post_save(p_post uuid) returns boolean` (Slice 1) — delete/insert on `post_saves`, `on conflict do nothing`.
- `toggle_follow(p_kitchen uuid) returns boolean` (Slice 2).
- `record_post_view(p_post uuid) returns void` (Slice 3) — `insert into post_views ... on conflict do nothing`; **only when `row_count > 0`** does it `update posts set view_count = view_count + 1`. A "meaningful view" (≥3s / ≥N%) is asserted by a client param but corroborated by the per-user-per-day dedup + rate limit — never accepted as a raw increment. Authoritative counts are authenticated-only; anon views are telemetry-only.

**Golden rule:** no client `UPDATE` policy on any counter column. Every counter moves only inside a definer RPC gated on an actual insert/delete.

---

## 6. Cloudflare direct-upload integration (Slice 3)

**Edge function `create-video-upload` (`verify_jwt:true`):**
1. Authenticate (JWT → `auth.uid()`).
2. **Authorize before minting** — verified + non-suspended kitchen check (reject pending applicants here, server-side).
3. Enforce **per-kitchen quota** (daily posts + concurrent pending uploads) — server-authoritative.
4. Call Cloudflare **Direct Creator Upload** with **`maxDurationSeconds`** (10–90s window) + max size set **server-side** (client cannot raise them) → get `{ uploadURL, uid }` (one-time URL, short TTL).
5. Call `create_video_draft(uid, upload_id, caption, tag, meal_id)` passing the JWT through (so `auth.uid()` resolves).
6. Return **only** `{ post_id, upload_url, expires_at, max_duration_s }`. **Never return or embed the CF account token.** Token lives in function env (same posture as Stripe secrets). Prefer a CF token scoped to Stream-upload only (least privilege).

**Client (`post-reel` composer + `src/lib/feed.ts`):** PUT bytes directly to `upload_url` (resumable **tus** where supported for flaky mobile). Support progress, cancel, retry, resume, expired-URL re-mint, app-restart recovery. **Client never marks a post ready.**

---

## 7. Client work

### 7.1 Video player architecture (Slice 3)
- **`expo-video` on native** (SDK 57 supported primitive; do **NOT** add deprecated `expo-av`). **Hand-rolled `<video>` + `hls.js` on web** via platform-split files (`Player.web.tsx` / `Player.native.tsx`) — because only Safari plays HLS in a bare `<video>`; Chrome/Firefox need hls.js, and web is the shipped surface. Feature-detect: native HLS if `video.canPlayType('application/vnd.apple.mpegurl')`, else `Hls.isSupported()`.
- **Pool of 3 recycled players** (`active`, `next`, `spare`) owned by a manager **outside** the list rows; bind by index on `onViewableItemsChanged` (stable ref, `itemVisiblePercentThreshold:80`, `minimumViewTime:150ms`). Recycle via `player.replace()` (native) / `hls.loadSource()` (web) — never recreate per scroll (leaks MediaSource on Chrome). **Keep FlatList; do not add FlashList this sprint.**
- Lifecycle: single `AppState` + web `visibilitychange`/`pagehide` listeners pause/release; extend the existing `useFocusEffect` in `feeds.tsx` to release the pool on tab blur; `hls.stopLoad()`+`detachMedia()` for distant items; `hls.destroy()` only on feed unmount. Muted autoplay (web autoplay is illegal unmuted); remember mute pref per session; poster-first (existing `GradBox` cover) so idle rows deliver zero Stream minutes.

### 7.2 Feed UI (Slices 1–3)
- Slice 1: no structural change beyond persisting Save + hardening the card. Slice 2: All/Following filter. Slice 3: `<Reel>` renders the pooled player surface for the active video item; photo items unchanged.

### 7.3 Composer (Slice 3) — extend `post-reel.tsx`, do not fork
Add a video path alongside the photo path: choose/record → trim to 10–90s → pick cover frame → caption → tag meal/plan/experience/kitchen → cuisine/dietary tags → comments/visibility → upload (progress/cancel/retry) → processing state → preview → publish or schedule → draft state. Client validation (container/codec/duration/size/non-zero) is **UX only**; server + provider validation are authoritative.

### 7.4 Commerce card hardening (Slice 1) — **fixes a live bug**
Today [`feeds.tsx:106`](app/(tabs)/feeds.tsx) renders "Order" whenever `f.mealId` is set, trusting the cached post — it will show a live Order on a sold-out/unlisted/paused-kitchen meal. Fix: the feed query resolves **live meal state** (`status='live'`, in-stock, kitchen active) server-side; the card reflects it (Order → "Sold out" / "Notify me" / hidden); **re-verify at add-to-cart** (`create-order` already does server-side re-pricing + re-validation — reuse it, add no new order path). This is the primary anti-cannibalization guardrail.

### 7.5 Save persistence (Slice 1)
Replace the ephemeral `saved` `useState` with `toggle_post_save`; surface saved posts in **Profile → Saved** as a re-order shortlist.

---

## 8. Ranking v1 (Slice 2+, minimal)

**No 12-signal engine.** At ~8 kitchens and near-zero content it's unfalsifiable. Ship reverse-chron with two cheap, explainable boosts computed server-side: **followed kitchen** and **near the user / in service area**. Keep any weights server-configurable. Revisit a richer score only above a real posts/week threshold. Protections that matter now: don't let one creator dominate (simple per-kitchen cap per page), don't rank by client-supplied numbers.

---

## 9. Livestream foundation (Slice 5, scaffold only)

`VideoProvider` TS interface: `createUpload / getAsset / deleteAsset / createLiveChannel / createBroadcastCredentials / getPlaybackConfiguration / stopLive / getLiveStatus / verifyWebhook / getRecording`. Implement `CloudflareVideoProvider` for the upload/asset/webhook methods (used by Slice 3). Provide an **`AwsIvsProvider` scaffold** (throws "not enabled") for the live methods. Create `live_sessions` / `live_pinned_entities` dormant (§4.4). Add `FLAGS.live=false`. **No stream-key endpoint, no live-control RPC, no broadcast UI this sprint.**

---

## 10. Moderation & safety control plane (design; enforcement lands with content)

Reuse admin patterns ([`app/admin/*`](app/admin), `is_admin()`). Capabilities to design now, wire as content appears: admin remove post/terminate live, prepper end live, report content, disable comments, remove pinned listing, blocked-word filter, **account-suspension propagation** (suspended kitchen's posts drop from `fetchFeed` via the verified+not-suspended predicate; commerce blocked at every money entry point — `create-order`, payout, future live-start — not just at creation), incident audit trail via `audit_log`, replay retention policy. **Soft-delete/remove, never hard-delete** (matches the append-only posture). Comments deferred → their moderation deferred with them.

---

## 11. Notifications (Slice 3+)

Add `notify()` kinds: `video_ready`, `video_failed`, `video_published`, `followed_prepper_posted`, `replay_ready`. (Live kinds deferred with live.) Respect prefs; **dedupe + frequency-cap** per kitchen; do **not** notify on every upload/engagement event. Publish is webhook-driven (not client-triggerable) + quota-capped, so notification amplification is already bounded.

---

## 12. Security red-team summary → the 8 must-pass regression tests

Full threat model is in the council record; the non-negotiable gates before **any** ship of Slice 3:

1. **CF account token never in client bundle/network**; upload URL only ever minted by the edge function. (grep bundle + network capture)
2. **Unsigned / bad-signature media webhook rejected before any DB write.**
3. **Valid-signature webhook whose `provider_asset_id` isn't server-bound to the claiming kitchen is rejected; cannot flip ownership.** (never INSERT from a webhook)
4. **Replayed/duplicate webhook is a no-op** (conditional keyed UPDATE `WHERE status='processing'`).
5. **Pending/suspended prepper cannot mint an upload URL or create a video post** (server-side, not client-gated).
6. **Cross-tenant video update/insert returns 0 rows / 403** — A cannot set B's `video_url`/`status`; A cannot feature B's meal.
7. **A `pending`/unencoded/unmoderated post is never returned by `fetchFeed`; client cannot force `published`.**
8. **Ordering a video-linked entity re-runs the transaction-readiness gate at `create-order`** — archived/suspended/sold-out from a video card fails server-side.

Tests 1–4 (the CRITICALs + replay) are absolute blockers.

---

## 13. Test plan

- **Contract:** feed query (shape + availability resolution), `create-video-upload` (auth/quota/mint), engagement RPCs.
- **Webhook:** signature verify, idempotency/replay, ownership-binding rejection, ready-only transition, failed-encode → `failed`.
- **RLS/ownership:** cross-tenant read/update; draft invisibility; owner-preview.
- **Upload:** interruption, expired-URL re-mint, restart recovery, cancel.
- **Playback lifecycle:** active-only autoplay, background pause, teardown, pagination, pull-to-refresh.
- **Engagement anti-replay:** like/save/view dedup.
- **Commerce-link availability:** sold-out/archived/suspended never orderable.
- **Live authorization + permanent-key exposure** (asserts no key endpoint exists).
- **Notification dedup.**
- **Env discipline:** tests run against local/staging only; **fail immediately if required env vars are absent; no production URL fallback.**

---

## 14. Cost-control analysis (Cloudflare Stream)

Delivery is billed per **delivered (viewed) minute**, so client behavior sets the bill. Blow-up multipliers: autoplay-on-scroll-through, deep prefetch, looping-while-idle, rebuffer thrash, the iframe player. Guardrails (each also a perf gate):
- **`minimumViewTime` debounce (150–250ms)** → a fast scroll delivers zero seconds (kills the scroll-through multiplier).
- **Prefetch depth = 1**, manifest-first; `hls.stopLoad()` on non-active players.
- **Cap loops** (play-once-then-poster, or 2–3 loops then tap-to-replay); never loop while backgrounded/blurred.
- **Constrain ABR / start rendition** on mobile; low `maxBufferLength` (10–15s).
- **Poster-first** idle rows (free thumbnail).
- **Reconcile weekly:** in-app delivered-seconds estimate vs Cloudflare dashboard; per-DAU delivered-minutes alert. **Target: delivered ≈ watched × ~1.15.** If delivered runs 2–3× watched, a guardrail is broken — treat as a gate failure.
Storage: 10–90s clips at ~$5/1,000 stored-min is negligible at pilot volume; the risk is delivery, not storage.

### Performance ship gates (Slice 3 blockers)
| Gate | Threshold |
|---|---|
| G1 memory release | heap after 100 items ≤ 1.3× after 20; returns toward baseline on back-scroll/tab-leave; ≤3 player instances |
| G2 single autoplay | max concurrent `playing` == 1 (zero tolerance) |
| G3 prefetch | ≤ active+1 fetching segments; items ≥2 away fetch nothing |
| G4 bounded cache | feed cache LRU-capped; hls back-buffer capped |
| G5 upload state | leaving/backgrounding cancels or suspends upload; no orphaned upload after unmount |
| G6 nav not blocked | navigation begins ≤100ms of tap regardless of playback |
| G7 first-frame | median ≤1000ms, p90 ≤2000ms |
| G8 rebuffer ratio | median ≤2% of watch time |
Measure authoritatively in Chrome DevTools against `expo start --web` (Performance/Memory/Network), confirm on a native dev build before pilot. Capture a **photo-feed baseline before video lands**.

---

## 15. Rollback plan

- **Feature flags first:** `FLAGS.feed` gates the entire feed surface (already present); add `FLAGS.feedVideo` and `FLAGS.live`. Flipping `feedVideo=false` hides the video path and composer video option — instant, no deploy needed if flags are client-read.
- **DB is additive + reversible:** all Slice 3 changes are new columns/tables + a widened CHECK + one policy rewrite. Rollback = re-narrow the CHECK (safe: video rows would be gated off by the flag) and `drop column`/`drop table` for the additive objects; the policy rewrite has a captured pre-image (follow the existing backup-then-mutate governance pattern). 0 rows today makes this clean.
- **Edge functions** are independently deployable/removable; removing `create-video-upload`/`media-webhook` disables the pipeline without touching the photo feed.
- **Provider:** Cloudflare assets are external; a kill switch on `create-video-upload` stops new spend immediately.
- **Per-slice:** each slice is shippable and reversible on its own; Slice 1 is fully behind `FLAGS.feed`.

---

## 16. Slice sequence & definitions of done

**Slice 1 — Feed as a real tab (GO).** Add `feeds` to `TABS` + SideRail; persist Save (`post_saves` + `toggle_post_save`) → Profile → Saved; harden the commerce card (server-resolved availability at view + re-check at checkout); prepper-only "Post" in Feed header. Log feed-attributed funnel events (impression → tap → cart → order). Kill switch: `FLAGS.feed`. **Done =** bar shows Feed; like works; Save persists and appears in Profile → Saved; sold-out/unlisted never shows a live Order; approved preppers see "Post", others don't; funnel events logged; no regressions to Experiences/My-Hub/Orders/subscriptions.

**Slice 2 — Follows (GO WITH RISKS).** `follows` + `toggle_follow`; follow on storefront + feed author; single All/Following filter (default All); auto-suggest verified kitchens to seed follows. **Done =** follow persists; Following filter shows only followed kitchens' posts; empty-following still sees All by default.

**Slice 3 — Video upload (GO WITH RISKS, gated).** The §4–§7 migration + edge fn + webhook + reconciliation cron + composer + pooled player. **Done =** a prepper uploads a ≤90s clip web-side; it stays invisible until Cloudflare confirms ready; then it plays in the feed with active-only autoplay; all 8 security tests pass; all 8 perf gates pass; delivered ≈ watched × ~1.15 in a scripted session.

**Slice 4 — Meal Drops (DEFER).** Model as a scheduled/expiring post on an existing meal (available-at + qty), reusing `posts`+`meals`. No new table/checkout path. Build only if 1–3 show engagement.

**Slice 5 — Live scaffold (scaffold GO / broadcast NO-GO).** `VideoProvider` interface + `CloudflareVideoProvider` + `AwsIvsProvider` stub + dormant `live_sessions`/`live_pinned_entities` + `FLAGS.live=false`. No key endpoint, no control RPC, no UI.

---

## 17. Final verdict

**GO** — begin with **Slice 1** (reversible behind `FLAGS.feed`, mostly wiring an already-built surface into the bar plus one small table and one availability join). **GO WITH ACCEPTED RISKS** for Slices 2–3, each gated on its definition of done and (for Slice 3) the 8 security tests + 8 perf gates. **NO GO** for live broadcasting, Meal Drops as an entity, a 12-signal ranker, For-You/Following dual-feed, the center-Create menu, and comments — this sprint.

Livestreaming is **not** production-ready and this plan does not pretend one successful broadcast would make it so: it requires authorization, moderation, recovery, observability, cost controls, and verified behavior under network interruption — all deferred to a gated beta on an Expo dev build.

_Next action on approval: execute Slice 1 (implementation + the `post_saves` migration to prod behind the flag), then stop for review before Slice 2._
