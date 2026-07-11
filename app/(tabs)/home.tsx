import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { COOKS, CookId, dailyDropId, money } from '../../src/data/data';
import { useMeals } from '../../src/data/hooks';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { HeroDrop, MealGrid, SectionHeader, CookRail } from '../../src/components/cards';
import { LocationPicker } from '../../src/components/LocationPicker';
import { captureCurrentLocation } from '../../src/lib/geo';
import { QuickCartSheet } from '../../src/components/QuickCartSheet';
import { FLAGS } from '../../src/config/flags';
import { fetchActivePlans, listMySubscriptions, type Plan, type MySubscription } from '../../src/lib/subscriptions';

const planWeekly = (cents: number) => money((cents + Math.round(cents * 0.1)) / 100);

const CUISINES = ['Comfort', 'Healthy', 'Halal', 'Mexican', 'Seafood', 'Soul food'];

function greetWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function HomeScreen() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { location, setLocation, setCoords, toast, cartCount, notifCount, fav, firstName, orders, reorder } = useStore();
  const { width } = useWindowDimensions();
  const wide = width >= 700; // logo + actions live in the SideRail on wide screens
  const [cartOpen, setCartOpen] = useState(false);
  const [locPicker, setLocPicker] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const dropId = dailyDropId();
  const { data: allMeals, loading: mealsLoading } = useMeals(); // real catalog from the DB
  const [plans, setPlans] = useState<Plan[]>([]);
  const [mySubs, setMySubs] = useState<MySubscription[]>([]);
  useEffect(() => {
    if (!FLAGS.plans) return;
    let alive = true;
    Promise.all([fetchActivePlans(), listMySubscriptions()]).then(([p, s]) => {
      if (alive) { setPlans(p); setMySubs(s); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const activeSub = mySubs.find((s) => s.status === 'active' || s.status === 'paused') ?? null;
  const meals = allMeals ?? [];
  const drop = meals.find((m) => m.id === dropId) ?? null;
  const picks = meals.filter((m) => m.id !== dropId).slice(0, 4);
  const favMeals = meals.filter((m) => fav.has(m.id));
  const lastOrder = orders[0] ?? null; // returning-buyer reorder shortcut

  const orderAgain = () => {
    if (!lastOrder) return;
    reorder(lastOrder.id);
    router.push('/cart');
  };

  // Tapping the location pill captures the user's real present location (GPS);
  // if it's denied or unavailable, fall back to the manual area picker.
  const useMyLocation = async () => {
    if (locBusy) return;
    setLocBusy(true);
    try {
      const loc = await captureCurrentLocation();
      setLocation(loc.label);
      setCoords({ lat: loc.lat, lng: loc.lng });
      toast(`Location set to ${loc.label}`, 'pin', true);
    } catch {
      setLocPicker(true);
    } finally {
      setLocBusy(false);
    }
  };

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
                <HdrIcon name="cart" dot={cartCount > 0} onPress={() => setCartOpen(true)} />
              </View>
            </View>
          ) : null}

          <Press scale={0.98} onPress={useMyLocation} label="Set your location" style={{ marginTop: wide ? 0 : 14, alignSelf: 'flex-start' }}>
            <Text style={[type(11, 700), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.6 }]}>Your area</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
              {locBusy ? <ActivityIndicator size="small" color={c.ink} /> : <Icon name="pin" size={15} color={c.ink} />}
              <Text style={[type(16, 800), { color: c.ink, letterSpacing: -0.3 }]}>{location}</Text>
              <Icon name="chevDown" size={13} color={c.muted} />
            </View>
          </Press>

          <View style={{ marginTop: 22 }}>
            <Text style={[type(29, 900), { color: c.ink, letterSpacing: -1.2, lineHeight: 31 }]}>
              {greetWord()}{firstName ? ', ' : ''}<Text style={{ color: c.primary }}>{firstName}</Text>
            </Text>
            <Text style={[type(15.5, 500), { color: c.soft, marginTop: 7 }]}>Plan your week, or grab something for tonight.</Text>
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 2 }}>
          {CUISINES.map((x) => (
            <Press key={x} scale={0.94} onPress={() => router.push(`/explore?cat=${encodeURIComponent(x)}`)}>
              <View style={{ height: 36, paddingHorizontal: 15, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(13, 700), { color: c.soft }]}>{x}</Text>
              </View>
            </Press>
          ))}
        </ScrollView>

        {/* Plan-first: your weekly box, or an invitation to start one. */}
        {FLAGS.plans && activeSub ? (
          <Press scale={0.99} onPress={() => router.push('/plans')} label="Your weekly plan" style={{ marginHorizontal: 16, marginTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 14, ...shadow.soft }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="repeat" size={21} color={c.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type(11, 800), { color: c.primary, textTransform: 'uppercase', letterSpacing: 0.5 }]}>{activeSub.status === 'paused' ? 'Your plan · paused' : 'Your plan this week'}</Text>
                <Text numberOfLines={1} style={[type(15, 900), { color: c.ink, letterSpacing: -0.3, marginTop: 2 }]}>{activeSub.planName}</Text>
                <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 1 }]}>{activeSub.kitchenName}{activeSub.preferredDay ? ` · ${activeSub.preferredDay}` : ''}</Text>
              </View>
              <Icon name="chevRight" size={18} color={c.muted} />
            </View>
          </Press>
        ) : FLAGS.plans ? (
          <Press scale={0.98} onPress={() => router.push('/plans')} label="Browse weekly meal plans" style={{ marginHorizontal: 16, marginTop: 16 }}>
            <GradBox grad={['#A855F7', c.purple]} style={{ borderRadius: radius.xl, padding: 18, overflow: 'hidden' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 50, height: 50, borderRadius: 15, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="repeat" size={24} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type(17, 900), { color: '#fff', letterSpacing: -0.4 }]}>Weekly meal plans</Text>
                  <Text style={[type(12.5, 600), { color: 'rgba(255,255,255,.82)', marginTop: 2, lineHeight: 17 }]}>Subscribe to a cook’s box — cooked fresh, delivered on repeat.{plans.length > 0 ? ` From ${planWeekly(Math.min(...plans.map((p) => p.priceCents)))}/wk.` : ''}</Text>
                </View>
                <Icon name="chevRight" size={20} color="#fff" />
              </View>
            </GradBox>
          </Press>
        ) : null}

        {FLAGS.plans && !activeSub && plans.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingTop: 12 }}>
            {plans.slice(0, 6).map((p) => (
              <Press key={p.id} scale={0.97} onPress={() => router.push(`/plan/${p.id}`)}>
                <View style={{ width: 220, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 14, ...shadow.card }}>
                  <Text numberOfLines={1} style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{p.name}</Text>
                  <Text numberOfLines={1} style={[type(12, 600), { color: c.soft, marginTop: 3 }]}>{p.kitchenName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
                    <Text style={[type(17, 900), { color: c.ink }]}>{planWeekly(p.priceCents)}</Text>
                    <Text style={[type(11, 700), { color: c.muted }]}>/wk · {p.items.reduce((n, i) => n + i.qty, 0)} meals</Text>
                  </View>
                </View>
              </Press>
            ))}
          </ScrollView>
        ) : null}

        {lastOrder ? (
          <Press scale={0.99} onPress={orderAgain} label={`Order again from ${COOKS[lastOrder.cook].name}`} style={{ marginHorizontal: 16, marginTop: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 14, ...shadow.soft }}>
              <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="repeat" size={21} color={c.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type(11, 800), { color: c.primary, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Order again</Text>
                <Text numberOfLines={1} style={[type(15, 900), { color: c.ink, letterSpacing: -0.3, marginTop: 2 }]}>{lastOrder.lines[0]?.name}{lastOrder.lines.length > 1 ? ` +${lastOrder.lines.length - 1} more` : ''}</Text>
                <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 1 }]}>From {COOKS[lastOrder.cook].name}</Text>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="plus" size={18} color="#fff" />
              </View>
            </View>
          </Press>
        ) : null}

        {mealsLoading ? (
          <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : (
          <>
            {drop ? (
              <>
                <SectionHeader title="Today’s drop" />
                <HeroDrop m={drop} />
              </>
            ) : null}

            <SectionHeader title="Fresh near you" action="See all" onAction={() => router.push('/explore')} />
            <MealGrid meals={picks} />
          </>
        )}

        <SectionHeader title="New preppers near you" action="See all" onAction={() => router.push('/explore')} />
        <CookRail cooks={Object.keys(COOKS) as CookId[]} />

        {!mealsLoading && favMeals.length > 0 ? (
          <>
            <SectionHeader title="Your favorites" action="See all" onAction={() => router.push('/favorites')} />
            <MealGrid meals={favMeals} />
          </>
        ) : null}

        <View style={{ height: 8 }} />
      </ScrollView>
      <LocationPicker visible={locPicker} onClose={() => setLocPicker(false)} />
      <QuickCartSheet visible={cartOpen} onClose={() => setCartOpen(false)} />
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

