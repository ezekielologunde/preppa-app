import React from 'react';
import { View, Text, Pressable, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/ui/Icon';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { FLAGS } from '../../src/config/flags';

const TABS: Record<string, { ico: string; lbl: string }> = {
  home: { ico: 'home', lbl: 'Home' },
  orders: { ico: 'bag', lbl: 'Orders' },
  'my-hub': { ico: 'chefhat', lbl: 'My Hub' },
  profile: { ico: 'user', lbl: 'Profile' },
  // discover/experiences/feeds are reachable routes (from Home), not tab-bar entries.
};

function BottomNav({ state, navigation }: any) {
  const c = useC();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { prepperStatus } = useStore();
  if (width >= 700) return null; // wide screens use the persistent SideRail instead
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.border2,
        paddingTop: 9,
        paddingHorizontal: 8,
        paddingBottom: Math.max(insets.bottom, 10),
      }}
    >
      {state.routes.map((route: any, i: number) => {
        const meta = TABS[route.name];
        if (!meta) return null;
        if (route.name === 'my-hub' && prepperStatus !== 'approved') return null; // My Hub is prepper-only
        const focused = state.index === i;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };
        return (
          <Pressable key={route.key} onPress={onPress} style={{ flex: 1, alignItems: 'center', gap: 4, paddingTop: 2 }}>
            <Icon name={meta.ico} size={23} color={focused ? c.primary : c.muted} />
            <Text style={[type(10, 800), { color: focused ? c.primary : c.muted }]}>{meta.lbl}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { prepperStatus } = useStore();
  const hubApproved = prepperStatus === 'approved';
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <BottomNav {...props} />}>
      <Tabs.Screen name="home" />
      <Tabs.Screen name="orders" />
      <Tabs.Screen name="experiences" options={{ href: FLAGS.experiences ? undefined : null }} />
      <Tabs.Screen name="feeds" options={{ href: FLAGS.feed ? undefined : null }} />
      <Tabs.Screen name="my-hub" options={{ href: hubApproved ? undefined : null }} />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
