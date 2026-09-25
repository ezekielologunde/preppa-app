import * as SecureStore from 'expo-secure-store';

// Supabase's native session contains refresh credentials. Keep it in the OS-backed
// keychain/keystore and prevent it from migrating to another device via backup restore.
export const authStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  }),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};
