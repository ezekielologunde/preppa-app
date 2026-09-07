-- New terminal-ish payout state for the automated reconciler: a pending payout whose real
-- Stripe outcome could not be determined (transfer not found after 24h, reversed transfer,
-- or too many attempts). It keeps the amount reserved (see reserve_payout) until an admin
-- resolves it via admin_resolve_payout -- we never auto-fail and free funds on a guess,
-- since a false negative there would pay the cook twice.
--
-- Kept in its own migration: ALTER TYPE ... ADD VALUE cannot be used inside the same
-- transaction that adds it, and the CLI replays each file in one transaction.
alter type payout_status add value if not exists 'needs_review';
