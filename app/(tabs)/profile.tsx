import React from 'react';
import { View, Text, ScrollView, Pressable, Alert, Platform, Image, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow, BRAND_GRAD } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Switch } from '../../src/ui';
import { SectionLabel } from '../../src/ui/layout';
import { FLAGS } from '../../src/config/flags';

type Tone = '' | 'amber' | 'purple' | 'blue' | 'pink' | 'green';
interface Row { ico: string; cls: Tone; t: string; act: () => void }

// Required for App Store / Play Store review — a discoverable in-app link to the privacy
// policy and terms, served from the marketing site's help center (preppa.live), not this app.
const HELP_URL = 'https://preppa.live/help-site';
const CONTACT_URL = 'https://preppa.live/help-site/support';
const PRIVACY_URL = 'https://preppa.live/help-site/legal/privacy';
const TERMS_URL = 'https://preppa.live/help-site/legal/terms';

export default function Profile() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { darkMode, setDarkMode, logout, deleteAccount, toast, prepperStatus, isAdmin, isPrepPlus, name, location, avatarUrl } = useStore();
  const initial = (name || '?').trim()[0]?.toUpperCase() ?? '?';
  const openLink = (url: string) => Linking.openURL(url).catch(() => toast('Couldn’t open the link', 'info'));

  const confirmDelete = () => {
    Alert.alert(
      'Delete account',
      'This disables sign-in and removes your personal info. Order history is kept in anonymized form for records. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              await deleteAccount();
              toast('Account deleted', 'x');
            } catch (e: any) {
              toast(e?.message || 'Could not delete your account. Please try again.', 'info');
            }
          },
        },
      ],
    );
  };

  // grouped so the screen reads as clear sections instead of one long list
  const activity: Row[] = [
    { ico: 'ticket', cls: 'amber', t: 'Your orders', act: () => router.push('/orders') },
    { ico: 'heart', cls: 'pink', t: 'Favorites', act: () => router.push('/favorites') },
    ...(FLAGS.feed ? [{ ico: 'bookmark', cls: 'blue' as Tone, t: 'Saved posts', act: () => router.push('/saved') }] : []),
  ];
  const wallet: Row[] = [
    { ico: 'pin', cls: 'blue', t: 'Addresses', act: () => router.push('/addresses') },
    { ico: 'card', cls: 'pink', t: 'Payment methods', act: () => router.push('/payments') },
  ];
  const support: Row[] = [
    { ico: 'info', cls: 'purple', t: 'Your support requests', act: () => router.push('/tickets') },
    { ico: 'chat', cls: 'green', t: 'Contact support', act: () => openLink(CONTACT_URL) },
    { ico: 'help', cls: '', t: 'Help center', act: () => openLink(HELP_URL) },
    { ico: 'shield', cls: '', t: 'Privacy policy', act: () => openLink(PRIVACY_URL) },
    { ico: 'lock', cls: '', t: 'Terms of service', act: () => openLink(TERMS_URL) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        {/* hero */}
        <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 20, paddingBottom: 20, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <View style={{ borderRadius: 26, ...shadow.brand }}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: 80, height: 80, borderRadius: 26, backgroundColor: c.bg2 }} resizeMode="cover" />
            ) : (
              <LinearGradient colors={BRAND_GRAD as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 80, height: 80, borderRadius: 26, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(32, 900), { color: '#fff' }]}>{initial}</Text>
              </LinearGradient>
            )}
          </View>
          <Press scale={0.97} onPress={() => router.push('/edit-profile')} label="Edit profile">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12 }}>
              <Text style={[type(21, 900), { color: c.ink, letterSpacing: -0.6 }]}>{name || 'Add your name'}</Text>
              <Icon name="edit" size={15} color={c.muted} />
            </View>
          </Press>
          <Text style={[type(13, 600), { color: c.soft, marginTop: 2 }]}>{location}</Text>
        </View>

        {/* become a preppa — state-aware (themed: warm tint that adapts to dark) */}
        <View style={{ marginHorizontal: 16, marginTop: 16, borderRadius: radius.xl, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: c.border2, backgroundColor: c.primaryL }}>
          <LinearGradient colors={BRAND_GRAD as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
            <Icon name={prepperStatus === 'pending' ? 'clock' : 'chefhat'} size={26} color="#fff" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            {prepperStatus === 'approved' ? (
              <>
                <Text style={[type(16, 900), { color: c.ink }]}>You’re a Preppa</Text>
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>Manage orders, your menu & earnings in My Hub.</Text>
              </>
            ) : prepperStatus === 'pending' ? (
              <>
                <Text style={[type(16, 900), { color: c.ink }]}>Application under review</Text>
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>We’re verifying your kitchen — My Hub unlocks once approved.</Text>
              </>
            ) : (
              <>
                <Text style={[type(16, 900), { color: c.ink }]}>Become a Preppa</Text>
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>Cook for your neighbors and keep 85% — 0% fees for 60 days.</Text>
              </>
            )}
          </View>
          {prepperStatus === 'approved' ? (
            <Press scale={0.9} onPress={() => router.push('/my-hub')} label="Open My Hub">
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}><Icon name="arrow" size={18} color={c.ink} /></View>
            </Press>
          ) : prepperStatus === 'pending' ? (
            <View style={{ height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: c.surface, flexDirection: 'row', alignItems: 'center', gap: 6, ...shadow.soft }}>
              <Icon name="clock" size={13} color={c.muted} />
              <Text style={[type(11.5, 800), { color: c.soft }]}>In review</Text>
            </View>
          ) : (
            <Press scale={0.9} onPress={() => router.push('/apply')} label="Apply to cook">
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}><Icon name="arrow" size={18} color={c.ink} /></View>
            </Press>
          )}
        </View>

        {/* PrepPlus — web-only entry (IAP policy). State-aware upsell vs member badge. */}
        {FLAGS.prepplus && Platform.OS === 'web' ? (
          <Press scale={0.98} onPress={() => router.push('/prepplus')} label="PrepPlus"
            style={{ marginHorizontal: 16, marginTop: 16, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
            <LinearGradient colors={['#6B4A93', '#E0490F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="bolt" size={23} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[type(16, 900), { color: '#fff' }]}>{isPrepPlus ? 'PrepPlus member' : 'Join PrepPlus'}</Text>
                <Text style={[type(12.5, 600), { color: 'rgba(255,255,255,.9)', marginTop: 2 }]}>
                  {isPrepPlus ? 'Manage your membership & perks' : 'Fee-free private chefs, catering & meal plans'}
                </Text>
              </View>
              {isPrepPlus
                ? <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: 'rgba(255,255,255,.22)', alignItems: 'center', justifyContent: 'center' }}><Text style={[type(11, 900), { color: '#fff' }]}>ACTIVE</Text></View>
                : <Icon name="arrow" size={18} color="#fff" />}
            </LinearGradient>
          </Press>
        ) : null}

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
          <Pressable onPress={() => setDarkMode(!darkMode)} style={rowStyle(c, true)} accessibilityRole="switch" accessibilityLabel="Dark mode" accessibilityState={{ checked: darkMode }}>
            <IconWell ico={darkMode ? 'bolt' : 'settings'} tone="purple" />
            <Text style={[type(15, 700), { color: c.ink, flex: 1 }]}>Dark mode</Text>
            <Switch on={darkMode} />
          </Pressable>
        </Group>

        <Group>
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
        </Group>

        <Text style={[type(12, 700), { color: c.muted, textAlign: 'center', padding: 20 }]}>preppa · v1.0</Text>
      </ScrollView>
    </View>
  );
}

function rowStyle(c: any, last: boolean) {
  return { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 13, paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.border2 };
}

function Group({ label, children }: { label?: string; children: React.ReactNode }) {
  const c = useC();
  return (
    <>
      {label ? <SectionLabel style={{ marginLeft: 20, marginRight: 20, marginTop: 20, marginBottom: 8 }}>{label}</SectionLabel> : null}
      <View style={{ backgroundColor: c.surface, borderRadius: radius.card, marginHorizontal: 16, marginTop: label ? 0 : 20, borderWidth: 1, borderColor: c.border2, overflow: 'hidden' }}>
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
    purple: [c.purpleL, c.purpleOn],
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
