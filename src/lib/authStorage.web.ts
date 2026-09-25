import AsyncStorage from '@react-native-async-storage/async-storage';

// Browsers do not expose an OS keychain to Expo. Supabase needs persistent web
// storage for reload/session restore; native builds resolve authStorage.ts instead.
export const authStorage = AsyncStorage;
