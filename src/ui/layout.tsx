import React from 'react';
import { View, Text, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow, tnum } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon } from './Icon';
import { Press } from './primitives';

/** Full-bleed screen background. */
export function Screen({ children, bg, style }: { children: React.ReactNode; bg?: string; style?: StyleProp<ViewStyle> }) {
  const c = useC();
  return <View style={[{ flex: 1, backgroundColor: bg ?? c.bg }, style]}>{children}</View>;
}

/** .thdr — pushed-screen title header with a back chevron. */
export function TopBar({ title, sub, right, onBack }: { title: string; sub?: string; right?: React.ReactNode; onBack?: () => void }) {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack ?? (() => router.back());
  return (
    <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
      <Press scale={0.9} onPress={back} label="Go back">
        <View style={[{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}>
          <Icon name="chevLeft" size={20} color={c.ink} />
        </View>
      </Press>
      <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.36, flex: 1 }]}>{title}</Text>
      {sub ? <Text style={[type(12, 600), { color: c.muted }]}>{sub}</Text> : null}
      {right}
    </View>
  );
}

/** .dock — docked CTA bar pinned to the bottom, safe-area aware. */
export function Dock({ children, column }: { children: React.ReactNode; column?: boolean }) {
  const c = useC();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border2, paddingHorizontal: 16, paddingTop: 14, paddingBottom: Math.max(insets.bottom, 14) + 8, flexDirection: column ? 'column' : 'row', alignItems: column ? 'stretch' : 'center', gap: column ? 10 : 14 }}>
      {children}
    </View>
  );
}

export function DockTotal({ label, value }: { label: string; value: string }) {
  const c = useC();
  return (
    <View>
      <Text style={[type(11, 700), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{label}</Text>
      <Text style={[type(22, 900), { color: c.ink, letterSpacing: -0.6 }, tnum]}>{value}</Text>
    </View>
  );
}

/** .block — white rounded section with an uppercase title. */
export function Block({ title, children, style }: { title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useC();
  return (
    <View style={[{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, marginTop: 14, padding: 16, borderWidth: 1, borderColor: c.border2 }, style]}>
      {title ? <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }]}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** .d-section-t — inline uppercase divider label. */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useC();
  return <Text style={[type(13, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 22, marginBottom: 8 }, style as any]}>{children}</Text>;
}

export function MiniTag({ label, tone = 'purple' }: { label: string; tone?: 'purple' | 'green' }) {
  const c = useC();
  const bg = tone === 'green' ? c.greenL : c.purpleL;
  const fg = tone === 'green' ? c.green : c.purple;
  return <Text style={[type(10, 900), { color: fg, backgroundColor: bg, textTransform: 'uppercase', letterSpacing: 0.3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' }]}>{label}</Text>;
}

/** .empty — centered empty-state. */
export function Empty({ icon, title, body, action }: { icon: string; title: string; body: string; action?: React.ReactNode }) {
  const c = useC();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={30} color={c.muted} />
      </View>
      <Text style={[type(18, 900), { color: c.ink, marginTop: 18 }]}>{title}</Text>
      <Text style={[type(14, 500), { color: c.soft, textAlign: 'center', maxWidth: 240, marginTop: 8, lineHeight: 21 }]}>{body}</Text>
      {action ? <View style={{ marginTop: 18 }}>{action}</View> : null}
    </View>
  );
}

/** Toast overlay — renders active toasts near the bottom. */
export function ToastHost() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const { toasts } = useStore();
  if (toasts.length === 0) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 96, gap: 8 }}>
      {toasts.map((t) => (
        <View key={t.id} style={{ backgroundColor: 'rgba(20,20,22,.94)', borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11, ...shadow.float }}>
          <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: t.green ? c.green : c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={t.icon} size={15} color="#fff" />
          </View>
          <Text style={[type(13.5, 700), { color: '#fff', flex: 1 }]}>{t.msg}</Text>
        </View>
      ))}
    </View>
  );
}
