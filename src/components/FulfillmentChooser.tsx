import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Press } from '../ui';

/**
 * "How would you like your meals?" — the top-level fulfilment chooser on Home.
 * Delivered / Pickup are bound to the global `mode`; "My kitchen" is a navigation
 * into the existing in-home Cook-at-My-Place request flow (not a cart mode).
 */
export function FulfillmentChooser() {
  const c = useC();
  const router = useRouter();
  const { mode, setMode } = useStore();
  return (
    <View>
      <Text style={[type(11, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 9 }]}>How would you like your meals?</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Tile ico="truck" t="Delivered" active={mode === 'delivery'} onPress={() => setMode('delivery')} />
        <Tile ico="bag" t="Pickup" active={mode === 'pickup'} onPress={() => setMode('pickup')} />
        <Tile ico="chefhat" t="My kitchen" premium onPress={() => router.push('/request/cookhome')} />
      </View>
    </View>
  );
}

function Tile({ ico, t, active, premium, onPress }: { ico: string; t: string; active?: boolean; premium?: boolean; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.97} onPress={onPress} label={t} style={{ flex: 1 }}>
      <View style={[{ paddingVertical: 13, paddingHorizontal: 6, borderRadius: radius.md, alignItems: 'center', gap: 6, borderWidth: 1 }, active ? { backgroundColor: c.surface, borderColor: c.primary, ...shadow.soft } : { backgroundColor: c.bg2, borderColor: 'transparent' }]}>
        <Icon name={ico} size={20} color={active ? c.primary : c.soft} />
        <Text numberOfLines={1} style={[type(12, 800), { color: active ? c.ink : c.soft }]}>{t}</Text>
        {premium ? <View style={{ position: 'absolute', top: 7, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: c.purple }} /> : null}
      </View>
    </Press>
  );
}
