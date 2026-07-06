import React from 'react';
import { View, Text, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MEALS, EXPERIENCES, dailyDropId } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';
import { HeroDrop, MealGrid, ExpRail, SectionHeader } from '../../src/components/cards';

function greetWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const MODES: { id: 'delivery' | 'pickup'; t: string; ico: string }[] = [
  { id: 'delivery', t: 'Delivery', ico: 'truck' },
  { id: 'pickup', t: 'Pickup', ico: 'bag' },
];

export default function HomeScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode, setMode, cartCount, notifCount, toast } = useStore();
  const { width } = useWindowDimensions();
  const wide = width >= 700; // logo + actions live in the SideRail on wide screens
  const dropId = dailyDropId();
  const picks = MEALS.filter((m) => m.id !== dropId).slice(0, 4);

  return (
    <View style={{ flex: 1, backgroundColor: c.primaryL, paddingTop: insets.top }}>
      <ScrollView
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        style={{ backgroundColor: c.bg }}
      >
        {/* [0] header wash */}
        <LinearGradient colors={[c.primaryL, c.surface]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18 }}>
          {!wide ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
                  <Icon name="flame" size={16} color="#fff" />
                </View>
                <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.7 }]}>preppa</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 9 }}>
                <HdrIcon name="bell" dot={notifCount > 0} onPress={() => router.push('/notifications')} />
                <HdrIcon name="cart" dot={cartCount > 0} onPress={() => router.push('/cart')} />
              </View>
            </View>
          ) : null}

          <Press scale={0.98} onPress={() => toast('Change location coming soon', 'pin')} style={{ marginTop: wide ? 0 : 14, alignSelf: 'flex-start' }}>
            <Text style={[type(11, 700), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6 }]}>{mode === 'pickup' ? 'Pick up in' : 'Deliver to'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <Icon name="pin" size={15} color={c.ink} />
              <Text style={[type(16, 800), { color: c.ink, letterSpacing: -0.3 }]}>Atlanta, GA</Text>
              <Icon name="chevDown" size={15} color={c.muted} />
            </View>
          </Press>

          <View style={{ marginTop: 24 }}>
            <Text style={[type(29, 900), { color: c.ink, letterSpacing: -1.2, lineHeight: 31 }]}>
              {greetWord()}, <Text style={{ color: c.primary }}>Jordan</Text>
            </Text>
            <Text style={[type(15.5, 500), { color: c.soft, marginTop: 7 }]}>What sounds good tonight?</Text>
          </View>

          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: c.bg2, padding: 4, borderRadius: 13, marginTop: 14, gap: 4 }}>
            {MODES.map((m) => {
              const on = mode === m.id;
              return (
                <Pressable key={m.id} onPress={() => setMode(m.id)} style={[{ height: 36, paddingHorizontal: 18, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }, on ? { backgroundColor: c.surface, ...shadow.soft } : null]}>
                  <Icon name={m.ico} size={15} color={on ? c.ink : c.soft} />
                  <Text style={[type(13.5, 700), { color: on ? c.ink : c.soft }]}>{m.t}</Text>
                </Pressable>
              );
            })}
          </View>
        </LinearGradient>

        {/* [1] sticky search */}
        <View style={{ backgroundColor: c.bg, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 }}>
          <Press scale={0.99} onPress={() => router.push('/explore')}>
            <View style={{ height: 54, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 17, ...shadow.soft }}>
              <Icon name="search" size={18} color={c.muted} />
              <Text style={[type(15, 600), { color: c.muted }]}>Search meals, cooks, cuisines…</Text>
            </View>
          </Press>
        </View>

        {/* [2+] content */}
        <SectionHeader title="Today’s drop" />
        <HeroDrop id={dropId} />

        <SectionHeader title="Fresh near you" action="See all" onAction={() => router.push('/explore')} />
        <MealGrid meals={picks} />

        <SectionHeader title="Prep experiences" action="See all" onAction={() => router.push('/experiences')} />
        <ExpRail exps={EXPERIENCES.slice(0, 4)} />

        <View style={{ height: 8 }} />
        <ShortcutCard icon="chefhat" grad={['#FF8A4C', c.primary]} title="Cook at My Place" body="A private chef in your kitchen — compare fixed quotes" onPress={() => router.push('/request/cookhome')} />
        <ShortcutCard icon="repeat" grad={['#A855F7', c.purple]} title="Weekly meal plans" body="Subscribe to a cook’s box — pause or swap anytime" onPress={() => router.push('/plans')} />
      </ScrollView>
    </View>
  );
}

function HdrIcon({ name, dot, onPress }: { name: string; dot?: boolean; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.9} onPress={onPress} label={name === 'bell' ? 'Notifications' : 'Cart'}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={name} size={19} color={c.ink2} />
        {dot ? <View style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, borderWidth: 2, borderColor: c.bg2 }} /> : null}
      </View>
    </Press>
  );
}

function ShortcutCard({ icon, grad, title, body, onPress }: { icon: string; grad: readonly string[]; title: string; body: string; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.98} onPress={onPress} style={{ marginHorizontal: 20, marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2 }}>
        <LinearGradient colors={grad as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
          <Icon name={icon} size={22} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={[type(15.5, 800), { color: c.ink }]}>{title}</Text>
          <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2 }]}>{body}</Text>
        </View>
        <Icon name="chevRight" size={18} color={c.muted} />
      </View>
    </Press>
  );
}
