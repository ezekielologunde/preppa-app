# Edge Functions Manifest

Metadata pulled from the live Supabase project (fwidhpzwldneeaphrxgg, "Preppa"), most recently
updated 2026-08-08. This is NOT recoverable from the vendored source files themselves —
`verify_jwt` in particular is a per-function deployment setting (not code) and matters a lot:
webhook-receiving functions (`stripe-webhook`, `stripe-setup`, `stripe-worker`,
`charge-due-cycles`, `send-push`, `mux-webhook`) have `verify_jwt:false` on purpose
(cron/webhook/worker callers, not end-user JWTs). Redeploying any of them with `verify_jwt:true`
by mistake would break them.

The list below reflects what `list_edge_functions` returned at audit time (30 functions total,
not 31 as originally estimated). `connect-payout`, `accept-quote-and-deposit`, and `mux-webhook`
are intentionally EXCLUDED from this vendoring pass — a separate task is changing their logic as
part of active security fixes, and their current (soon-to-be-superseded) source doesn't need to
be vendored here. They already have their own in-progress directories under `supabase/functions/`.

**2026-08-08 update:** a security audit found 5 functions deployed live (all created 2026-08-08)
with no source anywhere in this repo — `upload-media`, `delete-account`, `connect-link-oneoff`,
`subscribe-cook-pro`, `manage-cook-pro`. Fetched their live source via the Supabase MCP and
vendored them below to close that gap; `send-push` (also 2026-08-08, already vendored locally)
was simply missing from this table and is added too.

| slug | verify_jwt | version | status | vendored |
|---|---|---|---|---|
| create-order | true | 5 | ACTIVE | yes |
| connect-onboard | true | 4 | ACTIVE | yes |
| connect-payout | true | 9 | ACTIVE | yes |
| stripe-webhook | **false** | 4 | ACTIVE | yes |
| stripe-setup | **false** | 2 | ACTIVE | yes |
| stripe-worker | **false** | 2 | ACTIVE | yes |
| payment-methods | true | 2 | ACTIVE | yes |
| connect-status | true | 6 | ACTIVE | yes |
| reconcile-payouts | **false** | 1 | ACTIVE | yes (added 2026-09-07, payout reconciliation) |
| auto-payouts | **false** | 1 | ACTIVE | yes (added 2026-09-07, payout reconciliation) |
| connect-dashboard-link | true | 1 | ACTIVE | yes (added 2026-09-07, payout reconciliation) |
| connect-payout-settings | true | 1 | ACTIVE | yes (added 2026-09-07, payout reconciliation) |
| plan-upsert | true | 3 | ACTIVE | yes |
| create-subscription | true | 2 | ACTIVE | yes |
| manage-subscription | true | 2 | ACTIVE | yes |
| create-service-request | true | 4 | ACTIVE | yes |
| submit-quote | true | 2 | ACTIVE | yes |
| accept-quote-and-deposit | true | 3 | ACTIVE | **skipped** (separate security-fix task) |
| complete-booking | true | 2 | ACTIVE | yes |
| cancel-booking | true | 2 | ACTIVE | yes |
| charge-due-cycles | **false** | 3 | ACTIVE | yes |
| subscribe-plan | true | 2 | ACTIVE | yes |
| edit-service-request | true | 2 | ACTIVE | yes |
| subscribe-box | true | 2 | ACTIVE | yes |
| fulfill-plan-request | true | 2 | ACTIVE | yes |
| experience-upsert | true | 3 | ACTIVE | yes |
| book-experience | true | 2 | ACTIVE | yes |
| cancel-experience-booking | true | 2 | ACTIVE | yes |
| cancel-experience-session | true | 2 | ACTIVE | yes |
| subscribe-prepplus | true | 2 | ACTIVE | yes |
| manage-prepplus | true | 2 | ACTIVE | yes |
| live-start | true | 1 | ACTIVE | yes |
| live-end | true | 1 | ACTIVE | yes |
| mux-webhook | **false** | 1 | ACTIVE | **skipped** (separate security-fix task) |
| send-push | **false** | — | ACTIVE | yes (was already vendored, just missing from this table) |
| upload-media | true | 2 | ACTIVE | yes (added 2026-08-08 remediation) |
| delete-account | true | 3 | ACTIVE | yes (added 2026-08-08 remediation) |
| connect-link-oneoff | true | 3 | ACTIVE | yes — retired stub, 410 always, no Stripe access (added 2026-08-08 remediation) |
| subscribe-cook-pro | true | 2 | ACTIVE | yes (added 2026-08-08 remediation) |
| manage-cook-pro | true | 2 | ACTIVE | yes (added 2026-08-08 remediation) |

## Notes

- `stripe-webhook`, `stripe-setup`, and `stripe-worker` are deployed as large (~1.1MB) esbuild
  bundles of `@stripe/sync-engine` (v1.0.32) plus a thin `Deno.serve` wrapper — that's the actual
  live artifact, vendored as-is (not hand-written app code, not modified).
- All other functions are hand-written single-file `index.ts` handlers using
  `@supabase/supabase-js@2.45.4`, `stripe@16.12.0` (Deno-targeted esm.sh build), and `zod@3.23.8`,
  all imported directly from esm.sh (no import map, no bundled `_shared` files were present on any
  of the 27 functions fetched in this pass).
- `connect-payout`'s row was updated 2026-09-07 (version 9) as part of the payout reconciliation
  work -- it's now vendored and current. If/when the security-fix task for
  `accept-quote-and-deposit` and `mux-webhook` lands, update those two rows similarly.
