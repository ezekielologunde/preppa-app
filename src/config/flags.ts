/**
 * v1 feature flags.
 *
 * Preppa was built as a broad demo (~48 screens). For the honest v1 pilot we hide the
 * surfaces that aren't real yet — they return post-launch once actually built. Hiding,
 * not deleting: flip a flag to true to bring a surface back.
 */
export const FLAGS = {
  experiences: true, // customer "Experiences" hub — request a cook, build/request a meal plan, manage requests (real, live)
  feed: true, // creator feed — real DB-backed photo posts + likes (video reels are a later slice)
  plans: true, // weekly meal plans / subscriptions — real recurring billing (Stripe, test mode)
  services: true, // Food-Services marketplace (cook-at-home/catering request→quote→book→deposit) — real (Stripe test mode)
  prepplus: true, // PrepPlus membership — real (Stripe-native recurring, test mode). WEB-ONLY entry (IAP policy): gate native entry points with Platform.OS==='web'.
  rewards: false, // points / referral rewards — not live
  chat: true, // 1:1 messaging — real relationship threads (Supabase Realtime + RLS), live
  notifications: true, // real in-app notification center (DB-backed; generated on real events). No push yet.
} as const;
