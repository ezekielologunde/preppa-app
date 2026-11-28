# Web sign-in end-to-end suite (local)

Playwright tests for the web sign-in sheet (docs/web-launch/SIGNIN-DESIGN.md, Test plan) run
against a static web export served from this folder. No real backend is contacted: the app is
built against a fake Supabase origin (`http://127.0.0.1:54321`, nothing listens there), every
Supabase endpoint is mocked in `support/mocks.ts`, and any request to another host is aborted
and fails the test (`support/fixtures.ts`).

This package is separate from the app: the root `package.json` and `package-lock.json` are not
touched.

## Run

From `e2e/`:

1. Install: `npm install` (with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`; no browser is downloaded).
   The config uses an installed Chromium under `%LOCALAPPDATA%\ms-playwright\chromium-*`; set
   `E2E_CHROME` to a `chrome.exe` to override.
2. Build: `npm run build`. Needs the app's dependencies in the repo root `node_modules` as a real
   folder (a per-package junction overlay gives Metro two React copies and the page crashes with
   "reading 'useState'"). Output goes to `e2e/.dist-cache`.
3. Test: `npm test`. Headed: `npm run test:headed`.

`serve.mjs` serves `E2E_DIST` (default `.dist-cache`) on `E2E_PORT` (default 4173) with an SPA
fallback; Playwright starts and stops it.

## Fake data

Test user `test-user@example.com`, password and code constants in `support/mocks.ts`; good code
`123456`, any other code is rejected as expired. One kitchen fixture (`/store/aaaaaaaa-...`) and
one published experience it hosts (`/experience/eeeeeeee-...`) with one open session a week out;
its rating, reviews and waitlist are empty, and every other table returns an empty list.
`create-order` and `book-experience` answer `alreadyPaid: true` with no client secret, so Stripe.js
is never loaded. They, `toggle_follow` and `open_thread` return 401 without the fake user's bearer
token, and every call is counted in `mocks.calls`.

## Coverage (21 tests)

- `sheet.spec.ts`: guest Follow opens a labelled modal dialog, URL kept, focus inside; Escape and
  Not now close it, nothing runs, focus returns to Follow; Tab stays inside the dialog.
- `signin.spec.ts`: password sign-in and emailed code (wrong code alert, field cleared, good code)
  close the sheet, then Follow runs exactly once.
- `money.spec.ts`: Pay as a guest opens the sheet with no `create-order` call; after sign-in Pay is
  enabled again and nothing is charged until it is tapped again, then exactly one call.
- `book.spec.ts`: on the experience page, Book as a guest opens the sheet with no `book-experience`
  call; after sign-in Book is enabled again and nothing is booked until it is tapped again, then
  exactly one call and the page moves to `/orders`. Message the host as a guest opens the sheet;
  after sign-in `open_thread` runs exactly once and the app opens `/messages/<thread id>`.
- `neutral.spec.ts`: duplicate-email sign-up shows the neutral green notice (no red, no shake, no
  error alert); recovery for an unknown email (both GoTrue refusal shapes) advances exactly like a
  known one; with the consent flag off, Terms and Privacy Policy open in a new tab and the tap
  changes nothing else.
- `history.spec.ts`: browser Back while the sheet is open dismisses it and runs nothing; reload
  leaves a guest with no sheet and no stuck state.
- `guest.spec.ts`: gated tabs show their guest empty states; profile keeps Help, Privacy, Terms;
  the public store page has no gate.
- Every test fails if any request reaches a host outside the allow-list.

Sabotage check (C3c): each money, neutral and consent test was run against a patched copy of the
bundle (`.dist-sabotage-N`, gitignored) and failed. C3d: with `checkout` and `book` added to the
bundle's auto-run list, the Book test fails (the booking runs by itself on resume). The Back test still passes with the sheet
host's `popstate` listener removed: on web, expo-router's own popstate handling re-resolves and
remounts the screen, which also closes the sheet, so that listener is not pinned here.

## Not covered

- The consent checkbox variant (`EXPO_PUBLIC_CONSENT_CHECKBOX=1` needs its own build).
- Real-backend flows (real GoTrue, Edge Functions, Stripe).
- Safari and Firefox (Chromium only).
