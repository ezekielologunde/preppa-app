import React from 'react';
import { View, Text, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { dailyDropId } from '../../src/data/data';
import { useMeals, useKitchens } from '../../src/data/hooks';
import { useC } from '../../src/theme/ThemeContext';
import { type, serif, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Skeleton } from '../../src/ui';
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
  const { location, coords, setLocation, setCoords, toast, cartCount, notifCount, firstName, mode, setMode } = useStore();
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

  // Auto-capture on first load so "Preppers near you" / the meal catalog actually sort by
  // real distance without requiring the user to discover and tap the location pill — this
  // was previously entirely manual, so most sessions never set coords at all. Fires once
  // per device (persisted in `coords`, see store.tsx), silently: no toast, and a denial/
  // failure does NOT pop the manual location picker — that's reserved for the explicit tap,
  // where the user is already expecting a location prompt/fallback.
  React.useEffect(() => {
    if (coords) return;
    captureCurrentLocation()
      .then((loc) => { setLocation(loc.label); setCoords({ lat: loc.lat, lng: loc.lng }); })
      .catch(() => { /* permission denied or unavailable — keep the default, no nag */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickMode = (id: 'delivery' | 'pickup' | 'chef') => {
    if (id === 'chef') { FLAGS.services ? router.push('/service-request?category=cook_at_home') : toast('Private-chef bookings are coming soon', 'chefhat'); return; }
    setMode(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <ScrollView stickyHeaderIndices={[1]} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }} style={{ backgroundColor: c.bg }}>
        {/* [0] header — calm warm canvas, no orange wash */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 18, backgroundColor: c.bg }}>
          {!wide ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                  <Icon name="flame" size={16} color="#fff" />
                </View>
                <Text style={[type(19, 700), { color: c.ink, letterSpacing: -0.5 }]}>preppa</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 9 }}>
                {FLAGS.notifications ? <HdrIcon name="bell" dot={notifCount > 0} count={notifCount} label="Notifications" onPress={() => router.push('/notifications')} /> : null}
                <HdrIcon name="cart" dot={cartCount > 0} count={cartCount} label="Cart" onPress={() => setCartOpen(true)} />
              </View>
            </View>
          ) : null}

          {/* location pill */}
          <Press scale={0.98} onPress={useMyLocation} label="Set your location" style={{ marginTop: wide ? 0 : 16, alignSelf: 'flex-start' }}>
            <Text style={[type(11, 600), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6 }]}>{mode === 'pickup' ? 'Pick up in' : 'Deliver to'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
              {locBusy ? <ActivityIndicator size="small" color={c.ink} /> : <Icon name="pin" size={15} color={c.primary} />}
              <Text style={[type(16, 700), { color: c.ink, letterSpacing: -0.3 }]}>{location}</Text>
              <Icon name="chevDown" size={13} color={c.muted} />
            </View>
          </Press>

          {/* greeting — the one editorial serif moment */}
          <View style={{ marginTop: 22 }}>
            <Text style={[serif(30, 600), { color: c.ink, letterSpacing: -0.6, lineHeight: 34 }]}>{greetWord()}{firstName ? ', ' : ''}{firstName ? <Text style={[serif(30, 600), { color: c.primaryD }]}>{firstName}</Text> : null}</Text>
            <Text style={[type(15.5, 400), { color: c.soft, marginTop: 8 }]}>What sounds good tonight?</Text>
          </View>

          {/* mode toggle — Delivery · Pickup · Private Chef */}
          <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 4, marginTop: 18, backgroundColor: c.bg2, padding: 4, borderRadius: 13 }}>
            {MODES.map((m) => {
              const on = m.id === mode; // 'chef' is never the active fulfillment mode — it navigates
              return (
                <Press key={m.id} scale={0.96} onPress={() => pickMode(m.id)} label={m.t} selected={on}>
                  <View style={{ height: 40, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: on ? c.surface : 'transparent', borderWidth: 1, borderColor: on ? c.border : 'transparent', ...(on ? shadow.soft : {}) }}>
                    <Icon name={m.ico} size={15} color={on ? c.primary : c.soft} />
                    <Text style={[type(13.5, on ? 600 : 500), { color: on ? c.ink : c.soft }]}>{m.t}</Text>
                  </View>
                </Press>
              );
            })}
          </View>
        </View>

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
          <View style={{ paddingTop: 30 }}>
            <View style={{ paddingHorizontal: 20 }}><Skeleton w={'42%'} h={20} r={7} /></View>
            <View style={{ marginHorizontal: 20, marginTop: 14 }}><Skeleton w={'100%'} h={300} r={radius.hero} /></View>
            <View style={{ paddingHorizontal: 20, marginTop: 34, flexDirection: 'row', gap: 14 }}>
              <Skeleton w={'47%'} h={230} r={radius.card} />
              <Skeleton w={'47%'} h={230} r={radius.card} />
            </View>
          </View>
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

        {/* Explore — the app's four layers as calm, flat, wayfinding-labelled cards (not rainbow tiles). */}
        <SectionHeader title="Explore Preppa" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20 }}>
          <BigCard c={c} wide={wide} kind="Weekly" icon="repeat" title="Meal plans" body="Recurring boxes from a cook you love" onPress={() => router.push('/experiences?tab=plans')} />
          <BigCard c={c} wide={wide} kind="Yours" icon="bank" title="Subscriptions" body="Manage your recurring boxes" onPress={() => router.push('/experiences?tab=mine')} />
          <BigCard c={c} wide={wide} kind="Events" icon="gift" title="Experiences" body="Classes, supper clubs & events" onPress={() => router.push('/experiences?tab=experiences')} />
          <BigCard c={c} wide={wide} kind="Live" icon="video" title="Feed" body="See what cooks are making" onPress={() => router.push('/(tabs)/feeds')} />
        </View>

        {/* Cook-at-My-Place (services) banner */}
        <ChefBanner c={c} icon="chefhat" title="Cook at My Place" body="A private chef in your kitchen — compare fixed quotes" onPress={() => FLAGS.services ? router.push('/service-request?category=cook_at_home') : toast('Private-chef bookings are coming soon', 'chefhat')} style={{ marginTop: 16 }} />

        <View style={{ height: 14 }} />
      </ScrollView>
      <LocationPicker visible={locPicker} onClose={() => setLocPicker(false)} />
      <QuickCartSheet visible={cartOpen} onClose={() => setCartOpen(false)} />
    </View>
  );
}

