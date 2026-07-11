import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { dailyDropId } from '../../src/data/data';
import { useMeals, useKitchens } from '../../src/data/hooks';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';
import { HeroDrop, MealGrid, SectionHeader, PrepperRail } from '../../src/components/cards';
import { LocationPicker } from '../../src/components/LocationPicker';
import { captureCurrentLocation } from '../../src/lib/geo';
import { QuickCartSheet } from '../../src/components/QuickCartSheet';
import { FLAGS } from '../../src/config/flags';

function greetWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

const MODES: { id: 'delivery' | 'pickup' | 'chef'; t: string; ico: string }[] = [
  { id: 'delivery', t: 'Delivery', ico: 'truck' },
  { id: 'pickup', t: 'Pickup', ico: 'bag' },
  { id: 'chef', t: 'Private Chef', ico: 'chefhat' },
];

export default function HomeScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { location, setLocation, setCoords, toast, cartCount, notifCount, firstName, mode, setMode } = useStore();
  const { width } = useWindowDimensions();
  const wide = width >= 700; // logo + actions live in the SideRail on wide screens
  const [cartOpen, setCartOpen] = React.useState(false);
  const [locPicker, setLocPicker] = React.useState(false);
  const [locBusy, setLocBusy] = React.useState(false);
  const dropId = dailyDropId();
  const { data: allMeals, loading: mealsLoading } = useMeals();
  const meals = allMeals ?? [];
  const drop = meals.find((m) => m.id === dropId) ?? null;
  const picks = meals.filter((m) => m.id !== dropId).slice(0, 4);
  const { data: kitchens } = useKitchens();

  const useMyLocation = async () => {
    if (locBusy) return;
    setLocBusy(true);
    try {
      const loc = await captureCurrentLocation();
      setLocation(loc.label);
      setCoords({ lat: loc.lat, lng: loc.lng });
      toast(`Location set to ${loc.label}`, 'pin', true);
    } catch { setLocPicker(true); } finally { setLocBusy(false); }
  };

  const pickMode = (id: 'delivery' | 'pickup' | 'chef') => {
    if (id === 'chef') { FLAGS.services ? router.push('/service-request?category=cook_at_home') : toast('Private-chef bookings are coming soon', 'chefhat'); return; }
    setMode(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.primaryL, paddingTop: insets.top }}>
      <ScrollView stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }} style={{ backgroundColor: c.bg }}>
        {/* [0] header wash */}
        <LinearGradient colors={[c.primaryL, c.surface]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
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
                <HdrIcon name="cart" dot={cartCount > 0} onPress={() => setCartOpen(true)} />
              </View>
            </View>
          ) : null}

          {/* location pill */}
          <Press scale={0.98} onPress={useMyLocation} label="Set your location" style={{ marginTop: wide ? 0 : 14, alignSelf: 'flex-start' }}>
            <Text style={[type(11, 700), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6 }]}>{mode === 'pickup' ? 'Pick up in' : 'Deliver to'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
              {locBusy ? <ActivityIndicator size="small" color={c.ink} /> : <Icon name="pin" size={15} color={c.ink} />}
              <Text style={[type(16, 800), { color: c.ink, letterSpacing: -0.3 }]}>{location}</Text>
              <Icon name="chevDown" size={13} color={c.muted} />
            </View>
          </Press>

          {/* greeting */}
          <View style={{ marginTop: 24 }}>
            <Text style={[type(29, 900), { color: c.ink, letterSpacing: -1.2, lineHeight: 31 }]}>{greetWord()}{firstName ? ', ' : ''}<Text style={{ color: c.primary }}>{firstName}</Text></Text>
            <Text style={[type(15.5, 500), { color: c.soft, marginTop: 7 }]}>What sounds good tonight?</Text>
          </View>

          {/* mode toggle — Delivery · Pickup · Private Chef */}
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 4, marginTop: 14, backgroundColor: c.bg2, padding: 4, borderRadius: 13 }}>
            {MODES.map((m) => {
              const on = m.id === mode; // 'chef' is never the active fulfillment mode — it navigates
              return (
                <Press key={m.id} scale={0.96} onPress={() => pickMode(m.id)}>
                  <View style={{ height: 36, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? c.surface : 'transparent', ...(on ? { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : {}) }}>
                    <Icon name={m.ico} size={15} color={on ? c.ink : c.soft} />
                    <Text style={[type(13.5, 700), { color: on ? c.ink : c.soft }]}>{m.t}</Text>
                  </View>
                </Press>
              );
            })}
          </View>
        </LinearGradient>

        {/* [1] sticky search */}
        <View style={{ backgroundColor: c.bg, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 }}>
          <Press scale={0.99} onPress={() => router.push('/discover')}>
            <View style={{ height: 54, borderRadius: 16, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 17, ...shadow.soft }}>
              <Icon name="search" size={18} color={c.muted} />
              <Text style={[type(15, 600), { color: c.muted }]}>Search meals, cooks, cuisines…</Text>
            </View>
          </Press>
        </View>

        {mealsLoading ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : (
          <>
            {drop ? (<><SectionHeader title="Today’s drop" /><HeroDrop m={drop} /></>) : null}
            <SectionHeader title="Fresh near you" action="See all" onAction={() => router.push('/discover?mode=meals')} />
            <MealGrid meals={picks} />
          </>
        )}

        {kitchens && kitchens.length > 0 ? (
          <>
            <SectionHeader title="Preppers near you" action="See all" onAction={() => router.push('/discover?mode=preppers')} />
            <PrepperRail kitchens={kitchens.slice(0, 10)} />
          </>
        ) : null}

        {/* High-end big cards — the app's four layers, since they're not in the mobile nav. */}
        <SectionHeader title="Explore Preppa" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 }}>
          <BigCard c={c} wide={wide} grad={['#A855F7', '#7C3AED']} icon="repeat" title="Meal plans" body="Weekly boxes from a cook you love" onPress={() => router.push('/discover?mode=plans')} />
          <BigCard c={c} wide={wide} grad={['#38BDF8', '#2563EB']} icon="bank" title="Subscriptions" body="Manage your recurring boxes" onPress={() => router.push('/plans')} />
          <BigCard c={c} wide={wide} grad={['#FB7185', '#E11D48']} icon="gift" title="Experiences" body="Classes, supper clubs & events" soon onPress={() => toast('Food experiences are coming soon', 'gift')} />
          <BigCard c={c} wide={wide} grad={['#334155', '#0F172A']} icon="video" title="Feed" body="Watch cooks & meal drops" soon onPress={() => toast('The creator feed is coming soon', 'video')} />
        </View>

        {/* Cook-at-My-Place (services) banner */}
        <ChefBanner c={c} grad={['#FF8A4C', c.primary]} icon="chefhat" title="Cook at My Place" body="A private chef in your kitchen — compare fixed quotes" onPress={() => FLAGS.services ? router.push('/service-request?category=cook_at_home') : toast('Private-chef bookings are coming soon', 'chefhat')} style={{ marginTop: 16 }} />

        <View style={{ height: 14 }} />
      </ScrollView>
      <LocationPicker visible={locPicker} onClose={() => setLocPicker(false)} />
      <QuickCartSheet visible={cartOpen} onClose={() => setCartOpen(false)} />
    </View>
  );
}

