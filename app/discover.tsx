import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { Icon, Press, Avatar } from '../src/ui';
import { money, COOKS } from '../src/data/data';
import { useKitchens, type KitchenCard } from '../src/data/hooks';
import { seedCookForKitchen } from '../src/data/supabaseRepository';
import { MealsBrowser } from '../src/components/MealsBrowser';
import { ModeTabs } from '../src/components/ModeTabs';
import { CardPaymentSheet } from '../src/components/CardPaymentSheet';
import { listMyRequests, acceptQuoteAndDeposit, SERVICE_LABELS, type RequestView } from '../src/lib/services';
import { useStore } from '../src/store/store';
import { FLAGS } from '../src/config/flags';

// Meal-plan browsing lives in the Experiences hub (→ /experiences?tab=plans), not here.
type Mode = 'meals' | 'preppers' | 'services';

export default function DiscoverTab() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode: modeParam } = useLocalSearchParams<{ mode?: string }>();
  const MODES: { key: Mode; label: string }[] = [
    { key: 'meals', label: 'Meals' },
    { key: 'preppers', label: 'Preppers' },
    ...(FLAGS.services ? [{ key: 'services' as Mode, label: 'Services' }] : []),
  ];
  const initial = (MODES.find((m) => m.key === modeParam)?.key ?? 'meals') as Mode;
  const [mode, setMode] = useState<Mode>(initial);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 10, paddingBottom: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Press scale={0.9} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} label="Back">
            <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg2 }}>
              <Icon name="chevLeft" size={20} color={c.ink} />
            </View>
          </Press>
          <Text style={[type(26, 900), { color: c.ink, letterSpacing: -0.9 }]}>Discover</Text>
        </View>
        <ModeTabs modes={MODES} value={mode} onChange={setMode} />
      </View>
      {mode === 'meals' ? <MealsBrowser /> : mode === 'services' ? <ServicesMode /> : <PreppersMode />}
    </View>
  );
}

const money0 = (cents: number) => money(cents / 100);

