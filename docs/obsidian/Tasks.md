---
project: Preppa
type: tasks
status: active
last_updated: 2026-09-09
tags: [project/preppa, type/tasks]
---

# Tasks

Part of [[Project]]. Outstanding work discovered during the audit — not a sprint backlog, a snapshot.

## Competitive gap analysis: Shef (2026-09-09)

Shef (shef.com) is the closest direct competitor — a home-cook meal marketplace, $142M raised (incl. a $73.5M Series B), operating/recruiting cooks nationwide since 2023. Researched via public web sources (help center, press, App Store/Trustpilot reviews, one investigative piece) — not a code audit, and several figures below are single-sourced or conflicting; verify before treating as fact. Sources noted inline.

**Real feature gaps worth considering:**
- [ ] **Referral program** (both referrer + referee get credit) — Shef has one live; Preppa's Rewards is fully hardcoded/disabled (`FLAGS.rewards=false`, see [[Features]]). Already known as placeholder; this confirms it's a real competitive gap, not just internal debt.
- [ ] **Quick "reorder"/"order again" action** — no evidence Preppa has one; also flagged as something Shef itself lacks and gets complained about (App Store reviews), so this is a chance to do better, not just match.
- [ ] **Cook "business-in-a-box" support** — Shef offers cooks help with menu photography, pricing guidance, and marketing as part of onboarding. Preppa's cook onboarding is verification-focused (docs, address, Stripe) with no equivalent success-support tooling.
- [ ] **Published state-by-state cooking/compliance guideline pages for cooks** — Shef publishes per-state guidance (CA, WA, IL, TX, NY, CO, etc.) reflecting cottage-food/MEHKO law variance. Preppa's compliance is currently "entirely an ops/legal responsibility, not something the code or docs check" (see [[PM-Onboarding]]) — worth at least a cook-facing help doc once a launch city is picked (Launch-Plan item 9).
- [ ] **Recurring-order discount** (Shef: ~10% off repeat orders from the same cook) — Preppa has subscriptions/plans already (cadence, rotating, capacity, trial) but no discount incentive specifically for repeat same-cook one-off orders. Minor, low priority.
- [ ] **Third-party courier delivery** (Shef delivers via DoorDash-style courier dispatch, free over $40) — Preppa's fulfillment model is cook-arranged pickup/delivery (`kitchens.supports_delivery`/`supports_pickup`), no courier-network integration found. May be a deliberate scope choice for a small-city launch rather than a gap — flag for a product decision, not an assumed must-build.

