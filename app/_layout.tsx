import React, { useEffect } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from '@expo-google-fonts/hanken-grotesk';
import {
  HankenGrotesk_400Regular, HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold, HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  Fraunces_400Regular, Fraunces_500Medium,
  Fraunces_600SemiBold, Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { StoreProvider, useStore } from '../src/store/store';
import { ThemeProvider, useIsDark } from '../src/theme/ThemeContext';
import { ToastHost } from '../src/ui';
import { CartFlash } from '../src/components/CartFlash';
import { SplashOverlay } from '../src/components/Splash';
import { OnboardingFlow } from '../src/components/Onboarding';
import { SideRail } from '../src/components/SideRail';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ApprovalWelcomeOverlay } from '../src/components/ApprovalWelcomeOverlay';
import { useNotificationTapNavigation } from '../src/lib/push';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Hanken Grotesk (UI, 400/500/600/700) + Fraunces (editorial serif, hero-only). The old
  // 800/900 weights are gone — the FONT map in theme.ts caps that reflex at 700, so ~480
  // legacy `type(…,900)` sites de-shout without touching a single call site.
  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular, HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold, HankenGrotesk_700Bold,
    Fraunces_400Regular, Fraunces_500Medium,
    Fraunces_600SemiBold, Fraunces_700Bold,
  });
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);
  // Don't block first paint on all 6 font weights — render immediately; the branded
  // SplashOverlay (gated on store `ready`) covers the brief font swap.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <Themed />
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Themed() {
  const { darkMode } = useStore();
  return (
    <ThemeProvider isDark={darkMode}>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const { ready, onboarded } = useStore();
  useNotificationTapNavigation();
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const railW = width >= 1000 ? 240 : 84;
  // The branded splash covers boot until store hydration (`ready`, an AsyncStorage read of
  // ~tens of ms) so a dark-mode user never first-paints the light theme. It self-manages its
  // exit: it stays mounted and fades out gracefully once `ready` flips, rather than being
  // hard-unmounted mid-animation. No artificial minimum delay (a fixed 1400ms floor is gone).
  const bg = isDark ? '#15120F' : '#FAFAF9';
  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ErrorBoundary>
        <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column' }}>
          {wide ? <SideRail width={railW} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: bg } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(tabs)" />
            </Stack>
          </View>
        </View>
      </ErrorBoundary>
      <ToastHost />
      <CartFlash />
      {ready && !onboarded ? <OnboardingFlow /> : null}
      {ready && onboarded ? <ApprovalWelcomeOverlay /> : null}
      <SplashOverlay done={ready} />
    </View>
  );
}
