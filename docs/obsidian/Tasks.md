---
project: Preppa
type: tasks
status: active
last_updated: 2026-09-17
tags: [project/preppa, type/tasks]
---

# Tasks

Part of [[Project]]. Outstanding work discovered during the audit — not a sprint backlog, a snapshot.

## Competitive gap analysis: Shef (2026-09-09)

Shef (shef.com) is the closest direct competitor — a home-cook meal marketplace, $142M raised (incl. a $73.5M Series B), operating/recruiting cooks nationwide since 2023. Researched via public web sources (help center, press, App Store/Trustpilot reviews, one investigative piece) — not a code audit, and several figures below are single-sourced or conflicting; verify before treating as fact. Sources noted inline.

**Real feature gaps worth considering:**
- [ ] **Referral program** (both referrer + referee get credit) — Shef has one live; Preppa's Rewards is fully hardcoded/disabled (`FLAGS.rewards=false`, see [[Features]]). Already known as placeholder; this confirms it's a real competitive gap, not just internal debt.
- [x] **Quick "reorder"/"order again" action** — implemented and hardened 2026-09-25. Order detail resolves historical items against the current live catalog, uses current prices and photos, preserves the original fulfillment mode, omits unavailable items with explicit feedback, and does not navigate to an empty cart when the kitchen is closed or the request fails.
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

- [x] ~~No digital wallet checkout (Apple Pay / Google Pay)~~ — **Google Pay done 2026-09-09, Apple Pay wired but blocked on an external account step.** Web: a Stripe Payment Request Button now sits alongside the card form in `CardPaymentSheet.tsx` for real-charge flows. Native: Google Pay is on unconditionally in `payWithCard()`. Apple Pay's code path exists (`StripeRoot.tsx`'s `merchantIdentifier`, `initPaymentSheet`'s `applePay` option) but stays inert until `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID` is set — that needs an Apple Merchant ID created in the Apple Developer Portal and registered with Stripe, both requiring the user's own Apple Developer Program access. See [[Payments]].

