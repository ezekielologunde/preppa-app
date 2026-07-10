# PREPPA — Platform Integrity Audit (living report)

Grounded audit of the whole platform: real-vs-mock, integrity, security, performance.
Produced by an 8-agent audit fleet reading the actual code, database, Stripe (incl. the
synced `stripe.*` mirror), edge-function logs, and the live sites. **67 findings.**
Read-only — nothing was fabricated; every finding cites file:line, a query, or a URL.

_Last run: after the "buildable-now" deploy (commit `2b86b64`). App project: `fwidhpzwldneeaphrxgg`._

---

## Posture in one paragraph

**The transactional spine is genuinely real and well-built** — email-OTP auth, session
restoration, server-authoritative roles with a self-escalation guard trigger, real Stripe
card checkout + tokenized saved cards (Customer + SetupIntent, ownership-checked),
signature-verified webhooks, RLS on all 18 tables, fully-constrained money columns, zero
orphan rows, hardened storage. **The marketplace breadth is mostly mock** — the buyer
catalog, cook profiles, reviews, recommendations, the prep-experience marketplace, meal
plans, messaging, and livestream are in-memory fixtures, not the DB. The platform is a
**solid real payment core wrapped in a mock storefront.** The honest path to "everything
real" is a sequence gated on a first real transaction — not a single sprint.

**Scorecard**

| Subsystem | Verdict |
|---|---|
| Auth (email OTP, session, roles, RLS) | ✅ Real |
| Stripe checkout + saved cards + webhook | ✅ Real (test mode, **web-only**) |
| Database integrity (RLS, FKs, constraints) | ✅ Real |
| Storage (avatars/meal-photos/kyc-docs) | ✅ Real, hardened |
| Admin console (orders/users/audit/tickets) | ✅ Real |
| Order → payment reconciliation | ✅ **Real** (trigger flips order→paid + writes ledger) |
| **Cook payouts (Stripe Connect)** | ⚠️ **Not wired** (cooks can't be paid) |
| **Native payments** | ⚠️ **Mock** (marks paid, never charges) |
| **Buyer catalog / cooks / reviews** | ⚠️ **Mock** (DB exists but is bypassed) |
| Prep-experience marketplace | 🔲 Mock (no request/bid tables) |
| Meal plans / subscriptions | 🔲 Mock (no recurring billing) |
| Messaging / chat | 🔲 Mock (no tables, no realtime) |
| Livestream / video | 🔲 Mock (no pipeline) |
| Landing page (preppa.live) | ⚠️ Page good, **waitlist backend dead** |

---

## 🔴 Critical

1. **Google OAuth client secret was pasted in chat — rotate it.** Not in the codebase
   (leak vector is the transcript), but a disclosed OAuth secret lets an attacker
   impersonate the app's Google identity in the token exchange. **Action (yours):** reset
   it in Google Cloud → update in Supabase → invalidate the old. Stays critical until done.

## 🟠 High

2. ✅ **FIXED — payment success now reconciles into app order state.** A `SECURITY DEFINER`
   trigger (`reconcile_paid_pi` on `stripe.payment_intents`) fires when the sync engine
   records a PI as `succeeded`, maps `metadata.order_id` back to the app, and flips
   `orders.pay_status→'paid'` + `status→'confirmed'` + `payment_intents.status→'succeeded'`,
   then writes the cook's `ledger_entries` credits (sale = subtotal, tip = 100%; the 10%
   service fee is buyer-paid platform revenue, not credited to the kitchen). Idempotent and
   exception-wrapped so it can never break Stripe sync. **Verified end-to-end:** all 7
   historical orders backfilled to `paid` with correct ledger; a fresh probe order
   auto-settled within seconds (paid/confirmed/ledger-credited) with no manual step. The
   payout basis (`kitchen_balance_cents` = Σ ledger) is now real. _(Migration:
   `reconcile_stripe_payment_to_order`.)_

3. **Cook payouts are not wired.** `connect-onboard` / `connect-payout` edge functions are
   deployed and real, but **no client code ever calls them** (`app/hub/payout.tsx` is a
   hardcoded "Chase •••• 4242" mock; `stripe_accounts`/`payouts` = 0 rows). Cooks currently
   cannot receive money. **Fix:** wire a cook onboarding + cash-out flow, or label payouts
   as not-yet-functional.

