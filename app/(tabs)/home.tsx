import React, { useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { MEALS, COOKS, CookId, dailyDropId } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';
import { HeroDrop, MealGrid, SectionHeader, CookRail } from '../../src/components/cards';
import { ModeToggle } from '../../src/components/ModeToggle';
import { LocationPicker } from '../../src/components/LocationPicker';
import { FLAGS } from '../../src/config/flags';

const CUISINES = ['Comfort', 'Healthy', 'Halal', 'Mexican', 'Seafood', 'Soul food'];

function greetWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode, location, cartCount, notifCount, fav, firstName } = useStore();
  const { width } = useWindowDimensions();
  const wide = width >= 700; // logo + actions live in the SideRail on wide screens
  const [locPicker, setLocPicker] = useState(false);
  const dropId = dailyDropId();
  const picks = MEALS.filter((m) => m.id !== dropId).slice(0, 4);
  const favMeals = MEALS.filter((m) => fav.has(m.id));

  return (
    <View style={{ flex: 1, backgroundColor: c.primaryL, paddingTop: insets.top }}>
      <ScrollView
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}
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
                {FLAGS.notifications ? <HdrIcon name="bell" dot={notifCount > 0} onPress={() => router.push('/notifications')} /> : null}
                <HdrIcon name="cart" dot={cartCount > 0} onPress={() => router.push('/cart')} />
              </View>
            </View>
          ) : null}

          <Press scale={0.98} onPress={() => setLocPicker(true)} label="Change location" style={{ marginTop: wide ? 0 : 14, alignSelf: 'flex-start' }}>
            <Text style={[type(11, 700), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6 }]}>{mode === 'pickup' ? 'Pick up in' : 'Deliver to'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
              <Icon name="pin" size={15} color={c.ink} />
              <Text style={[type(16, 800), { color: c.ink, letterSpacing: -0.3 }]}>{location}</Text>
              <Icon name="chevDown" size={15} color={c.muted} />
            </View>
          </Press>

          <View style={{ marginTop: 24 }}>
            <Text style={[type(29, 900), { color: c.ink, letterSpacing: -1.2, lineHeight: 31 }]}>
              {greetWord()}{firstName ? ', ' : ''}<Text style={{ color: c.primary }}>{firstName}</Text>
            </Text>
            <Text style={[type(15.5, 500), { color: c.soft, marginTop: 7 }]}>What sounds good tonight?</Text>
          </View>

          <View style={{ marginTop: 14 }}><ModeToggle /></View>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2 }}>
          {CUISINES.map((x) => (
            <Press key={x} scale={0.94} onPress={() => router.push(`/explore?cat=${encodeURIComponent(x)}`)}>
              <View style={{ height: 36, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(13, 700), { color: c.soft }]}>{x}</Text>
              </View>
            </Press>
          ))}
        </ScrollView>

        <SectionHeader title="Today’s drop" />
        <HeroDrop id={dropId} />

        <SectionHeader title="Fresh near you" action="See all" onAction={() => router.push('/explore')} />
        <MealGrid meals={picks} />

        <SectionHeader title="New preppers near you" action="See all" onAction={() => router.push('/explore')} />
        <CookRail cooks={Object.keys(COOKS) as CookId[]} />

        {favMeals.length > 0 ? (
          <>
            <SectionHeader title="Your favorites" action="See all" onAction={() => router.push('/favorites')} />
            <MealGrid meals={favMeals} />
          </>
        ) : null}

        <View style={{ height: 8 }} />
      </ScrollView>
      <LocationPicker visible={locPicker} onClose={() => setLocPicker(false)} />
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

