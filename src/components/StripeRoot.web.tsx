import React from 'react';

/** Web only — no native Stripe provider needed; src/lib/payments.ts uses @stripe/stripe-js
 *  directly on web instead. See StripeRoot.tsx for the native counterpart. */
export function StripeRoot({ children }: { children: React.ReactElement }) {
  return children;
}
