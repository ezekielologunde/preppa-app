# Preppa launch accounts and external services

This tracker separates repository configuration from provider and account verification. A value
in `app.json` or `eas.json` proves that the app is configured to reference an account. It does not
prove that the account is active, approved, funded, or ready for store submission.

**Status legend:** Configured = repository evidence exists; Verify = current provider evidence is
still required; Blocked = required evidence is absent.

| Service | Repository evidence | Current status | Evidence required before launch |
|---|---|---|---|
| Stripe | A live publishable key is configured and Stripe Connect flows exist. | **Verify** | Confirm business activation in Stripe, deploy the current payment functions, then record controlled charge, refund, failed-payment, webhook, and cook-payout acceptance. |
| Apple Developer and App Store Connect | Bundle ID `live.preppa.app`, Apple Pay merchant ID `merchant.live.preppa.app`, and App Store Connect app ID `6802527112` are configured. | **Verify** | Confirm membership, team and certificate ownership, merchant entitlement, privacy disclosures, production EAS build, TestFlight install, native Stripe return, and App Review readiness. |
| Google Play Console | Android package `live.preppa.app` and production EAS profile are configured. | **Blocked** | Confirm the developer account and app record, complete Play declarations, produce an Android build, and pass internal-device testing. |
| Expo and EAS | Owner `tolaologunde`, project ID `a585c8a7-673b-4707-b132-d8c347c0f862`, update URL, and build channels are configured. | **Configured** | Record successful production iOS and Android builds. Verify channel, signing credentials, runtime updates, and store submission output. |
| Supabase | Client configuration and backend source are present. | **Verify** | Apply the intended migrations and Edge Functions to the target project, verify secrets and cron jobs, and capture production smoke-test evidence. |
| Legal and policy pages | Privacy, terms, and account-deletion content exist as drafts in the project documentation. | **Blocked** | Obtain legal approval for the launch jurisdiction and verify public privacy, terms, support, and account-deletion URLs used by both stores. |

## Account details to verify

- Apple Team ID: pending verification
- App Store Connect app record for `6802527112`: pending verification
- Google Play app record for `live.preppa.app`: pending verification
- Expo organization and signing credentials: project linked; ownership and credential review pending
- Stripe account activation and payout capability: pending provider evidence
- Public legal and account-deletion URLs: pending verification

## Release rule

Do not infer launch readiness from a checked-in identifier, a live client key, or a successful
local build. Public launch requires the acceptance evidence in
`docs/obsidian/Launch-Plan.md`, including controlled money movement, real-device testing, legal
approval, verified cooks and menus, monitoring, and a closed beta.
