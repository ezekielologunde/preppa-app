import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow, WARM_GRAD } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';

type Tone = '' | 'amber' | 'purple' | 'blue' | 'pink' | 'green';

export default function Profile() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resetOnboarding, darkMode, setDarkMode, toast } = useStore();

  const rows: { ico: string; cls: Tone; t: string; act: () => void }[] = [
    { ico: 'ticket', cls: 'amber', t: 'Your orders', act: () => router.push('/orders') },
    { ico: 'heart', cls: 'pink', t: 'Favorites', act: () => router.push('/favorites') },
    { ico: 'repeat', cls: 'amber', t: 'Meal plans & subscriptions', act: () => router.push('/plans') },
    { ico: 'calendar', cls: 'purple', t: 'Your experiences', act: () => router.push('/experiences') },
    { ico: 'pin', cls: 'blue', t: 'Addresses', act: () => router.push('/addresses') },
    { ico: 'card', cls: 'pink', t: 'Payment methods', act: () => router.push('/payments') },
    { ico: 'gift', cls: 'green', t: 'Rewards & referrals', act: () => router.push('/rewards') },
    { ico: 'shield', cls: 'purple', t: 'PrepPlus membership', act: () => router.push('/prepplus') },
    { ico: 'help', cls: '', t: 'Help & safety', act: () => toast('Help center — demo') },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* hero */}
        <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 8, paddingBottom: 20, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', width: '100%' }}>
            <Press scale={0.9} onPress={() => toast('Settings — demo', 'settings')}>
              <View style={[{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}><Icon name="settings" size={18} color={c.ink} /></View>
            </Press>
          </View>
          <LinearGradient colors={['#FF8A4C', '#F26B1D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
            <Text style={[type(32, 900), { color: '#fff' }]}>J</Text>
          </LinearGradient>
          <Text style={[type(21, 900), { color: c.ink, letterSpacing: -0.6, marginTop: 12 }]}>Jordan Miller</Text>
          <Text style={[type(13, 600), { color: c.soft, marginTop: 2 }]}>Member since 2024 · Atlanta, GA</Text>
        </View>

        {/* rewards */}
        <Press scale={0.99} onPress={() => router.push('/rewards')}>
        <LinearGradient colors={['#1C1C1E', '#0E0D12']} style={{ margin: 16, borderRadius: radius.xl, padding: 18, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={[type(11, 800), { color: 'rgba(255,255,255,.6)', textTransform: 'uppercase' }]}>Preppa Rewards</Text>
              <Text style={[type(30, 900), { color: '#fff', letterSpacing: -0.8, marginTop: 2 }]}>340 pts</Text>
            </View>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(242,107,29,.2)', alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={20} color={c.primary} /></View>
          </View>
          <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,.14)', marginTop: 14, overflow: 'hidden' }}>
            <LinearGradient colors={WARM_GRAD as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: '68%', height: '100%', borderRadius: radius.pill }} />
          </View>
          <Text style={[type(12, 600), { color: 'rgba(255,255,255,.7)', marginTop: 12 }]}>160 pts to your next <Text style={{ color: '#fff', fontFamily: type(12, 800).fontFamily }}>free delivery</Text> reward.</Text>
        </LinearGradient>
        </Press>

        {/* become a preppa */}
        <LinearGradient colors={['#FFF1E6', '#FFE0CC']} style={{ marginHorizontal: 16, borderRadius: radius.xl, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#FFD9BD' }}>
          <LinearGradient colors={['#FF8A4C', '#F26B1D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}><Icon name="chefhat" size={26} color="#fff" /></LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={[type(16, 900), { color: '#1C1C1E' }]}>Become a Preppa</Text>
            <Text style={[type(12.5, 600), { color: '#5A5A66', marginTop: 2 }]}>Cook for your neighbors and keep 85% — 0% fees for 60 days.</Text>
          </View>
          <Press scale={0.9} onPress={() => toast('Apply to cook — demo 👩‍🍳')}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}><Icon name="arrow" size={18} color="#0E0E10" /></View>
          </Press>
        </LinearGradient>

        {/* appearance */}
        <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: c.border2, overflow: 'hidden' }}>
          <Pressable onPress={() => setDarkMode(!darkMode)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 16 }}>
            <IconWell ico={darkMode ? 'bolt' : 'settings'} tone="purple" />
            <Text style={[type(15, 700), { color: c.ink, flex: 1 }]}>Dark mode</Text>
            <Switch on={darkMode} />
          </Pressable>
        </View>

        {/* rows */}
        <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, marginTop: 16, borderWidth: 1, borderColor: c.border2, overflow: 'hidden' }}>
          {rows.map((r, i) => (
            <Pressable key={i} onPress={r.act} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: i < rows.length - 1 ? 1 : 0, borderBottomColor: c.border2 }}>
              <IconWell ico={r.ico} tone={r.cls} />
              <Text style={[type(15, 700), { color: c.ink, flex: 1 }]}>{r.t}</Text>
              <Icon name="chevRight" size={18} color={c.muted} />
            </Pressable>
          ))}
        </View>

        <Press scale={0.98} onPress={resetOnboarding} style={{ marginHorizontal: 16, marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 15, paddingHorizontal: 16, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface }}>
            <IconWell ico="repeat" tone="" />
            <Text style={[type(15, 700), { color: c.soft, flex: 1 }]}>Replay onboarding</Text>
            <Icon name="chevRight" size={18} color={c.muted} />
          </View>
        </Press>

        <Text style={[type(12, 700), { color: c.muted, textAlign: 'center', padding: 20 }]}>preppa · v1.0 — prototype</Text>
      </ScrollView>
    </View>
  );
}

function IconWell({ ico, tone }: { ico: string; tone: Tone }) {
  const c = useC();
  const map: Record<Tone, [string, string]> = {
    '': [c.bg2, c.ink2],
    amber: [c.primaryL, c.primary],
    purple: [c.purpleL, c.purple],
    blue: [c.blueL, c.blue],
    pink: [c.pinkL, c.pink],
    green: [c.greenL, c.green],
  };
  const [bg, fg] = map[tone];
  return (
    <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={ico} size={19} color={fg} />
    </View>
  );
}

export function Switch({ on }: { on: boolean }) {
  const c = useC();
  return (
    <View style={{ width: 46, height: 28, borderRadius: radius.pill, backgroundColor: on ? c.green : c.bg2, justifyContent: 'center', padding: 3 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', transform: [{ translateX: on ? 18 : 0 }], ...shadow.soft }} />
    </View>
  );
}
