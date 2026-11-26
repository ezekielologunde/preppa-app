# Web sign-in sheet and "sign in, then resume" (Loop 2 task 2.1)

Status: design approved 2026-11-26 (council quick session 3; owner said the council decides design questions).
Build order A, then B, then C. Nothing here is applied outside the test project.

## Findings that shaped it
- `app/_layout.tsx:97` already skips onboarding on web, so the only sign-in UI (native `Onboarding.tsx`) never appears there. A guest at Pay gets a toast and a dead end.
- `resetOnboarding` at `app/checkout.tsx:122` does nothing on web today.
- `vercel.json` sends CSP as Report-Only, so `frame-ancestors` is not enforced; `X-Frame-Options: DENY` is the live clickjacking control.
- `addToCart` is local only, so gate checkout entry and Pay, not add-to-cart.
- Server side already enforces auth: `create-order` returns 401 without a user (`index.ts:197-199`), `book-experience` the same (`:134-135`). The client gate is UX only.

## Goals and non-goals
Goals: one sheet on web reachable from every gated action; one `requireAuth` entry point that resumes the action; native `Onboarding` unchanged.
Non-goals: Google OAuth (removed in S13), preference capture, MFA, CAPTCHA wiring (S2), redesigning native onboarding.

## UX
- Existing `Sheet` (`src/ui/overlay.tsx`) as a modal over the current route: bottom sheet under 700px, centred card (max 440px) at 700px and wider. Route, cart and scroll stay mounted.
- One component, internal steps: email entry (code first), code entry (resend with 60 s cooldown), password sign-in, create account, recover password, success (about 600 ms, then close and resume).
- Dismiss (scrim, Escape, visible "Not now") cancels cleanly: `requireAuth` resolves `false` once. Preflight runs before any optimistic UI flip, so nothing needs reverting.
- Accessibility: `role="dialog"`, `aria-modal`, labelled title and inputs, focus to first field, `aria-live="assertive"` error region, focus returns to the trigger, reduced motion respected.
- Copy: plain, warm, no em dashes.
- Guest empty states via `src/components/GuestGate.tsx`, shown only when `accountReady && !signedIn`: profile, orders, messages, notifications, saved.

## Architecture
- `src/lib/authRequest.ts` (pure, no React Native imports): types, `isAuthFailure(err, hasSession)`, intent codec, module-level controller; `requestSignIn(reason, intent?) => Promise<boolean>` coalesces calls.
- `useRequireAuth()` returns `requireAuth(reason, intent, run)`; `<AuthSheetHost/>` is mounted in `AppShell` beside `ToastHost`.
- Resume, same document: one-shot closure. Across a reload: serialisable intent `{kind, ids, path, t}` in `sessionStorage`, 15 minute TTL, `kind` from a fixed enum (follow, save, like, openThread, book, checkout, connect).
- Auto-run only idempotent kinds (follow, save, like, openThread). Money kinds (checkout, book) restore the screen with the button enabled; the user taps again. Nothing charges on resume.
- Council additions: the stored intent is bound to the signing-in account (store the email hash or user id at request time and drop the intent on mismatch), is cleared on sign-out, and the path allowlist is validated on read as well as on write.
- Another tab: the session lives in shared storage; `SIGNED_IN` triggers `reconcileAccount` and the host resumes in the original tab only.
- Connect return needs no intent: `?connect=` stays in the URL and `connectReturnAction` flips to `'handle'` once `signedIn`. Replace the toast in `my-hub.tsx` with `requestSignIn('connect')`.
- `isAuthFailure` is true for `AUTH_REQUIRED`, `PGRST301`, a Functions 401, a message matching `/jwt|not authenticated/`, and 42501 only when `getSession()` is empty (`messages/[threadId].tsx` uses 42501 for "not a participant").
- Reuse without dragging onboarding onto web: extract `Auth` and `Code` (`Onboarding.tsx`) into `src/components/auth/AuthForm.tsx` and `CodeForm.tsx`, and `Spinner`, `useShake`, `Title`, `Lead` into `authUi.tsx`; `Onboarding.tsx` imports them with no behaviour change.

