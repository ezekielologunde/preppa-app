import React from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow, WARM_GRAD } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Switch } from '../../src/ui';
import { SectionLabel } from '../../src/ui/layout';

type Tone = '' | 'amber' | 'purple' | 'blue' | 'pink' | 'green';
interface Row { ico: string; cls: Tone; t: string; act: () => void }

export default function Profile() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resetOnboarding, darkMode, setDarkMode, logout, deleteAccount, toast } = useStore();

  const confirmDelete = () => {
    Alert.alert(
      'Delete account',
      'This permanently removes your account, orders, and saved data. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => { deleteAccount(); toast('Account deleted', 'x'); } },
      ],
    );
  };

  // grouped so the screen reads as clear sections instead of one long list
  const activity: Row[] = [
    { ico: 'ticket', cls: 'amber', t: 'Your orders', act: () => router.push('/orders') },
    { ico: 'heart', cls: 'pink', t: 'Favorites', act: () => router.push('/favorites') },
    { ico: 'calendar', cls: 'purple', t: 'Your experiences', act: () => router.push('/experiences') },
  ];
  const wallet: Row[] = [
    { ico: 'pin', cls: 'blue', t: 'Addresses', act: () => router.push('/addresses') },
    { ico: 'card', cls: 'pink', t: 'Payment methods', act: () => router.push('/payments') },
  ];
  const perks: Row[] = [
    { ico: 'repeat', cls: 'amber', t: 'Meal plans & subscriptions', act: () => router.push('/plans') },
    { ico: 'gift', cls: 'green', t: 'Rewards & referrals', act: () => router.push('/rewards') },
    { ico: 'shield', cls: 'purple', t: 'PrepPlus membership', act: () => router.push('/prepplus') },
  ];
  const prefs: Row[] = [
    { ico: 'help', cls: '', t: 'Help & safety', act: () => toast('Help center — demo') },
    { ico: 'repeat', cls: '', t: 'Replay onboarding', act: resetOnboarding },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        {/* hero */}
        <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 8, paddingBottom: 20, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', width: '100%' }}>
            <Press scale={0.9} onPress={() => toast('Settings — demo', 'settings')} label="Settings">
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
          <Press scale={0.9} onPress={() => toast('Apply to cook — demo 👩‍🍳')} label="Apply to cook">
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}><Icon name="arrow" size={18} color="#0E0E10" /></View>
          </Press>
        </LinearGradient>

        <Group label="Activity">
          {activity.map((r, i) => <RowItem key={r.t} {...r} last={i === activity.length - 1} />)}
        </Group>

        <Group label="Payment & delivery">
          {wallet.map((r, i) => <RowItem key={r.t} {...r} last={i === wallet.length - 1} />)}
        </Group>

        <Group label="Rewards & membership">
          {perks.map((r, i) => <RowItem key={r.t} {...r} last={i === perks.length - 1} />)}
        </Group>

        <Group label="Preferences">
          <Pressable onPress={() => setDarkMode(!darkMode)} style={rowStyle(c, false)}>
            <IconWell ico={darkMode ? 'bolt' : 'settings'} tone="purple" />
            <Text style={[type(15, 700), { color: c.ink, flex: 1 }]}>Dark mode</Text>
            <Switch on={darkMode} />
          </Pressable>
          {prefs.map((r, i) => <RowItem key={r.t} {...r} last={i === prefs.length - 1} />)}
        </Group>

        <View style={{ height: 12 }} />
        <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, borderWidth: 1, borderColor: c.border2, overflow: 'hidden' }}>
          <Pressable onPress={logout} style={rowStyle(c, false)}>
            <IconWell ico="logout" tone="" />
            <Text style={[type(15, 700), { color: c.ink, flex: 1 }]}>Log out</Text>
          </Pressable>
          <Pressable onPress={confirmDelete} style={rowStyle(c, true)}>
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.pinkL, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="x" size={19} color={c.red} />
            </View>
            <Text style={[type(15, 700), { color: c.red, flex: 1 }]}>Delete account</Text>
          </Pressable>
        </View>

        <Text style={[type(12, 700), { color: c.muted, textAlign: 'center', padding: 20 }]}>preppa · v1.0</Text>
      </ScrollView>
    </View>
  );
}

function rowStyle(c: any, last: boolean) {
  return { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 13, paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border2 };
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  const c = useC();
  return (
    <>
      <SectionLabel style={{ marginLeft: 20, marginRight: 20, marginTop: 20, marginBottom: 8 }}>{label}</SectionLabel>
      <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, borderWidth: 1, borderColor: c.border2, overflow: 'hidden' }}>
        {children}
      </View>
    </>
  );
}

function RowItem({ ico, cls, t, act, last }: Row & { last?: boolean }) {
  const c = useC();
  return (
    <Pressable onPress={act} style={rowStyle(c, !!last)}>
      <IconWell ico={ico} tone={cls} />
      <Text style={[type(15, 700), { color: c.ink, flex: 1 }]}>{t}</Text>
      <Icon name="chevRight" size={18} color={c.muted} />
    </Pressable>
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