**Checkout form details worth matching**: a named, explicit "Delivery instructions" free-text field (separate from the address's apt/suite field) with a visible character counter; delivery **time-window** selection tied to the chosen address (not just a date) — Preppa's checkout structure wasn't re-verified in this pass but is worth checking for the same granularity.

**Navigation/IA details worth considering**: the slide-out nav drawer leads with two large, unmissable CTAs — a filled primary button for the subscription product, an outline secondary for one-time ordering — a deliberate visual hierarchy pushing the higher-LTV product first. The referral offer ("Give $60, Get $60") lives directly in this same top-level drawer, not buried in settings. A dedicated "Following" nav item lists cooks the customer follows — Preppa has `favorites`/`saved` routes per [[Frontend]] that likely cover similar ground; worth confirming they're surfaced with the same prominence rather than just existing as routes.

**Trust-badge density**: Shef stacks multiple small trust signals directly on every cook profile and dish card at once — aggregate star rating, review count, "Meals prepared" lifetime counter, a "Certified · Food safety" badge, a "Top Shef" ribbon, and (per-dish) a thumbs-up percentage — all visible without a tap. Worth a deliberate comparison against how many of these Preppa's own `cards.tsx`/storefront components already surface vs. how many exist in the data but aren't shown.

## Newly discovered (2026-09-09 session)

- [ ] **Create an Apple Pay merchant ID** (Apple Developer Portal, needs the user's own Apple Developer Program account) **and register it with Stripe**, then set `EXPO_PUBLIC_APPLE_PAY_MERCHANT_ID` in `eas.json` — the only remaining step to activate Apple Pay. All app code is already wired and waiting on this value; see [[Payments]].

## Newly discovered (2026-09-07 session)

- [ ] **Confirm Stripe mode definitively** — evidence points to test mode (see [[Payments]] warning) contradicting the prior "LIVE since 2026-08-08" note; check the key prefix directly before either doc claim is trusted.
- [ ] **Test the native deep-link return path** — `connect-onboard`'s `?connect=return`/`?connect=refresh` redirect is proven on web; needs a real-device check that the universal link/app-scheme equivalent actually returns a cook to the app on iOS/Android after Stripe onboarding.
- [x] ~~Rotate the Resend API key found exposed in `api-keys-*.csv`~~ — **done 2026-09-08**, see [[Launch-Plan]] item 4.
- [ ] Recruit real cooks — the app is technically launch-ready end-to-end (onboarding, payments, payouts, reconciliation all proven), but zero real cooks means an empty marketplace on day one. This is manual business work, not an engineering task.
- [ ] Revisit instant payouts (debit card, ~1.5% Stripe fee) once the auto-sweep + reconciliation have run in production for a while — deliberately deferred, see [[Payments]] and [[Decisions]].
- [x] ~~Add a reconciliation worker for `charge-due-cycles`~~ — completed locally 2026-09-25. `reconcile-cycle-charges` searches the customer's original PaymentIntents by cycle metadata, applies the authoritative status, rejects amount/currency mismatches into admin review, and releases a no-match only after 24 hours. Production migration and function deployment remain launch gates.
- [x] ~~Protect booking balance collection from ambiguous Stripe responses~~ — completed locally 2026-09-25. The booking records a durable charge claim before contacting Stripe, pending confirmation is shown truthfully to both parties, and `reconcile-booking-balances` resolves the original PaymentIntent without creating another charge. Production migration, worker deployment, and controlled Stripe acceptance remain launch gates.
- [x] ~~Recover checkout after a lost successful-payment response~~ — completed locally 2026-09-25. Reusing the same checkout key now returns the existing paid order when either the database or Stripe confirms success, and web/native checkout proceeds to order tracking without attempting another confirmation.
- [x] ~~Recover quote and experience booking payments after a lost response~~ — completed locally 2026-09-25. Both flows resume the original PaymentIntent or return the confirmed booking, and experience retries cannot create another active booking for the same customer and session.
- [x] ~~Make membership retries and resubscription distinct~~ — completed locally 2026-09-25. PrepPlus and Cook Pro reuse the same Stripe request after an ambiguous response, use a new key after a canceled subscription, report provider uncertainty truthfully, and fail when the local entitlement row cannot be persisted.

## Security / ops hardening (from AUDIT.md's own recommended next steps)

- [x] ~~Confirm the Google OAuth client secret rotation~~ — **done 2026-09-08** (Critical #16 closed), see [[Launch-Plan]] item 4.
- [x] ~~Delete `app/mux-preppa.env` if it reappears; rotate the Mux token~~ — token rotated **2026-09-08**, see [[Launch-Plan]] item 4; file has not reappeared. Broadening `.gitignore` to `.env.*` still worth doing but low priority (no `.env*` file has ever been committed, per the git-history secret search this session).
- [x] ~~Build the payout/charge reconciliation job~~ — **done 2026-09-07** for payouts (see [[Payments]]); subscription-charge reconciliation is still open, see above.
- [x] ~~Rate-limit and alert on state-mutating admin RPCs~~ — rate limiting was already done 2026-07-15; alerting (real-time on role change/suspension + `detect_admin_anomalies()` cron for escalation bursts, suspend churn, refund volume, payment-failure bursts) added 2026-09-07. See [[Security]].
- [x] ~~Route admin alerts to a real destination~~ — **done 2026-09-07** via a scoped Resend API key (`resend_admin_alerts_api_key` Vault secret, sending-only, `preppa.live`-domain-restricted); `notify_admins()` emails both admins directly, verified live with a real test alert. The `admin_alert_webhook_url` Slack branch is still there, still unset, and not needed now.
- [x] ~~Fix Preppa's Auth SMTP sender~~ — **investigated 2026-09-08, turned out to be a false alarm.** A similarly-named `Supabase Auth SMTP` key was spotted in an unrelated Resend workspace and mistaken for Preppa's; a real OTP send (via the Auth REST API) confirmed Preppa's Auth SMTP already correctly sends from `noreply@preppa.live` through the right Resend account (`200`, logged). No change needed.
- [ ] Turn on branch protection on `main`; enable Dependabot security alerts (15 vulnerabilities flagged on push 2026-09-07: 10 high, 5 moderate — unreviewed); add `CODEOWNERS`.
- [x] ~~Vendor the remaining ~114 un-tracked live migrations~~ — **done 2026-09-07**, full 212-migration history restored; add a deploy-verification step diffing live Edge Function/RPC definitions against the repo is still open.
- [x] ~~Move native session tokens to `expo-secure-store`; add a password-reset flow~~ — done 2026-09-17. Web retains browser storage; recovery uses an emailed OTP and does not create unknown accounts.
- [~] Add a real regression test suite beyond the DB-level `supabase/tests/regressions.sql`. The first TypeScript suite now pins customer-visible cart subtotal, service-fee, rounding, tax-preview, delivery-fee, tip, and per-kitchen behavior in CI. Continue expanding it around pure checkout and subscription logic as those seams are extracted.
- [~] Add `.env`/staging separation. Repository enforcement is complete: development and preview fail closed, contain no production service values, and CI prevents regression. Creating and funding the external test Supabase project plus Stripe test configuration remains open.

## In-code "coming soon" surfaces

- [x] ~~Quotes payment — reconcile the "coming soon" UI copy with the working `accept-quote-and-deposit` backend~~ — **confirmed stale 2026-09-08**, no such copy exists in the current codebase; both quote-payment entry points already call the real backend flow.

## Dead-surface cleanup (found during Launch-Plan item 11, 2026-09-08)

- [x] ~~Remove the remaining cash-on-delivery branches and fake handoff controls~~ — done 2026-09-25. Removed COD order state, cook preference data, receipt/tracking/admin copy, the decorative pickup QR and random backup code, and static tracking fallback. Tracking now requires a real server order ID.
- [x] ~~Decide what to do with the 6 fake seed kitchens sitting in the live production `kitchens` table~~ — **done 2026-09-08**. Attempted full deletion (kitchens + their 30 orders/55 ledger entries/etc., all confirmed to be your own dev/admin/test accounts, no real customers) but it's genuinely impossible without weakening real safety guarantees: `ledger_entries` (all 6 kitchens), `subscription_events` (kitchen 1), and `messages` (kitchens 1 and 6) are all deliberately **append-only** tables (`block_mutation()` triggers), same protection class as `audit_log`. Every delete attempt correctly rolled back (nothing was ever partially deleted). Instead, set all 6 kitchens to `verification_status = 'rejected'`, `availability = 'paused'`, with a `rejection_reason` documenting why — permanently un-orderable, with real history (orders/ledger/messages) preserved intact per the ledger's own design intent.
- [x] ~~Remove the seed-cook fallback from live customer inventory~~ — done 2026-09-25. Supabase meals now carry their real kitchen UUID as `Meal.cook`; cart grouping, ownership checks, search, detail, checkout, and totals accept that stable identity. Discovery and prepper rails route and render directly from verified live-kitchen fields, and `seedCookForKitchen` plus the non-seed `?? 'maria'` attribution are gone. `COOKS` and `KITCHEN_ID` remain for explicitly seeded prototype plans, experiences, and legacy seed routes tracked under the broader mock-data cleanup item below.
- [x] ~~Remove fabricated cross-kitchen meal add-ons~~ — done 2026-09-25. Meal detail no longer offers global Maria/Denise fixture items as add-ons to every live kitchen. Those choices created a second kitchen cart group and advertised inventory the selected kitchen never listed. Real side dishes remain purchasable as ordinary live meal listings from their owning kitchen.
- [x] ~~Stop overstating order progress and pickup timing~~ — done 2026-09-25. Customer order history and detail now preserve the server's `confirmed` state instead of calling every paid, non-terminal order “Preparing.” Pickup checkout no longer promises an invented 25-minute ready time and instead explains that the kitchen will send the real status update.
- [x] ~~Remove the obsolete local-only cook order acceptance API~~ — done 2026-09-25. The live cook order hub already advances fulfillment through the server-authorized `update_order_status` RPC. Deleted the unused `acted`/`acceptOrder` store state so future screens cannot accidentally present a device-local acceptance as a real kitchen update.
- [x] ~~Harden order and review deep links during account hydration~~ — done 2026-09-25. Direct entry now waits for the signed-in user's order load, distinguishes backend failure from a missing order, and offers retry. Review no longer renders a Maria fallback while loading and refuses reviews until the real order is completed.
- [x] ~~Bound customer review text~~ — done 2026-09-25. Meal and experience review forms now show character counts and enforce client limits, both write helpers reject oversized text, and `reviews_body_length` enforces a 2,000-character ceiling for new database rows.
- [x] ~~Align the cook support composer with closed-ticket rules~~ — done 2026-09-25. Closed shared tickets now explain that no further reply is allowed instead of showing a composer the server would reject; empty replies are disabled on open threads.
- [x] ~~Identify participants in admin support threads~~ — done 2026-09-25. The admin-only ticket detail RPC now derives each message author as Admin, Reporter, or Cook, and the support UI displays that role instead of labeling every non-admin participant “User.”
- [x] ~~Remove the final Maria identity placeholders from live order flows~~ — done 2026-09-25. Reordered meals and server-hydrated order lines now carry the real kitchen UUID in both identity fields. Checkout and tracking empty-state setup uses a neutral identity, keeping persisted carts and every downstream consumer aligned with the catalog model.
- [x] ~~Block direct access to rejected seed storefronts and plans~~ — done 2026-09-25. Named seed-kitchen URLs and short prototype plan IDs now render not-found states, matching their permanently rejected database status instead of presenting fake profiles, availability, specialties, or subscription offers as marketplace supply.
- [x] ~~Delete unreachable seed storefront and plan implementations~~ — done 2026-09-25. Removed more than 300 lines of fake availability, follower metrics, reviews, specialties, plan offers, and reservation UI, along with their unused fixture data. Live storefronts and plans now have one server-backed implementation each.
- [x] ~~Remove rejected seed mappings from chat, feed, and live deep links~~ — done 2026-09-25. Historical named cook IDs no longer resolve to rejected kitchen UUIDs outside the storefront. Legacy chat redirects accept real kitchen IDs; rejected feed and livestream routes return to the safe disabled or home state.
- [x] ~~Remove seed UUID fallbacks from paid checkout~~ — done 2026-09-25. Order creation now requires server-backed kitchen and meal IDs on every cart line. Persisted prototype lines are discarded during hydration, and any malformed line that reaches payment receives a clear stale-cart recovery message before Stripe is invoked.
- [x] ~~Remove seed identity from the custom-box picker~~ — done 2026-09-25. Build-a-box meal rows now use live kitchen names only, and an empty live catalog renders a clear explanation plus a path back to one-time meal discovery instead of a blank picker with a disabled action.
- [x] ~~Make customer plan browsing recover from load failures~~ — done 2026-09-25. The plans and subscription request is now caught and always leaves its loading state; customers see the actual failure and can retry instead of being left on an indefinite spinner with an unhandled promise.
- [x] ~~Harden customer subscription management recovery~~ — done 2026-09-25. Active-plan loads and cross-kitchen message lookups now distinguish backend failures from empty results and provide retry actions. Plan cancellation requires an explicit cross-platform confirmation that explains the billing consequence before the mutation runs.
- [x] ~~Confirm cook booking charges and refunds on every platform~~ — done 2026-09-25. Completing a service booking now discloses the exact remaining balance that will be charged, while cancellation explains the deposit refund. Both mutations use the shared web/native confirmation flow, closing the native path that previously cancelled immediately.
- [x] ~~Protect cook menu recovery and archiving~~ — done 2026-09-25. Menu load failures now provide a real retry state, status mutations reject overlapping taps, and dish archiving requires a cross-platform confirmation that explains the effect on customer visibility and existing orders.
- [x] ~~Confirm manual payout reconciliation outcomes~~ — done 2026-09-25. Admins now review the amount, kitchen, Stripe transfer ID, or failure note in a cross-platform confirmation before marking a payout paid or failed. Overlapping reconciliation submissions are blocked.
- [x] ~~Confirm admin kitchen application decisions~~ — done 2026-09-25. Approval now explains when marketplace eligibility begins, rejection repeats the applicant-visible reason before submission, and rejection text is visibly bounded to 1,000 characters.
- [x] ~~Protect kitchen reinstatement and suspension reasons~~ — done 2026-09-25. Reinstatement now requires confirmation that customer-facing listings may return, and the owner-visible suspension reason is visibly bounded to 1,000 characters.
- [x] ~~Align admin replies with closed support tickets~~ — done 2026-09-25. Closing a ticket now confirms that reporter and cook replies will stop. Closed tickets hide the admin composer until reopened, and empty admin replies are disabled.
- [x] ~~Protect safety and abuse request closure~~ — done 2026-09-25. Closing an intake request now confirms its removal from the active queue, with stronger wording for urgent reports, and overlapping status mutations are blocked.
- [ ] In-app camera broadcast for Go Live (currently external RTMP only — no official Mux RN SDK).
- Cash on delivery is not offered. Any future version requires a separately approved held-card, deposit, and identity design before client work begins.

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

- [x] ~~Update `README.md` and `LAUNCH-ACCOUNTS.md`~~ — done 2026-09-25. The README now distinguishes production configuration from launch approval and documents the current CI gates. The account tracker now separates checked-in identifiers from provider verification and lists the external evidence still required.
- [x] ~~Resolve the two divergent `GRAD` palette exports~~ — done 2026-09-25. Removed the obsolete prototype palette from `src/data/data.ts`; gradient keys now come from the canonical Warm Trust theme while tuple gradients remain supported for explicit feature artwork.
- [x] ~~Reduce reliance on `src/data/data.ts` mock data and audit persisted-store seed data~~ — completed 2026-09-25. Removed the dormant mock catalog repository, dead meal, notification, cook-dashboard, subscription, cook-rail, and experience-card fixtures, the seed-slug daily-drop selector, and seed-only founding-cook fee presentation. Home, catalog search, checkout, subscriptions, cook operations, and experiences now use live service data; malformed historical order lines fall back to a neutral kitchen label instead of a named seed cook.
- [~] Complete accessibility acceptance. Repository pass 2026-09-25 added semantic tab state, button roles, accessible names, disabled state, and selection state across customer navigation, onboarding, account actions, notifications, photo controls, and cook plan controls. Real-device VoiceOver and TalkBack traversal, focus order, text scaling, and switch-control acceptance remain external device gates.

## Related

- [[Project]] · [[Bugs]] · [[Security]] · [[Payments]] · [[Features]]
