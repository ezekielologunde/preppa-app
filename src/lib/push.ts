import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from './supabase';

/** Where to send the user when they tap a push, keyed on notification `kind` (matches the
 *  `kind` column notify() writes — 'order' | 'payout' | 'kitchen' | ...). Falls back to the
 *  notifications screen for kinds with no obvious deep link. */
function routeForKind(kind: string | undefined): string {
  switch (kind) {
    case 'order': return '/(tabs)/orders';
    case 'payout': return '/hub/money';
    case 'kitchen': return '/hub';
    default: return '/(tabs)/notifications';
  }
}

/** Wires tap-to-navigate for both states: app already open (foreground tap) and app opened
 *  fresh from a killed/backgrounded state via the notification. Call once near the app root;
 *  no-ops on web (there's nothing to subscribe to — expo-notifications listeners are native). */
export function useNotificationTapNavigation() {
  // Hook is always called (rules-of-hooks) — the platform check lives inside the effect,
  // not around it. Platform.OS is fixed for the life of the process either way, so this
  // has no observable behavior difference from an early-return, just the correct shape.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      const Notifications = await import('expo-notifications');
      const go = (response: any) => {
        const kind = response?.notification?.request?.content?.data?.kind as string | undefined;
        router.push(routeForKind(kind) as any);
      };
      if (cancelled) return;
      // Covers a tap while the app is foregrounded/backgrounded-but-alive.
      sub = Notifications.addNotificationResponseReceivedListener(go);
      // Covers a cold start where the app was launched BY tapping the notification —
      // addNotificationResponseReceivedListener alone misses this because it isn't
      // subscribed yet when the launch-time response fires.
      const last = await Notifications.getLastNotificationResponseAsync();
      if (!cancelled && last) go(last);
    })();
    return () => { cancelled = true; sub?.remove(); };
  }, []);
}

/**
 * Push registration is native-only and needs an EAS project to mint an Expo push token
 * (`expo.extra.eas.projectId` in app.json — not set yet, no EAS project has been linked).
 * Until that exists this no-ops instead of throwing, so the rest of sign-in reconciliation
 * never breaks because push isn't wired up yet.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;
  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
  if (!projectId) {
    if (__DEV__) console.warn('[push] no EAS projectId configured — skipping push registration');
    return;
  }

  try {
    // Deferred import: expo-notifications touches native modules at import time, which
    // would throw on web (already guarded above) and isn't worth the bundle cost there.
    const Notifications = await import('expo-notifications');

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      status = req.status;
    }
    if (status !== 'granted') return; // user declined — nothing more to do

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { data: sess } = await supabase.auth.getSession();
    const userId = sess.session?.user?.id;
    if (!userId) return; // reconcileAccount only calls this when signed in, but stay defensive

    const { data: tokenResult } = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResult;
    if (!token) return;

    await supabase.from('push_tokens').upsert(
      { user_id: userId, token, platform: Platform.OS },
      { onConflict: 'user_id,token' },
    );
  } catch (e) {
    if (__DEV__) console.warn('[push] registration failed (non-fatal):', e);
  }
}
