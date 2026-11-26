import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useStore } from '../../src/store/store';
import { prepperRouteDecision } from '../../src/lib/accountGate';

/**
 * Deep-link guard for every /hub/* screen: only approved preppers may enter.
 * Hiding the My Hub tab isn't enough — a direct URL/deep link would otherwise
 * reach these seller-only screens. (Client-side only; real access must be
 * server-enforced once auth exists.) Waits for the first account reconcile
 * (`accountReady`): prepperStatus starts as 'none', so deciding on `ready` alone
 * bounced an approved cook to Home on a hard load.
 */
export default function HubLayout() {
  const { ready, accountReady, prepperStatus } = useStore();
  const decision = prepperRouteDecision({ ready, accountReady, prepperStatus });
  if (decision === 'wait') return null;
  if (decision === 'redirect') return <Redirect href="/(tabs)/home" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