4. **Native (iOS/Android) checkout is a mock that "completes" with no charge.** The real
   Stripe path is gated on `Platform.OS==='web'`; the native branch calls
   `placeOrder('paid')` with **no order row and no charge** (`checkout.tsx:103`). **Fix:**
   integrate `@stripe/stripe-react-native` PaymentSheet, or block checkout on native.

5. **The buyer catalog is 100% in-memory mock, not the DB.** Every buyer screen imports
   `MEALS`/`COOKS` from `src/data/data.ts` (8 hardcoded meals, 6 cooks, TheMealDB stock
   photos). The real `meals` table (9 live rows, mirroring the mock) and `kitchens` (7) are
   **never queried by any buyer screen**; the repository seam is bypassed (only admin uses
   it). A DB edit (new meal, price change, sold-out) can never reach buyers. Ratings,
   reviews, distance, verified badges, PrepScore, and "matches your taste" are all
   fabricated constants. **Fix:** point buyer screens at the repository/DB before anything
   else marketplace-related — this is the root of most "mock" findings.

6. ✅ **FIXED — test-customer credential removed + neutralized.** `TEST_EMAIL`/`TEST_PW`
   deleted from `supabase.ts`; `ensureAuth()` now returns the real session or throws
   `AUTH_REQUIRED` (no shared-account fallback — safe because the onboarding gate can't
   complete without a real OTP/Google session, so `onboarded ⟹ session`). Checkout catches
   `AUTH_REQUIRED` and re-shows the sign-in gate. The already-leaked password (it shipped in
   prior public bundles) was **rotated server-side** — verified the old value now returns
   `400 invalid`. The account is kept (it owns the 7 test orders) but is inert to the app.

7. **preppa.live waitlist is silently broken.** The homepage's only CTA POSTs to
   `nfwfnnfbikjxwflpmsnu.supabase.co/rest/v1/waitlist` — a **dead/paused project that
   doesn't resolve in DNS** (the *same* ghost project you pointed the Google client at).
   Signups are being captured **nowhere** (the catch shows "Network error"). `og:image`
   also points at that dead host, so shared-link previews are broken. **Fix (landing repo):**
   repoint the form to the live project (`fwidhpzwldneeaphrxgg`) with a `waitlist` table +
   anon-insert RLS, or unpause the intended project; then test one real signup.

## 🟡 Medium

8. **COD is a client-only mock** — `create-order` explicitly rejects `method:'cod'`, yet
   the UI offers a full COD flow that only writes local state (no order row).
9. **Reviews & ratings are fabricated** (`STORE_REVIEWS` constant; `reviews` table empty) —
   a trust/compliance risk to display invented 5★ reviews.
10. **Recommendations / feed / PrepScore / "Today's drop" are hardcoded** — no engine, no
    user signal. They imply personalization/quality scoring that doesn't exist.
11. **Prep-experience marketplace is a timer-faked mock** — no `experience_requests`/
    `experience_bids` tables; `genQuotes` returns 2 deterministic quotes after an 8s
    `setTimeout`; customers can't title a request or set a free budget. *(This is the
    highest-value breadth system to make real — it's core two-sided liquidity.)*
12. **Messaging is a seeded mock** — no `conversations`/`messages` tables, **zero client
    realtime subscriptions**, and orders don't auto-create a thread.
13. **9 foreign-key columns lacked covering indexes.** ✅ **Fixed this pass** (migration
    `audit_fk_indexes_and_hygiene`).
