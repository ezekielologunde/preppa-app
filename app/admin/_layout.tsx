import React from 'react';
import { Platform } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useStore } from '../../src/store/store';
import { AdminChromeProvider } from '../../src/components/admin/CommandPalette';

/**
 * Admin area guard. Cosmetic only — every admin read/write is independently
 * enforced server-side by `is_admin()` RLS/RPC checks, so a hidden route is not
 * access control. Web-only (mirrors the web-only payments path); a deep link on
 * native, or by a non-admin, bounces home. Waits for `ready` so the persisted
 * session has hydrated before deciding.
 *
 * `AdminChromeProvider` mounts the ⌘K command palette once for the whole area.
 */
export default function AdminLayout() {
  const { ready, isAdmin } = useStore();
  if (!ready) return null;
  if (Platform.OS !== 'web' || !isAdmin) return <Redirect href="/(tabs)/home" />;
  return (
    <AdminChromeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AdminChromeProvider>
  );
}
