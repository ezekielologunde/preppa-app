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