/** High-end gradient "layer" card for the homepage (meal plans / subscriptions / experiences / feed). */
function BigCard({ c, wide, grad, icon, title, body, soon, onPress }: { c: any; wide: boolean; grad: [string, string]; icon: string; title: string; body: string; soon?: boolean; onPress: () => void }) {
  return (
    <Press scale={0.97} onPress={onPress} style={{ flexBasis: wide ? '23%' : '47%', flexGrow: 1, minWidth: wide ? 190 : 150 }} label={title}>
      <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 22, padding: 16, minHeight: 150, overflow: 'hidden', justifyContent: 'space-between', ...shadow.card }}>
        <View pointerEvents="none" style={{ position: 'absolute', right: -30, top: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,.12)' }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={22} color="#fff" />
          </View>
          {soon ? <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 99, backgroundColor: 'rgba(255,255,255,.22)', alignItems: 'center', justifyContent: 'center' }}><Text style={[type(9.5, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 }]}>Soon</Text></View> : null}
        </View>
        <View style={{ marginTop: 16 }}>
          <Text style={[type(17, 900), { color: '#fff', letterSpacing: -0.4 }]}>{title}</Text>
          <Text style={[type(12.5, 600), { color: 'rgba(255,255,255,.85)', marginTop: 3, lineHeight: 16 }]}>{body}</Text>
        </View>
      </LinearGradient>
    </Press>
  );
}

function ChefBanner({ c, grad, icon, title, body, onPress, style }: { c: any; grad: [string, string]; icon: string; title: string; body: string; onPress: () => void; style?: any }) {
  return (
    <Press scale={0.985} onPress={onPress} style={[{ marginHorizontal: 20, marginTop: 8 }, style]} label={title}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 18, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2 }}>
        <LinearGradient colors={grad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
          <Icon name={icon} size={22} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type(15.5, 800), { color: c.ink, letterSpacing: -0.2 }]}>{title}</Text>
          <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2, lineHeight: 17 }]}>{body}</Text>
        </View>
        <Icon name="chevRight" size={18} color={c.muted} />
      </View>
    </Press>
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
