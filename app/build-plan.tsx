import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { COOKS, money } from '../src/data/data';
import { useMeals } from '../src/data/hooks';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, GradBox, Btn } from '../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block } from '../src/ui/layout';
import { Burst } from '../src/components/shared';
import { CardPaymentSheet } from '../src/components/CardPaymentSheet';
import { buildBox, estimateBox } from '../src/lib/subscriptions';
import { useSavedCards } from '../src/lib/useSavedCards';
import { createSetupIntent } from '../src/lib/payments';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money2 = (cents: number) => money(cents / 100);
function isoDate(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function chipLabel(d: Date): string { return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`; }
function nextDates(count = 8): Date[] {
  const out: Date[] = []; const s = new Date(); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() + 2);
  for (let i = 0; i < count; i++) { const d = new Date(s); d.setDate(s.getDate() + i); out.push(d); }
  return out;
}

type Stage = 'pick' | 'schedule' | 'done';

export default function BuildPlanFlow() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const { data: meals, loading } = useMeals();
  const { refetch } = useSavedCards();
  const dates = useMemo(() => nextDates(8), []);

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [startIso, setStartIso] = useState<string>(isoDate(dates[0]));
  const [stage, setStage] = useState<Stage>('pick');
  const [busy, setBusy] = useState(false);
  const [addCard, setAddCard] = useState<string | null>(null);
  const [result, setResult] = useState<{ firstDeliveryDate: string | null; count: number } | null>(null);

  const pool = (meals ?? []).filter((m) => !!m.mealUuid);
  const selected = pool.filter((m) => picked[m.mealUuid!]);
  const est = estimateBox(selected.map((m) => ({ qty: 1, priceCents: Math.round(m.price * 100) })));
  const count = selected.length;
  const valid = count >= 2;
  const startDay = WD[new Date(startIso + 'T00:00:00').getDay()];

  const doBuild = async (pmId?: string) => {
    setBusy(true);
    try {
      const res = await buildBox({
        items: selected.map((m) => ({ mealId: m.mealUuid!, qty: 1 })),
        paymentMethodId: pmId, fulfillment: 'delivery', startDate: startIso, preferredDay: startDay,
      });
      setResult({ firstDeliveryDate: res.firstDeliveryDate, count });
      setStage('done');
    } catch (e: any) {
      if (e?.code === 'no_card') {
        try { const { clientSecret } = await createSetupIntent(); setAddCard(clientSecret); }
        catch { toast('Add a card to subscribe.', 'info'); }
      } else { toast(e?.message || 'Could not create your box.', 'info'); }
    } finally { setBusy(false); }
  };
  const subscribe = async () => {
    if (busy) return;
    if (Platform.OS !== 'web') { toast('Building a box is available on the web app for now.', 'info'); return; }
    await doBuild();
  };
  const onCardSaved = async () => { setAddCard(null); await refetch(); await doBuild(); };

  if (stage === 'done') {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Your box is set!"
          body={<>Your custom box of <Text style={type(15, 800)}>{result?.count} meals</Text> starts {result?.firstDeliveryDate ? chipLabel(new Date(result.firstDeliveryDate + 'T00:00:00')) : 'soon'} at <Text style={type(15, 800)}>{money2(est.totalCents)}/week</Text> (10% bundle discount applied). Skip, pause, or cancel anytime.</>}
          actionLabel="View my plans"
          onAction={() => router.replace('/experiences?tab=mine')}
        />
      </Screen>
    );
  }

  if (stage === 'schedule') {
    return (
      <Screen>
        <TopBar title="Schedule your box" sub={`${count} meals`} onBack={() => setStage('pick')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
          <Block title="First delivery">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              {dates.map((d) => { const iso = isoDate(d); return <DayChip key={iso} label={chipLabel(d)} on={startIso === iso} onPress={() => setStartIso(iso)} />; })}
            </View>
          </Block>
          <Block title="Weekly pricing">
            <Row c={c} k="Meals subtotal" v={money2(est.subtotalCents)} />
            <Row c={c} k="Bundle discount (10%)" v={`−${money2(est.discountCents)}`} accent={c.green} />
            <Row c={c} k="Service fee" v={money2(est.feeCents)} />
            <View style={{ height: 1, backgroundColor: c.border2, marginVertical: 8 }} />
            <Row c={c} k="Per week" v={money2(est.totalCents)} bold />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <Icon name="shield" size={15} color={c.green} />
              <Text style={[type(12.5, 600), { color: c.soft, flex: 1, lineHeight: 18 }]}>One weekly charge, split fairly to each cook. Delivery free for subscribers. Skip, pause, or cancel anytime.</Text>
            </View>
          </Block>
        </ScrollView>
        <Dock>
          <DockTotal label="Per week" value={`${money2(est.totalCents)}/wk`} />
          <Btn label={busy ? 'Starting…' : 'Start my box'} icon="repeat" flex={1} loading={busy} onPress={subscribe} />
        </Dock>
        <CardPaymentSheet visible={!!addCard} clientSecret={addCard} amountLabel="" mode="save" onPaid={onCardSaved} onClose={() => setAddCard(null)} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Build your box" sub="pick 2+ meals across cooks" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <Text style={[type(13.5, 600), { color: c.soft, marginHorizontal: 16, marginTop: 14, marginBottom: 6, lineHeight: 20 }]}>Mix meals from any cooks into one weekly box — we bundle the deliveries and take 10% off. Each cook is paid for their own dishes.</Text>
        {loading && pool.length === 0 ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : pool.map((m) => {
          const on = !!picked[m.mealUuid!];
          const cook = m.kitchenName ?? COOKS[m.cook]?.name ?? 'A cook';
          return (
            <Press key={m.mealUuid} scale={0.99} onPress={() => setPicked((p) => ({ ...p, [m.mealUuid!]: !p[m.mealUuid!] }))}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                <GradBox grad={(m.grad as any)} img={m.img} style={{ width: 48, height: 48, borderRadius: 13 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[type(14, 800), { color: c.ink, letterSpacing: -0.1 }]}>{m.name}</Text>
                  <Text style={[type(12, 600), { color: c.soft, marginTop: 1 }]}>{cook} · {money(m.price)}</Text>
                </View>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Icon name="check" size={14} color="#fff" /> : null}
                </View>
              </View>
            </Press>
          );
        })}
      </ScrollView>
      <Dock>
        <DockTotal label={`${count} meal${count !== 1 ? 's' : ''}${count >= 2 ? ' · 10% off' : ''}`} value={`${money2(est.totalCents)}/wk`} />
        <Btn label="Next" iconRight="arrow" flex={1} disabled={!valid} onPress={() => setStage('schedule')} />
      </Dock>
    </Screen>
  );
}

function Row({ c, k, v, bold, accent }: { c: any; k: string; v: string; bold?: boolean; accent?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }}>
      <Text style={[type(13.5, bold ? 800 : 600), { color: bold ? c.ink : c.soft }]}>{k}</Text>
      <Text style={[type(bold ? 15 : 13.5, bold ? 900 : 700), { color: accent ?? c.ink }]}>{v}</Text>
    </View>
  );
}
function DayChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useC();
  return (
    <Press scale={0.95} onPress={onPress}>
      <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={[type(13, 800), { color: on ? '#fff' : c.soft }]}>{label}</Text>
      </View>
    </Press>
  );
}
