import React, { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
  Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
} from '@expo-google-fonts/inter';
import { StoreProvider, useStore } from '../src/store/store';
import { ThemeProvider, useIsDark } from '../src/theme/ThemeContext';
import { ToastHost } from '../src/ui';
import { CartFlash } from '../src/components/CartFlash';
import { SplashOverlay } from '../src/components/Splash';
import { OnboardingFlow } from '../src/components/Onboarding';
import { SideRail } from '../src/components/SideRail';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold,
    Inter_700Bold, Inter_800ExtraBold, Inter_900Black,
  });
  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;
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
  const isDark = useIsDark();
  const { width } = useWindowDimensions();
  const wide = width >= 700;
  const railW = width >= 1000 ? 240 : 84;
  const [showSplash, setShowSplash] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2100);
    return () => clearTimeout(t);
  }, []);
  const bg = isDark ? '#151210' : '#F7F7F9';
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
      {showSplash ? <SplashOverlay /> : null}
    </View>
  );
}
