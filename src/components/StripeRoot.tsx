import React from 'react';
import { StripeProvider } from '@stripe/stripe-react-native';
import { STRIPE_PK } from '../lib/supabase';

/** Native only — see StripeRoot.web.tsx for the web counterpart. Metro resolves by platform
 *  extension, so the web bundle never even parses this file's native-module import. */
export function StripeRoot({ children }: { children: React.ReactElement }) {
  return <StripeProvider publishableKey={STRIPE_PK}>{children}</StripeProvider>;
}
