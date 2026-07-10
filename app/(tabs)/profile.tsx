import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, Platform, Modal, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Switch, Btn } from '../../src/ui';
import { SectionLabel } from '../../src/ui/layout';

type Tone = '' | 'amber' | 'purple' | 'blue' | 'pink' | 'green';
interface Row { ico: string; cls: Tone; t: string; act: () => void }

export default function Profile() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { resetOnboarding, darkMode, setDarkMode, logout, deleteAccount, toast, prepperStatus, applyToPrepper, isAdmin, name, location, saveName } = useStore();
  const initial = (name || '?').trim()[0]?.toUpperCase() ?? '?';

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const openEdit = () => { setDraft(name); setEditing(true); };
  const commitName = async () => {
    const nm = draft.trim();
    if (nm.length < 2) { toast('Please enter your name', 'info'); return; }
    setSavingName(true);
    try {
      await saveName(nm);
      setEditing(false);
      toast('Name updated', 'check', true);
    } catch (e: any) {
      toast(e?.message || 'Couldn’t save your name', 'x');
    } finally {
      setSavingName(false);
    }
  };

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
  ];
  const wallet: Row[] = [
    { ico: 'pin', cls: 'blue', t: 'Addresses', act: () => router.push('/addresses') },
    { ico: 'card', cls: 'pink', t: 'Payment methods', act: () => router.push('/payments') },
  ];
  const support: Row[] = [
    { ico: 'info', cls: 'purple', t: 'Your support requests', act: () => router.push('/tickets') },
  ];
  const prefs: Row[] = [
    { ico: 'repeat', cls: '', t: 'Replay onboarding', act: resetOnboarding },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        {/* hero */}
        <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 20, paddingBottom: 20, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <LinearGradient colors={['#FF8A4C', '#F26B1D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
            <Text style={[type(32, 900), { color: '#fff' }]}>{initial}</Text>
          </LinearGradient>
          <Press scale={0.97} onPress={openEdit} label="Edit your name">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}>
              <Text style={[type(21, 900), { color: c.ink, letterSpacing: -0.6 }]}>{name || 'Add your name'}</Text>
              <Icon name="edit" size={15} color={c.muted} />
            </View>
          </Press>
          <Text style={[type(13, 600), { color: c.soft, marginTop: 2 }]}>{location}</Text>
        </View>

        {/* become a preppa — state-aware */}
        <LinearGradient colors={['#FFF1E6', '#FFE0CC']} style={{ marginHorizontal: 16, borderRadius: radius.xl, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#FFD9BD' }}>
          <LinearGradient colors={['#FF8A4C', '#F26B1D']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
            <Icon name={prepperStatus === 'pending' ? 'clock' : 'chefhat'} size={26} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            {prepperStatus === 'approved' ? (
              <>
                <Text style={[type(16, 900), { color: '#1C1C1E' }]}>You’re a Preppa</Text>
                <Text style={[type(12.5, 600), { color: '#5A5A66', marginTop: 2 }]}>Manage orders, your menu & earnings in My Hub.</Text>
              </>
            ) : prepperStatus === 'pending' ? (
              <>
                <Text style={[type(16, 900), { color: '#1C1C1E' }]}>Application under review</Text>
                <Text style={[type(12.5, 600), { color: '#5A5A66', marginTop: 2 }]}>We’re verifying your kitchen — My Hub unlocks once approved.</Text>
              </>
            ) : (
              <>
                <Text style={[type(16, 900), { color: '#1C1C1E' }]}>Become a Preppa</Text>
                <Text style={[type(12.5, 600), { color: '#5A5A66', marginTop: 2 }]}>Cook for your neighbors and keep 85% — 0% fees for 60 days.</Text>
              </>
            )}
          </View>
          {prepperStatus === 'approved' ? (
            <Press scale={0.9} onPress={() => router.push('/my-hub')} label="Open My Hub">
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}><Icon name="arrow" size={18} color="#0E0E10" /></View>
            </Press>
          ) : prepperStatus === 'pending' ? (
            <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 6, ...shadow.soft }}>
              <Icon name="clock" size={13} color="#8A8A93" />
              <Text style={[type(11.5, 800), { color: '#5A5A66' }]}>In review</Text>
            </View>
          ) : (
            <Press scale={0.9} onPress={applyToPrepper} label="Apply to cook">
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}><Icon name="arrow" size={18} color="#0E0E10" /></View>
            </Press>
          )}
        </LinearGradient>

        {isAdmin && Platform.OS === 'web' ? (
          <Group label="Admin">
            <Pressable onPress={() => router.push('/admin')} style={rowStyle(c, true)}>
              <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="shield" size={19} color={c.primaryD} />
              </View>
              <Text style={[type(15, 700), { color: c.ink, flex: 1 }]}>Admin dashboard</Text>
              <Icon name="chevRight" size={18} color={c.muted} />
            </Pressable>
          </Group>
        ) : null}

        <Group label="Activity">
          {activity.map((r, i) => <RowItem key={r.t} {...r} last={i === activity.length - 1} />)}
        </Group>

        <Group label="Payment & delivery">
          {wallet.map((r, i) => <RowItem key={r.t} {...r} last={i === wallet.length - 1} />)}
        </Group>

        <Group label="Help & support">
          {support.map((r, i) => <RowItem key={r.t} {...r} last={i === support.length - 1} />)}
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

      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable onPress={() => !savingName && setEditing(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', paddingHorizontal: 28 }}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: c.surface, borderRadius: radius.xl, padding: 20, gap: 14, maxWidth: 420, width: '100%', alignSelf: 'center' }}>
            <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.4 }]}>Your name</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              placeholder="Your name"
              placeholderTextColor={c.muted}
              onSubmitEditing={commitName}
              style={{ height: 50, borderRadius: radius.md, paddingHorizontal: 14, backgroundColor: c.bg2, borderWidth: 1.5, borderColor: c.border, color: c.ink, fontFamily: type(16, 600).fontFamily, fontSize: 16 }}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn label="Cancel" variant="ghost" flex={1} onPress={() => setEditing(false)} />
              <Btn label="Save" flex={1} loading={savingName} onPress={commitName} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