## Security requirements
- No open redirect: the intent is never in the URL; `path` must match `^/[A-Za-z0-9/_-]*$` with no `//`, `\`, `:` or `%`, and be a known route prefix. `emailRedirectTo` is the constant `SITE` from `src/lib/siteOrigin.ts`, never `window.location`.
- Scrub `#access_token`, `#error`, `#error_code` from the URL on boot (`history.replaceState`); `detectSessionInUrl` stays `false`. Map `otp_expired` to "That link expired. Send a new one." No `console.*` of auth error objects.
- Rate limits: client resend cooldown 60 s (the server cooldown is 60 s), 429 maps to "Too many tries. Wait a minute.", 5 wrong codes then require a resend. Stop showing raw `e.message`. Replace "That email already has an account" with "If this email is new we've sent next steps." Keep "Wrong email or password".
- After sign-in `reconcileAccount` runs (accountReady, signedIn, orders, addresses). `logout` also clears the intent and closes the sheet.
- Never stored client side: password, OTP, tokens, email, cart contents or prices.
- Supabase Auth settings the owner configures: Site URL `https://app.preppa.live` (production) and `https://staging.preppa.live` (staging); redirect allowlist exact hosts only (`https://<host>`, `https://<host>/**`, plus `http://localhost:8081` on staging); no wildcard hosts, no `*.vercel.app`; confirm email ON; the OTP email template must contain `{{ .Token }}` (check this first: a link-only template sends no code); OTP expiry 600 s; per-hour send limit set; check custom SMTP.

## Decisions (council)
1. Code-first on web, password secondary: yes.
2. Consent (D13): unchecked checkbox on create-account and on the code path (which can create a user), recorded server-side by an RPC `record_consent(version)` that stamps `now()`; ships behind a flag pending legal review (4.7), with a "by continuing" sentence as the fallback while the flag is off. The migration is applied by the owner.
3. Do not gate add-to-cart; gate checkout entry and Pay; keep the cart across sign-in.
4. Password minimum: enforce 10 on the web client now; the dashboard setting stays at 8 until a native build that enforces 10 is out and old builds are mostly gone (a server minimum of 10 would break 8 to 9 character native sign-ups, see `RED-TEAM-LOOP0.md`).
5. Reuse the sheet on native checkout: deferred until B has run in production.

## Failure modes
Session expires mid-checkout: sheet opens, Pay re-enabled after sign-in, no auto-charge. Double tap: one sheet (coalesced). Slow network: `withTimeout` 15 s then a retry message. Wrong code: generic message, field cleared, resend offered. Locked out or 429: wait copy, password recovery stays. Pending Stripe return: param survives, handled after sign-in. Other tab: the original tab resumes. Browser back: the sheet is not a route; unmount resolves `false`. Storage blocked: closure only, warn that sign-in may not persist. Confirm link on another device: lands with a fragment that is scrubbed.

## Test plan
- Unit (`tests/authRequest.test.ts`): `isAuthFailure` matrix; path allowlist with hostile inputs (`//evil.com`, `/\evil`, `javascript:`, `%2f`, over-length); intent codec (bad kind, expired TTL, extra fields dropped, account mismatch dropped); controller coalesce, resolve-once, dismiss; fragment parser.
- Wiring (text based, repo style): every gated site uses `requireAuth`; `checkout.tsx` has no `resetOnboarding`; `Onboarding.tsx` imports from `components/auth`; `_layout.tsx` mounts `AuthSheetHost`; no `console.` in auth files.
- Native characterization tests for sign-up, sign-in, wrong code and resend are written BEFORE the B extraction and must pass unchanged after it.
- Playwright (2.10): visible dialog and unchanged URL at Pay, Follow, Message, Book; resume after sign-in; money actions not fired on resume; Escape and Not now leave state unchanged with focus returned; wrong code shows the alert region; Tab stays inside the dialog; guest empty states.

## Work breakdown
- A (low risk): `src/lib/authRequest.ts`, the fragment scrub, `tests/authRequest.test.ts`. No UI.
- B (risky, native regression): native characterization tests first, then the `components/auth/` extraction with no behaviour change, `AuthSheet`, `AuthSheetHost`, mount in `app/_layout.tsx`, `PASSWORD_MIN` (web client only), consent UI behind a flag, copy changes. Needs a native build and a TestFlight smoke check before it is merged to main. Depends on A.
- C (widest blast radius): wire every call site, `GuestGate` plus the five screens, `my-hub.tsx`, remove the checkout hack on web, wiring tests, Playwright cases. Depends on A and B. The consent RPC migration is separate.
