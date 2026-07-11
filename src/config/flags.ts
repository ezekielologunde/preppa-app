/**
 * v1 feature flags.
 *
 * Preppa was built as a broad demo (~48 screens). For the honest v1 pilot we hide the
 * surfaces that aren't real yet — they return post-launch once actually built. Hiding,
 * not deleting: flip a flag to true to bring a surface back.
 */
export const FLAGS = {
  experiences: false, // classes / supper clubs / private-chef services — waitlist, not live
  feed: false, // video reels — demo only
  plans: true, // weekly meal plans / subscriptions — real recurring billing (Stripe, test mode)
  prepplus: false, // paid membership — not live (and IAP-sensitive)
  rewards: false, // points / referral rewards — not live
  chat: false, // 1:1 messaging — read-only demo
  notifications: true, // real in-app notification center (DB-backed; generated on real events). No push yet.
} as const;
