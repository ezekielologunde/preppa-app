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
`123456`, any other code is rejected as expired. One kitchen fixture (`/store/aaaaaaaa-...`);
every other table returns an empty list. `create-order` and `book-experience` return 401 without
the fake user's bearer token, and every call is counted in `mocks.calls`.
