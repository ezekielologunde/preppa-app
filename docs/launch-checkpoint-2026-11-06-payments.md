# Local release checkpoint

Production access remains unavailable. No paid upgrades, production mutations, EAS builds or store submissions were performed in this pass.

The service environment validator now rejects test, secret, restricted and malformed Stripe keys in production; preview accepts only test publishable keys. Existing preview protection against production backend credentials remains in place.

Verified locally: 34 tests, TypeScript, environment separation, accessibility input-name check, web export and compiled-bundle secret scan passed.

Still required before launch:

- Restore access to the existing backend or authorize and supply a recoverable migration source. Source code alone cannot recover existing accounts and data.
- Rotate the historically exposed review-account credential through the backend owner account. Do not commit a replacement password.
- Verify sign-in, recovery, buyer checkout, seller onboarding, refunds, recurring payments, account deletion and moderation against an authorized test backend.
- Produce signed iOS and Android release builds using available build capacity, complete physical-device checks and private store review credentials, and obtain submission receipts.

Bundle compilation and local tests do not establish production payment readiness or store approval.

## November 7 saved-card confirmation

Native saved-card checkout previously accepted any SDK response without an error, even if the returned PaymentIntent was not succeeded. Web and native confirmation now require an explicit succeeded state. Processing and unresolved states direct the buyer to check the existing order before trying again. This does not replace webhook-based order settlement.

Local tests now cover both SDK status spellings, missing status, pending action, cancellation, authorization-only and processing states. Production access remains unavailable. This change does not rotate the exposed historical reviewer credential or establish end-to-end payment readiness.

The native new-card PaymentSheet path now retrieves its PaymentIntent after the sheet completes and applies the same succeeded-status check. A successful sheet dismissal alone no longer returns a successful order result. Retrieval failures tell the buyer to check the existing order before retrying. Backend webhook settlement remains authoritative.