**Explicitly NOT to copy** (per one investigative source, [hngry.tv](https://www.hngry.tv/articles/a16z-backed-shef-plays-fast-loose-against-food-safety-regulations/) — allegations, not adjudicated fact, but a real cautionary signal): reports that Shef operates in cities without a legal home-kitchen framework (MEHKO or equivalent), uses intermediary pickup hubs that obscure the food was cooked in an uninspected home kitchen, and pushes legal-compliance liability onto individual cooks without specifying which laws apply where. Preppa's own single-city, cottage-food-law-aware launch approach (Launch-Plan item 9) is already the more conservative posture — keep it that way rather than drifting toward ambiguity for growth's sake.

**Already covered / not a gap:** weekly subscriptions, dietary filters/discovery, Stripe-based payouts, chat/notifications — Preppa already has equivalents. (Ratings/reviews exist but are much thinner than Shef's — see drill-down below, corrected from the first pass.)

**Unverified from this first pass, since corrected below where noted**: exact current cook payout percentage (sources conflict, ~75-85% range — still unconfirmed), which specific markets are MEHKO-legal for Shef today (still unconfirmed). The "AI-matching/group-ordering/catering — unshipped" claim was **wrong**: direct site inspection (below) confirms a live, real B2B/corporate ordering product.

## Drill-down: live product walkthrough vs. Preppa's actual code (2026-09-09)

Direct inspection of a live Shef cook storefront, discovery page, and business-orders landing page (logged-in session, real zip code), cross-checked against Preppa's own schema/screens (not just docs) — corrects and sharpens the pass above. Each item says what's verified on both sides, not assumed.

**Confirmed real, not previously verified — Shef has a live B2B/corporate ordering product** (`blog.shef.com/business-orders`): weekly office lunch delivery + corporate gifting, employees browse and pick their own meals within a company budget, "trusted by hundreds of companies," 100% satisfaction guarantee. This directly overturns the earlier pass's "no confirmed evidence, speculative only" note. Preppa has no B2B/corporate ordering concept anywhere in the schema — a real, confirmed gap, not a false lead. Low priority pre-launch (Cohort 0 is the actual blocker per [[PM-Onboarding]]), but worth remembering as a real post-launch expansion lever, not a maybe.

**Confirmed real gap — per-dish allergen disclosure and ingredient list.** Shef shows a full ingredient list plus an explicit allergen notice ("may contain — or be processed in a facility with — milk, peanuts, tree nuts, wheat, dairy, eggs, fish, shellfish, soy, or sesame") on every single dish. Checked Preppa's code directly: `foodSafety.allergens` (`src/lib/supabase.ts`) is only a cook's self-attestation **checkbox at onboarding** ("I handle allergens correctly") — grepped `app/meal/[id].tsx` for "ingredient"/"allergen" and found **zero matches**. Customers currently see no ingredient list or allergen warning on any meal, anywhere. This is a real food-safety/liability gap, arguably higher-priority than most cosmetic items on this list — recommend adding an `ingredients`/`allergens` field to the `meals` table and surfacing it on the meal detail screen before public launch.

**Confirmed real gap — review system is much thinner than Shef's.** Checked the schema directly (`reviews` table, `20260705122251_0003_trust.sql`): Preppa's review is `rating` (1-5) + free-text `body`, one per order, no photo, no tags. Shef's live reviews show the *actual customer-submitted photo* of the delivered dish, a thumbs-up/down per individual item within a multi-item order (not just one score for the whole order), and structured descriptor tags ("Restaurant quality," "Tasty," "Authentic Flavors") alongside free text. Per-dish rating percentages (e.g. "92% (10)") also surface directly on menu browse cards, not just the cook's aggregate score. Recommend, in priority order: (1) per-item rating within a multi-item order, since Preppa's `order_items` already exist and this is mostly a UI/RPC change; (2) review photo upload (the `PhotoUploader` component and upload pipeline already exist for other flows, so this is largely wiring, not new infra); (3) structured tag chips, lowest priority/most design work.

**Architectural difference, not a flat gap — cook-specific delivery-day calendar.** Shef structures ordering around each cook's specific cooking/delivery days (a date-by-date calendar showing "0 shefs" vs "37 shefs" available per day, "This shef is not available" for off days) — cooks batch-cook on set days. Preppa's model (checked `src/data/repository.ts`) has no per-cook scheduled-availability-day concept — a kitchen is simply `open`/`paused` and presumably fulfills on a more rolling/on-demand basis. Neither model is strictly better; this is a real product decision (batch-cook-days vs. rolling availability) worth making deliberately once Cohort 0 cooks reveal their actual real-world prep rhythm, not copying reflexively.

**Confirmed real, smaller gaps**: a "Popular" badge on trending dishes within a cook's own menu (separate from the cook-level "Top Shef" badge Preppa likely lacks entirely too — worth checking); dish-type categorization (Mains/Sides/Desserts) — Preppa's `Meal` type has no such field; a dish-rating-threshold filter (60%+/70%+/80%+/90%+) and a price-range filter ($/$$/$$$/$$$$) in Shef's discovery filter bar, beyond what Preppa's filters currently expose; "trending searches" suggestions (cuisine names) on the search/discovery entry point.

**Resolved on a second pass** (corrects the "unresolved" note from the first drill-down): Gift Cards/Promo Codes **are** real and live — confirmed at actual checkout, a working "Gift Card or Promo Code" field with an Apply button sits right above payment. The footer `/gift` link itself does appear to be dead/redirects to the homepage, but the feature exists via checkout, just not that particular entry point.

## Drill-down: UI/UX walkthrough — full cart-to-checkout flow (2026-09-09)

Went end-to-end through Shef's actual ordering flow (add to cart → cross-sell interstitial → checkout form) rather than just the storefront, and checked each finding against Preppa's real code (not assumptions).

**Persistent live cart panel, not a separate cart page.** Adding an item opens a right-side panel that stays mounted while browsing: a "You may also like" upsell carousel at the top, the delivery date (editable inline), subtotal + item count, a prominent Checkout button, per-item quantity steppers, and a real-time "You're $45.01 away from free delivery!" progress nudge. Preppa's cart is a dedicated `app/cart.tsx` screen you navigate to, not a persistent panel — not wrong, just a different (more traditional mobile-app) pattern. The free-delivery-progress nudge specifically is worth considering regardless of panel-vs-page: it's a proven low-effort AOV lever.

**Cross-cook order bundling — a real structural difference, not a UI gap.** Before checkout, Shef showed a "Multiple shefs. One delivery." interstitial offering to add another cook's side dishes to the *same* cart/delivery for no extra fee, with a one-tap "Add all 3 to cart for $19.47." This confirms Shef lets one delivery combine items from multiple different cooks. Preppa deliberately does the opposite — the changelog records "multi-cart (one order per cook)" as an intentional early fix, i.e. one order = one cook, by design. This is a real, load-bearing architectural difference (fulfillment/payout complexity goes up a lot if one order splits across cooks), not something to casually copy — but worth knowing it's a conscious trade-off against a competitor's actual live behavior, not an oversight.

**Confirmed real, verified-in-code gap — no digital wallet checkout (Apple Pay / Google Pay).** Shef's checkout offered Google Pay as a one-tap express option alongside manual card entry. Checked Preppa's actual Stripe integration: `initPaymentSheet()` (`src/lib/payments.ts:138`) passes only `paymentIntentClientSecret`/`merchantDisplayName`/customer fields — no `applePay`/`googlePay` config keys, and `CardPaymentSheet.tsx` (web) has zero references to wallet/Payment Request APIs either. Stripe supports both natively in `@stripe/stripe-react-native`'s PaymentSheet with just a few added init options, so this is a low-effort, high-conversion-impact gap — recommend enabling both before public launch, since one-tap wallet checkout is now a baseline user expectation in food delivery.

**Checkout form details worth matching**: a named, explicit "Delivery instructions" free-text field (separate from the address's apt/suite field) with a visible character counter; delivery **time-window** selection tied to the chosen address (not just a date) — Preppa's checkout structure wasn't re-verified in this pass but is worth checking for the same granularity.

**Navigation/IA details worth considering**: the slide-out nav drawer leads with two large, unmissable CTAs — a filled primary button for the subscription product, an outline secondary for one-time ordering — a deliberate visual hierarchy pushing the higher-LTV product first. The referral offer ("Give $60, Get $60") lives directly in this same top-level drawer, not buried in settings. A dedicated "Following" nav item lists cooks the customer follows — Preppa has `favorites`/`saved` routes per [[Frontend]] that likely cover similar ground; worth confirming they're surfaced with the same prominence rather than just existing as routes.

**Trust-badge density**: Shef stacks multiple small trust signals directly on every cook profile and dish card at once — aggregate star rating, review count, "Meals prepared" lifetime counter, a "Certified · Food safety" badge, a "Top Shef" ribbon, and (per-dish) a thumbs-up percentage — all visible without a tap. Worth a deliberate comparison against how many of these Preppa's own `cards.tsx`/storefront components already surface vs. how many exist in the data but aren't shown.

## Newly discovered (2026-09-07 session)

- [ ] **Confirm Stripe mode definitively** — evidence points to test mode (see [[Payments]] warning) contradicting the prior "LIVE since 2026-08-08" note; check the key prefix directly before either doc claim is trusted.
- [ ] **Test the native deep-link return path** — `connect-onboard`'s `?connect=return`/`?connect=refresh` redirect is proven on web; needs a real-device check that the universal link/app-scheme equivalent actually returns a cook to the app on iOS/Android after Stripe onboarding.
- [x] ~~Rotate the Resend API key found exposed in `api-keys-*.csv`~~ — **done 2026-09-08**, see [[Launch-Plan]] item 4.
- [ ] Recruit real cooks — the app is technically launch-ready end-to-end (onboarding, payments, payouts, reconciliation all proven), but zero real cooks means an empty marketplace on day one. This is manual business work, not an engineering task.
- [ ] Revisit instant payouts (debit card, ~1.5% Stripe fee) once the auto-sweep + reconciliation have run in production for a while — deliberately deferred, see [[Payments]] and [[Decisions]].
- [ ] Consider a real reconciliation job for `charge-due-cycles` (subscription billing) — it has the same ambiguous-error-leaves-row-pending pattern as payouts did, but no automated resolver was built for it this round.

## Security / ops hardening (from AUDIT.md's own recommended next steps)

- [x] ~~Confirm the Google OAuth client secret rotation~~ — **done 2026-09-08** (Critical #16 closed), see [[Launch-Plan]] item 4.
- [x] ~~Delete `app/mux-preppa.env` if it reappears; rotate the Mux token~~ — token rotated **2026-09-08**, see [[Launch-Plan]] item 4; file has not reappeared. Broadening `.gitignore` to `.env.*` still worth doing but low priority (no `.env*` file has ever been committed, per the git-history secret search this session).
- [x] ~~Build the payout/charge reconciliation job~~ — **done 2026-09-07** for payouts (see [[Payments]]); subscription-charge reconciliation is still open, see above.
- [x] ~~Rate-limit and alert on state-mutating admin RPCs~~ — rate limiting was already done 2026-07-15; alerting (real-time on role change/suspension + `detect_admin_anomalies()` cron for escalation bursts, suspend churn, refund volume, payment-failure bursts) added 2026-09-07. See [[Security]].
- [x] ~~Route admin alerts to a real destination~~ — **done 2026-09-07** via a scoped Resend API key (`resend_admin_alerts_api_key` Vault secret, sending-only, `preppa.live`-domain-restricted); `notify_admins()` emails both admins directly, verified live with a real test alert. The `admin_alert_webhook_url` Slack branch is still there, still unset, and not needed now.
- [x] ~~Fix Preppa's Auth SMTP sender~~ — **investigated 2026-09-08, turned out to be a false alarm.** A similarly-named `Supabase Auth SMTP` key was spotted in an unrelated Resend workspace and mistaken for Preppa's; a real OTP send (via the Auth REST API) confirmed Preppa's Auth SMTP already correctly sends from `noreply@preppa.live` through the right Resend account (`200`, logged). No change needed.
- [ ] Turn on branch protection on `main`; enable Dependabot security alerts (15 vulnerabilities flagged on push 2026-09-07: 10 high, 5 moderate — unreviewed); add `CODEOWNERS`.
- [x] ~~Vendor the remaining ~114 un-tracked live migrations~~ — **done 2026-09-07**, full 212-migration history restored; add a deploy-verification step diffing live Edge Function/RPC definitions against the repo is still open.
- [ ] Move session tokens to `expo-secure-store`; add a password-reset flow.
- [ ] Add a real regression test suite beyond the DB-level `supabase/tests/regressions.sql` (currently zero JS/TS tests, CI is `tsc --noEmit` + DB regressions only).
- [ ] Add `.env`/staging separation so not every build hits the live Supabase project and live Stripe mode.

## In-code "coming soon" surfaces

- [x] ~~Quotes payment — reconcile the "coming soon" UI copy with the working `accept-quote-and-deposit` backend~~ — **confirmed stale 2026-09-08**, no such copy exists in the current codebase; both quote-payment entry points already call the real backend flow.

## Dead-surface cleanup (found during Launch-Plan item 11, 2026-09-08)

- [ ] Remove the remaining `cod`-branch dead code now that checkout no longer offers it: `app/track.tsx`, `app/order/[id].tsx`, `app/(tabs)/orders.tsx`, `app/hub/order/[id].tsx`, `src/components/Handoff.tsx`'s `HandoffMode`, `src/store/store.tsx`'s `OrderFlow` type + seed mock order, `src/data/data.ts`'s `Cook.acceptsCod` field, and the demo line "Cash on delivery is fine?" in `app/chat/[cook].tsx`. None of these are currently reachable (checkout is Stripe-only), so this is cleanup, not a functional fix.
- [x] ~~Decide what to do with the 6 fake seed kitchens sitting in the live production `kitchens` table~~ — **done 2026-09-08**. Attempted full deletion (kitchens + their 30 orders/55 ledger entries/etc., all confirmed to be your own dev/admin/test accounts, no real customers) but it's genuinely impossible without weakening real safety guarantees: `ledger_entries` (all 6 kitchens), `subscription_events` (kitchen 1), and `messages` (kitchens 1 and 6) are all deliberately **append-only** tables (`block_mutation()` triggers), same protection class as `audit_log`. Every delete attempt correctly rolled back (nothing was ever partially deleted). Instead, set all 6 kitchens to `verification_status = 'rejected'`, `availability = 'paused'`, with a `rejection_reason` documenting why — permanently un-orderable, with real history (orders/ledger/messages) preserved intact per the ledger's own design intent.
- [ ] **Remove the `COOKS`/`KITCHEN_ID`/`seedCookForKitchen` client-side fallback system** — now provably dead for all customer traffic (the 6 kitchens it could ever resolve to are permanently `rejected`, so `seedCookForKitchen()` can never return a value for any RLS-visible kitchen). Not removed this round: `Meal.cook: CookId` (`src/data/data.ts`) is a *non-optional* field that real, non-seed meals also flow through via a `?? 'maria'` fallback (`src/data/supabaseRepository.ts:46`) — cleanly removing it means changing the `Meal` type and auditing every screen that reads `.cook` (broader than just the 8 screens that do `COOKS[cook]` lookups), which is a real refactor deserving its own careful pass against a codebase with zero JS/TS test coverage, not a rushed tack-on. See [[Launch-Plan]] item 11 and [[Decisions]].
- [ ] In-app camera broadcast for Go Live (currently external RTMP only — no official Mux RN SDK).
- [ ] Cash on delivery — currently a placeholder UI with no real payment path; needs held cards / deposits / KYC design.

## Feature flags currently off (planned, not shipped)

- [ ] Rewards / referral program.
- [ ] Livestreaming — needs moderation, suspension-propagation, and a kill switch before re-enabling.

## Sprint 27 (approved plan, not started — see `SPRINT-27-FEED-VIDEO-PLAN.md`)

- [ ] Slice 1: feed tab entry, post saves, commerce-card availability hardening, prepper "Post" affordance, funnel logging.
- [ ] Slice 2: follows table + toggle, All/Following filter.
- [ ] Slice 3 (gated on 8 security + 8 performance ship gates): Cloudflare Stream video upload, composer, pooled player.
- [ ] Slice 4 (defer): Meal Drops — only as a scheduled/expiring post on an existing meal, never a new entity.
- [ ] Slice 5 (scaffold only, broadcast is NO-GO): `VideoProvider` interface + `AwsIvsProvider` stub.

## Redesign ("Warm Trust", `docs/REDESIGN-DIRECTION.md`)

- [ ] Slices 2–6: Discover/Store/Meal detail, Cart/Checkout/Orders/Track, Feed+Experiences, Messages/Profile/PrepPlus/Rewards, Prepper Hub + Admin — none shipped yet (only Slice 0–1 foundation + Home).

## Cleanup

- [ ] Update `README.md` (stale demo-mode description) and `LAUNCH-ACCOUNTS.md` (stale unchecked boxes).
- [ ] Resolve the two divergent `GRAD` palette exports (`src/theme/theme.ts` vs `src/data/data.ts`).
- [ ] Reduce the 39-route reliance on `src/data/data.ts` mock data; audit which persisted-store seed data is still reachable.

## Related

- [[Project]] · [[Bugs]] · [[Security]] · [[Payments]] · [[Features]]