function ServicesMode() {
  const c = useC();
  const router = useRouter();
  const { toast, isPrepPlus } = useStore();
  const [requests, setRequests] = useState<RequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pay, setPay] = useState<{ clientSecret: string; label: string } | null>(null);
  const [busyQuote, setBusyQuote] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const feeBps = isPrepPlus ? 0 : 1500; // PrepPlus waives Preppa's service fee (display; server-enforced)

  // Audit High finding: this used to have no .catch, so a rejected listMyRequests() call
  // left `loading` stuck true forever with no error surfaced.
  const load = useCallback(() => {
    setLoading(true); setLoadError(null);
    listMyRequests()
      .then((r) => { setRequests(r); setLoading(false); })
      .catch((e: any) => { setLoadError(e?.message || 'Could not load your requests.'); setLoading(false); });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accept = async (quoteId: string, amountLabel: string) => {
    if (busyQuote) return;
    setBusyQuote(quoteId);
    try {
      const { clientSecret } = await acceptQuoteAndDeposit(quoteId);
      if (clientSecret) setPay({ clientSecret, label: amountLabel });
      else { toast('Booking confirmed', 'check', true); load(); }
    } catch (e: any) { toast(e?.message || 'Could not start your booking', 'info'); }
    finally { setBusyQuote(null); }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Press scale={0.985} onPress={() => router.push('/service-request')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.primaryD, borderRadius: radius.xl, padding: 16, ...shadow.brand }}>
          <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.2)', alignItems: 'center', justifyContent: 'center' }}><Icon name="chefhat" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={[type(16, 900), { color: '#fff' }]}>Book a prepper for your place</Text>
            <Text style={[type(12.5, 600), { color: 'rgba(255,255,255,.85)', marginTop: 2 }]}>Cook-at-home, catering, classes — get fixed quotes</Text>
          </View>
          <Icon name="chevRight" size={20} color="#fff" />
        </View>
      </Press>

      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 22, marginBottom: 10 }]}>Your requests</Text>
      {loading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : loadError ? (
        <View style={{ alignItems: 'center', paddingVertical: 30, paddingHorizontal: 24 }}>
          <Text style={[type(13.5, 600), { color: c.red, textAlign: 'center', marginBottom: 10 }]}>{loadError}</Text>
          <Press scale={0.96} onPress={load}><Text style={[type(13.5, 800), { color: c.primary }]}>Try again</Text></Press>
        </View>
      ) : requests.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 30, paddingHorizontal: 24 }}>
          <Text style={[type(13.5, 600), { color: c.soft, textAlign: 'center' }]}>No requests yet. Post one above to get quotes from local preppers.</Text>
        </View>
      ) : requests.map((r) => (
        <View key={r.id} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16, marginBottom: 12, ...shadow.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[type(15.5, 900), { color: c.ink }]}>{SERVICE_LABELS[r.category]}</Text>
            <View style={{ height: 22, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(10.5, 900), { color: c.soft, textTransform: 'uppercase', letterSpacing: 0.3 }]}>{r.status}</Text>
            </View>
          </View>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{r.eventDate}{r.guests ? ` · ${r.guests} guests` : ''}{r.budgetCents ? ` · budget ${money0(r.budgetCents)}` : ''}</Text>
          {r.quotes.length === 0 ? (
            <Text style={[type(12.5, 600), { color: c.muted, marginTop: 12 }]}>Waiting for quotes…</Text>
          ) : (
            <View style={{ marginTop: 12, gap: 8 }}>
              {r.quotes.filter((q) => q.status === 'pending' || q.status === 'accepted').map((q) => (
                <View key={q.id} style={{ borderWidth: 1, borderColor: c.border2, borderRadius: radius.md, padding: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[type(14, 800), { color: c.ink }]}>{q.kitchenName}</Text>
                    <Text style={[type(15, 900), { color: c.ink }]}>{money0(q.amountCents)}</Text>
                  </View>
                  {q.note ? <Text style={[type(12.5, 500), { color: c.soft, marginTop: 4, lineHeight: 17 }]}>{q.note}</Text> : null}
                  {q.status === 'accepted' ? (
                    <Text style={[type(12.5, 800), { color: c.green, marginTop: 8 }]}>Booked ✓</Text>
                  ) : (
                    <View style={{ marginTop: 10 }}>
                      <KDeposit label={busyQuote === q.id ? 'Starting…' : `Accept · deposit ${money0(q.depositCents + Math.round(q.amountCents * feeBps / 10000))}`}
                        onPress={() => accept(q.id, money0(q.depositCents + Math.round(q.amountCents * feeBps / 10000)))} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      <CardPaymentSheet visible={!!pay} clientSecret={pay?.clientSecret ?? null} amountLabel={pay?.label ?? ''} mode="pay"
        onPaid={() => { setPay(null); toast('Deposit paid — booking confirmed', 'check', true); load(); }} onClose={() => setPay(null)} />
    </ScrollView>
  );
}

function KDeposit({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.97} onPress={onPress}>
      <View style={{ height: 44, borderRadius: radius.md, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', ...shadow.brand }}>
        <Text style={[type(14, 800), { color: '#fff' }]}>{label}</Text>
      </View>
    </Press>
  );
}

function PreppersMode() {
  const c = useC();
  const router = useRouter();
  const { data: kitchens, loading, error } = useKitchens();
  if (loading) return <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>;
  // Audit High finding: this used to drop the `error` field entirely, so a failed fetch
  // rendered the same "no preppers" empty-state text as a genuine zero-results case.
  if (error) return (
    <View style={{ alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24 }}>
      <Text style={[type(13.5, 600), { color: c.red, textAlign: 'center', marginBottom: 10 }]}>Could not load preppers. Please try again.</Text>
    </View>
  );
  const list = kitchens ?? [];
  if (list.length === 0) return (
    <View style={{ alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24 }}>
      <Text style={[type(14, 600), { color: c.soft, textAlign: 'center' }]}>No preppers near you yet.</Text>
    </View>
  );
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      {list.map((k) => <PrepperRow key={k.id} k={k} onPress={() => router.push(`/store/${seedCookForKitchen(k.id) ?? k.id}`)} />)}
    </ScrollView>
  );
}

function PrepperRow({ k, onPress }: { k: KitchenCard; onPress: () => void }) {
  const c = useC();
  const seed = seedCookForKitchen(k.id);
  const cook = seed ? COOKS[seed] : null;
  const name = cook?.name ?? k.name;
  const cuisine = cook?.cuisine ?? k.cuisine;
  const distTxt = k.dist || cook?.dist || k.area;
  const rating = k.ratingCount > 0 ? k.ratingAvg.toFixed(1) : 'New';
  return (
    <Press scale={0.99} onPress={onPress} label={`${name} kitchen`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 14, ...shadow.card }}>
        {seed ? <Avatar cook={seed} size={52} rad={16} /> : (
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={[type(21, 900), { color: '#fff' }]}>{name.trim()[0]?.toUpperCase() ?? 'K'}</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text numberOfLines={1} style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{name}</Text>
            <Icon name="shield" size={14} color={c.green} />
          </View>
          <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{cuisine}{distTxt ? ` · ${distTxt}` : ''}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
            <Icon name="star" size={12} color={c.star} />
            <Text style={[type(12, 800), { color: c.ink2 }]}>{rating}</Text>
          </View>
        </View>
        <Icon name="chevRight" size={18} color={c.muted} />
      </View>
    </Press>
  );
}
