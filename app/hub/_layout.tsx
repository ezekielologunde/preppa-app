import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useStore } from '../../src/store/store';

/**
 * Deep-link guard for every /hub/* screen: only approved preppers may enter.
 * Hiding the My Hub tab isn't enough — a direct URL/deep link would otherwise
 * reach these seller-only screens. (Client-side only; real access must be
 * server-enforced once auth exists.)
 */
export default function HubLayout() {
  const { ready, prepperStatus } = useStore();
  if (!ready) return null; // wait for persisted role to hydrate before deciding
  if (prepperStatus !== 'approved') return <Redirect href="/(tabs)/home" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
