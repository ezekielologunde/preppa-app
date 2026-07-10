/**
 * Sticky admin page header: back chevron (optional), title/subtitle, a ⌘K
 * command-palette trigger, and an optional right slot. Tokenized; matches the
 * app's `TopBar` visual language but adds the palette affordance.
 */
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useC } from '../../theme/ThemeContext';
import { type, radius, shadow } from '../../theme/theme';
import { Press, Icon } from '../../ui';
import { useAdminChrome } from './CommandPalette';

export function AdminHeader({
  title,
  sub,
  back,
  right,
}: {
  title: string;
  sub?: string;
  /** Show a back chevron; pass a handler or `true` for router.back(). */
  back?: (() => void) | true;
  right?: React.ReactNode;
}) {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { openPalette } = useAdminChrome();
  const onBack = back === true ? () => router.back() : back || undefined;

  return (
    <View
      style={{
        backgroundColor: c.surface,
        paddingTop: insets.top + 12,
        paddingBottom: 12,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: c.border2,
      }}
    >
      {onBack ? (
        <Press scale={0.9} onPress={onBack} label="Go back" hitSlop={6}>
          <View style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}>
            <Icon name="chevLeft" size={20} color={c.ink} />
          </View>
        </Press>
      ) : (
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="shield" size={20} color={c.surface} />
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.36 }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[type(12, 600), { color: c.muted }]} numberOfLines={1}>{sub}</Text> : null}
      </View>

      {right}

      <Press onPress={openPalette} label="Open command palette" hitSlop={6}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg2 }}>
          <Icon name="search" size={15} color={c.soft} />
          {Platform.OS === 'web' ? <Text style={[type(12, 800), { color: c.muted }]}>⌘K</Text> : null}
        </View>
      </Press>
    </View>
  );
}
