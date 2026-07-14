# Edge Functions Manifest

Metadata pulled from the live Supabase project (fwidhpzwldneeaphrxgg, "Preppa") on 2026-07-14.
This is NOT recoverable from the vendored source files themselves — `verify_jwt` in particular
is a per-function deployment setting (not code) and matters a lot: webhook-receiving functions
(`stripe-webhook`, `stripe-setup`, `stripe-worker`, `charge-due-cycles`) have `verify_jwt:false`
on purpose (cron/webhook callers, not end-user JWTs). Redeploying any of them with
`verify_jwt:true` by mistake would break them.

The list below reflects what `list_edge_functions` returned at audit time (30 functions total,
not 31 as originally estimated). `connect-payout`, `accept-quote-and-deposit`, and `mux-webhook`
are intentionally EXCLUDED from this vendoring pass — a separate task is changing their logic as
part of active security fixes, and their current (soon-to-be-superseded) source doesn't need to
be vendored here. They already have their own in-progress directories under `supabase/functions/`.

| slug | verify_jwt | version | status | vendored |
|---|---|---|---|---|
| create-order | true | 5 | ACTIVE | yes |
| connect-onboard | true | 4 | ACTIVE | yes |
| connect-payout | true | 3 | ACTIVE | **skipped** (separate security-fix task) |
| stripe-webhook | **false** | 4 | ACTIVE | yes |
| stripe-setup | **false** | 2 | ACTIVE | yes |
| stripe-worker | **false** | 2 | ACTIVE | yes |
| payment-methods | true | 2 | ACTIVE | yes |
| connect-status | true | 2 | ACTIVE | yes |
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

## Notes

- `stripe-webhook`, `stripe-setup`, and `stripe-worker` are deployed as large (~1.1MB) esbuild
  bundles of `@stripe/sync-engine` (v1.0.32) plus a thin `Deno.serve` wrapper — that's the actual
  live artifact, vendored as-is (not hand-written app code, not modified).
- All other functions are hand-written single-file `index.ts` handlers using
  `@supabase/supabase-js@2.45.4`, `stripe@16.12.0` (Deno-targeted esm.sh build), and `zod@3.23.8`,
  all imported directly from esm.sh (no import map, no bundled `_shared` files were present on any
  of the 27 functions fetched in this pass).
- If/when the security-fix task for `connect-payout`, `accept-quote-and-deposit`, and
  `mux-webhook` lands, this manifest's rows for those three should be updated with their new
  version numbers and (if the fix changes it) verify_jwt values.