/** Calm "layer" card for the homepage (meal plans / subscriptions / experiences / feed).
 *  Flat surface + hairline border; the accent appears once (the tinted icon); a small
 *  monochrome kind-chip does the object-type wayfinding the old gradient colour used to. */
function BigCard({ c, wide, kind, icon, title, body, onPress }: { c: any; wide: boolean; kind: string; icon: string; title: string; body: string; onPress: () => void }) {
  return (
    <Press scale={0.98} onPress={onPress} style={{ flexBasis: wide ? '23%' : '47%', flexGrow: 1, minWidth: wide ? 190 : 150 }} label={`${title} — ${body}`}>
      <View style={{ borderRadius: radius.card, padding: 16, minHeight: 148, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, justifyContent: 'space-between', ...shadow.card }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={icon} size={20} color={c.primaryD} />
          </View>
          <Text style={[type(10.5, 600), { color: c.muted, backgroundColor: c.bg2, textTransform: 'uppercase', letterSpacing: 0.4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' }]}>{kind}</Text>
        </View>
        <View style={{ marginTop: 18 }}>
          <Text style={[type(16.5, 600), { color: c.ink, letterSpacing: -0.3 }]}>{title}</Text>
          <Text style={[type(12.5, 400), { color: c.soft, marginTop: 3, lineHeight: 17 }]}>{body}</Text>
        </View>
      </View>
    </Press>
  );
}

function ChefBanner({ c, icon, title, body, onPress, style }: { c: any; icon: string; title: string; body: string; onPress: () => void; style?: any }) {
  return (
    <Press scale={0.99} onPress={onPress} style={[{ marginHorizontal: 20, marginTop: 8 }, style]} label={`${title} — ${body}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
        <View style={{ width: 46, height: 46, borderRadius: 13, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={22} color={c.primaryD} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type(15.5, 600), { color: c.ink, letterSpacing: -0.2 }]}>{title}</Text>
          <Text style={[type(12.5, 400), { color: c.soft, marginTop: 2, lineHeight: 17 }]}>{body}</Text>
        </View>
        <Icon name="chevRight" size={18} color={c.muted} />
      </View>
    </Press>
  );
}

function HdrIcon({ name, dot, count, label, onPress }: { name: string; dot?: boolean; count?: number; label: string; onPress: () => void }) {
  const c = useC();
  const a11y = count && count > 0 ? `${label}, ${count}` : label;
  return (
    <Press scale={0.9} onPress={onPress} label={a11y}>
      <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={name} size={19} color={c.ink2} />
        {dot ? <View style={{ position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, borderWidth: 2, borderColor: c.bg2 }} /> : null}
      </View>
    </Press>
  );
}
