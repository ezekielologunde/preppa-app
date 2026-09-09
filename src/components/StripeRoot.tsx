import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PK, APPLE_PAY_MERCHANT_ID } from '../lib/supabase';

/** Native only — see StripeRoot.web.tsx for the web counterpart. Metro resolves by platform
 *  extension, so the web bundle never even parses this file's native-module import.
 *  `merchantIdentifier` is required for Apple Pay to work at all; omitted (undefined, not an
 *  empty string — the native module treats "" as a real identifier and errors) until a real
 *  one exists. See APPLE_PAY_MERCHANT_ID's comment in src/lib/supabase.ts. */
export function StripeRoot({ children }: { children: React.ReactElement }) {
  return (
    <StripeProvider publishableKey={STRIPE_PK} merchantIdentifier={APPLE_PAY_MERCHANT_ID || undefined}>
      {children}
    </StripeProvider>
  );
}
