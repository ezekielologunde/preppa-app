import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COOKS, CookId } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Avatar } from '../../src/ui';
import { Screen } from '../../src/ui/layout';
import { NotFound } from '../../src/components/NotFound';

const BUBBLES = [
  { me: false, t: 'Hi! Your order is in the oven now 🔥' },
  { me: false, t: 'I’ll ping you when it’s boxed — about 20 min.' },
  { me: true, t: 'Amazing, thank you! Cash on delivery is fine?' },
  { me: false, t: 'Of course. We’ll confirm the amount with the QR code at handoff 👍' },
];

export default function Chat() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook: string }>();
  const { toast } = useStore();
  const cd = COOKS[cook as CookId];
  if (!cd) return <NotFound title="Chat" />;
  const first = cd.name.split(' ')[0];

  return (
    <Screen>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <Press scale={0.9} onPress={() => router.back()}>
          <View style={[{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}><Icon name="chevLeft" size={20} color={c.ink} /></View>
        </Press>
        <Avatar cook={cook as CookId} size={36} rad={12} />
        <View style={{ flex: 1 }}>
          <Text style={[type(16, 900), { color: c.ink }]}>{cd.name}</Text>
          <Text style={[type(12, 700), { color: c.green }]}>● Online now</Text>
        </View>
        <Press scale={0.9} onPress={() => toast('Calling… (demo)', 'phone')}>
          <View style={[{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}><Icon name="phone" size={18} color={c.ink} /></View>
        </Press>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Text style={[type(11, 700), { color: c.muted, textAlign: 'center', marginBottom: 4 }]}>TODAY</Text>
        {BUBBLES.map((b, i) => (
          <View key={i} style={{ alignSelf: b.me ? 'flex-end' : 'flex-start', maxWidth: '78%', backgroundColor: b.me ? c.primary : c.surface, borderWidth: b.me ? 0 : 1, borderColor: c.border2, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 18, borderBottomRightRadius: b.me ? 4 : 18, borderBottomLeftRadius: b.me ? 18 : 4 }}>
            <Text style={[type(14, 500), { color: b.me ? '#fff' : c.ink, lineHeight: 20 }]}>{b.t}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border2, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, paddingBottom: Math.max(insets.bottom, 12) }}>
        <Press scale={0.99} onPress={() => toast('Demo only — messaging is read-only')} style={{ flex: 1 }}>
          <View style={{ height: 48, borderRadius: radius.md, backgroundColor: c.bg2, justifyContent: 'center', paddingHorizontal: 16 }}>
            <Text style={[type(14, 500), { color: c.muted }]}>Message {first}…</Text>
          </View>
        </Press>
        <Press scale={0.94} onPress={() => toast('Demo only — messaging is read-only')}>
          <View style={{ width: 52, height: 48, borderRadius: radius.md, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="send" size={20} color="#fff" /></View>
        </Press>
      </View>
    </Screen>
  );
}