14. **Financial ledger unexercised** — `ledger_entries`/`payouts`/`cod_handoffs` are
    schema-ready but never written; no code demonstrably populates the ledger (ties to #2).
15. **Web bundle is a single ~2.09 MB (533 KB gzip) chunk** — Expo `web.output:"single"`,
    no route splitting; all ~48 screens load up front. Fine at 0 users; top perf lever later.
16. **Catalog images hotlink TheMealDB** — no CDN/resize/format control; fragile + not
    brand-safe for launch.
17. **Google OAuth is web-only and unproven** — 0 google identities exist (no login has
    completed); native has no `expo-auth-session` handler.
18. **No footer links to Privacy/Terms + no dedicated account-deletion page** on preppa.live
    — the pages exist but are unreachable/guess-only; app stores require both.

## 🟢 Low / hygiene

- ~18 RLS policies call `auth.uid()` un-wrapped (per-row re-eval) — wrap as `(select auth.uid())` at scale.
- Paired permissive SELECT policies on kitchens/meals/tickets — optional consolidation.
- `tickets.order_id` is NOT NULL — can't file a non-order support ticket.
- `kitchen_private` empty despite 7 kitchens — verify prepper-approval writes compliance fields there.
- Leaked-password protection disabled (deferred; flows are passwordless anyway).
- Bleeding-edge deps (Expo 57 / RN 0.86 / React 19) with `legacy-peer-deps=true` — more upgrade risk than an LTS stack.
- `handle_new_user` provisions **profiles only** (there is no `preferences` table) — correct the "auto-creates preferences" expectation.
- Admin SECURITY DEFINER RPCs are anon-executable per the advisor but **is_admin()-gated** (not leaks); `handle_new_user`/`rls_auto_enable` EXECUTE ✅ **revoked from anon this pass**.

## ✅ Confirmed real (don't second-guess these)

Email-OTP sign-in · session persistence/restoration (auth-lock-safe) · server-authoritative
roles + `guard_profile_privileged_columns` blocking self-escalation · `create-order` real
Stripe PI with server-side re-pricing + idempotency · Stripe Elements new-card + tokenized
saved cards (ownership-checked, 403 on cross-tenant) · signature-verified webhook + hourly
reconciliation worker · RLS on all 18 tables · PII scoped to owner/admin · storage buckets
owner-scoped with no listing; KYC bucket fully private · money columns NOT NULL + non-negative
+ `total = subtotal+fee+tip` CHECK · zero orphan rows · no XSS/SSRF sinks, no service-role key
in client · anon + publishable keys public-by-design.

---

## Risk registers

**Architecture** — Two disconnected catalogs (mock vs DB) is the central architectural debt;
the payment-reconciliation gap breaks the money loop; payouts unwired means the marketplace
can't actually pay suppliers. **Data** — app order/payment state diverges from Stripe truth
(reconciliation); compliance fields (`kitchen_private`) may be dropped. **Security** — Google
secret (rotate), test-customer creds in bundle (remove), leaked-password off (deferred);
otherwise strong. **Scaling** — buyer reads never touch Postgres yet, so RLS/query/pagination
cost is *completely unexercised*; single JS bundle; per-row `auth.uid()` in RLS.

## Technical-debt register (condensed)

`R1` catalog→DB migration · ~~`R2` payment reconciliation (Stripe→orders)~~ ✅ **DONE** · ~~`R3` remove
test-customer creds~~ ✅ **DONE** · `R4` Connect payout wiring · `R5` native
payments (or block native) · `R6` COD server flow (or hide) · `R7` reviews from DB (or hide)
· `R8` landing waitlist backend · `R9` RLS `(select auth.uid())` rewrite · `R10` bundle
splitting · `R11` self-hosted meal images.

## Recommended remediation sequence (gated, not a sprint)

1. **Now — safe/cheap:** ✅ FK indexes + revokes (done). Rotate Google secret (yours). Fix
   the landing waitlist backend (landing repo). Add the account-deletion page + footer links.
2. **Before a first real sale can settle:** `R2` payment reconciliation (**the money loop
   must close**) → `R3` remove test-customer creds → `R6`/`R8` de-mock COD + waitlist.
3. **When there's supply (several cooks):** `R1` catalog→DB (unlocks real listings, search,
   reviews-from-DB) → `R4` payouts (cooks get paid) → the **prep-experience reverse
   marketplace** (`experience_requests`/`experience_bids`) + real **messaging** (auto-thread
   on order).
4. **When one-off orders convert & retain:** subscriptions/meal-plans, native payments,
   then video/livestream if engagement justifies the infra cost.

## Fixed since this audit
- Added btree indexes on 9 unindexed FK columns (`audit_fk_indexes_and_hygiene`).
- Revoked anon/authenticated EXECUTE on `handle_new_user` + `rls_auto_enable`.
- **Closed the money loop (R2):** `reconcile_paid_pi` trigger — Stripe success now flips
  order→paid/confirmed + writes the cook's ledger; verified end-to-end
  (`reconcile_stripe_payment_to_order`).
- Built the `waitlist` table (anon insert-only, reads denied) for the preppa.live landing
  form (`waitlist_table`) — landing front-end still needs its Supabase URL/key repointed.

- **Removed the shipped test-customer credential (R3):** `ensureAuth` now requires a real
  session (throws `AUTH_REQUIRED`, handled by checkout); the leaked password was rotated
  server-side (old value now rejected). `supabase.ts` + `checkout.tsx`.

## Next up (recommended order)
`R1` catalog→DB (the visible win — buyers read real inventory) → `R4` cook payouts
(Connect onboarding + cash-out) → the prep-experience reverse marketplace + real messaging.
