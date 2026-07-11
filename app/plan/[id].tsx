import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { marketPlanById, COOKS, PLAN_DAYS, money, type MarketPlan } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox, Btn } from '../../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block, SectionLabel } from '../../src/ui/layout';
import { CookRow, HeroTopBar, Burst } from '../../src/components/shared';
import { GoalBadge } from '../../src/components/cards';
import { NotFound } from '../../src/components/NotFound';
import { ImageViewer } from '../../src/components/ImageViewer';
import { CardPaymentSheet } from '../../src/components/CardPaymentSheet';
import { fetchPlan, createSubscription, type Plan } from '../../src/lib/subscriptions';
import { useSavedCards } from '../../src/lib/useSavedCards';
import { createSetupIntent } from '../../src/lib/payments';

const PLAN_WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const weekly = (cents: number) => money((cents + Math.round(cents * 0.1)) / 100);

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined); // undefined = still loading
  useEffect(() => {
    let alive = true;
    fetchPlan(id!).then((p) => { if (alive) setPlan(p); }).catch(() => { if (alive) setPlan(null); });
    return () => { alive = false; };
  }, [id]);

  // Seed (demo) plans use short string ids; render them synchronously while the real
  // lookup resolves so there's no flash. Real plans use uuids.
  const seed = marketPlanById(id!);
  if (plan) return <RealPlanDetail plan={plan} />;
  if (seed) return <SeedPlanDetail p={seed} />;
  if (plan === undefined) return <Screen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator /></View></Screen>;
  return <NotFound title="Meal plan" />;
}

/* ------------------------------------------------------------------ */
/* Real plan — actual weekly Stripe subscription                       */
/* ------------------------------------------------------------------ */
function RealPlanDetail({ plan }: { plan: Plan }) {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useStore();
  const { methods, refetch } = useSavedCards();
  const [day, setDay] = useState('Thu');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [addCard, setAddCard] = useState<string | null>(null); // SetupIntent clientSecret

  const totalMeals = plan.items.reduce((n, i) => n + i.qty, 0);

  const subscribe = async () => {
    if (busy) return;
    if (Platform.OS !== 'web') { toast('Subscribing is available on the web app for now.', 'info'); return; }
    setBusy(true);
    try {
      await createSubscription(plan.id, undefined, day);
      setDone(true);
    } catch (e: any) {
      if (e?.code === 'no_card') {
        // No saved card yet — open the card sheet, then retry after it's saved.
        try {
          const { clientSecret } = await createSetupIntent();
          setAddCard(clientSecret);
        } catch { toast('Add a card to subscribe.', 'info'); }
      } else {
        toast(e?.message || 'Could not start your plan. Please try again.', 'info');
      }
    } finally { setBusy(false); }
  };

  const onCardSaved = async () => {
    setAddCard(null);
    await refetch();
    setBusy(true);
    try { await createSubscription(plan.id, undefined, day); setDone(true); }
    catch (e: any) { toast(e?.message || 'Could not start your plan.', 'info'); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="You’re subscribed!"
          body={<>Your <Text style={type(15, 800)}>{plan.name}</Text> from <Text style={type(15, 800)}>{plan.kitchenName}</Text> is set. You’ll be billed {weekly(plan.priceCents)} weekly and can pause or cancel anytime.</>}
          actionLabel="View my plans"
          onAction={() => router.replace('/plans')}
        />
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <GradBox grad={['#A855F7', c.purple]} style={{ height: 200 }}>
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 34, left: 18, height: 24, borderRadius: radius.pill, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,.28)' }}>
            <Icon name="repeat" size={11} color="#fff" />
            <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 }]}>Weekly plan</Text>
          </View>
        </GradBox>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -26, padding: 18, paddingTop: 22 }}>
          {plan.goal ? <View style={{ flexDirection: 'row', marginBottom: 10 }}><GoalBadge goal={plan.goal as any} size="md" /></View> : null}
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, lineHeight: 27 }]}>{plan.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Icon name="repeat" size={15} color={c.primary} />
            <Text style={[type(13.5, 700), { color: c.ink }]}>{totalMeals} meal{totalMeals !== 1 ? 's' : ''} every week · {plan.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="chefhat" size={17} color={c.primary} /></View>
            <Text style={[type(14, 800), { color: c.ink }]}>{plan.kitchenName}</Text>
          </View>

          {plan.description ? (
            <>
              <SectionLabel>About this plan</SectionLabel>
              <Text style={[type(14.5, 500), { color: c.soft, lineHeight: 23 }]}>{plan.description}</Text>
            </>
          ) : null}

          <SectionLabel>In your weekly box</SectionLabel>
          {plan.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={14} color="#fff" />
              </View>
              <Text style={[type(14.5, 700), { color: c.ink, flex: 1 }]}>{it.name}{it.qty > 1 ? `  ×${it.qty}` : ''}</Text>
            </View>
          ))}

          <SectionLabel>Preferred {plan.fulfillment === 'pickup' ? 'pickup' : 'delivery'} day</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {PLAN_WEEK_DAYS.map((d) => <DayChip key={d} label={d} on={day === d} onPress={() => setDay(d)} />)}
          </View>
          <Text style={[type(12.5, 600), { color: c.muted, marginTop: 16, lineHeight: 19 }]}>Billed weekly. Pause, resume, or cancel anytime from Plans — no lock-in. Price includes the 10% service fee.</Text>
        </View>
      </ScrollView>

      <Dock>
        <DockTotal label="Billed weekly" value={`${weekly(plan.priceCents)}/wk`} />
        <Btn label={busy ? 'Starting…' : 'Subscribe'} icon="repeat" flex={1} loading={busy} onPress={subscribe} />
      </Dock>

      <CardPaymentSheet visible={!!addCard} clientSecret={addCard} amountLabel="" mode="save" onPaid={onCardSaved} onClose={() => setAddCard(null)} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Seed (demo) plan — reservation placeholder for the sample cooks     */
/* ------------------------------------------------------------------ */
function SeedPlanDetail({ p }: { p: MarketPlan }) {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { subscribe, isMine } = useStore();
  const [day, setDay] = useState('Thu');
  const [stage, setStage] = useState<'info' | 'pay' | 'done'>('info');
  const [viewer, setViewer] = useState(false);
  const cook = COOKS[p.cook];
  const mealsLbl = `${p.meals} meal${p.meals !== 1 ? 's' : ''}`;

  if (stage === 'done') {
    return (
      <Screen bg={c.surface}>
        <Burst title="You’re on the list!" body={<>You’ve reserved <Text style={type(15, 800)}>{p.name}</Text> with <Text style={type(15, 800)}>{cook.name}</Text>. This is a sample plan — subscribe to a live plan from Plans.</>} actionLabel="Browse plans" onAction={() => router.replace('/plans')} />
      </Screen>
    );
  }
  if (stage === 'pay') {
    return (
      <Screen>
        <TopBar title="Reserve your plan" onBack={() => setStage('info')} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          <Block title={`${p.name} · every ${day}`}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
              <Fact icon="chefhat" text={cook.name} />
              <Fact icon="repeat" text={`${mealsLbl}/week`} />
            </View>
          </Block>
          <View style={{ backgroundColor: c.surface, borderRadius: radius.card, margin: 16, padding: 16, borderWidth: 1, borderColor: c.border2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Icon name="shield" size={17} color={c.primary} />
              <Text style={[type(12.5, 600), { color: c.ink2, flex: 1, lineHeight: 18 }]}>This is a sample plan from a demo cook. Live plans are billed weekly and shown in Plans.</Text>
            </View>
          </View>
        </ScrollView>
        <Dock>
          <DockTotal label="Sample" value={`${money(p.price)}/wk`} />
          <Btn label="Reserve my spot" flex={1} onPress={() => { subscribe({ name: p.name, cook: p.cook, price: p.price, per: 'week', items: p.items, day, status: 'active', skipNext: false }); setStage('done'); }} />
        </Dock>
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <GradBox grad={p.grad} img={p.img} style={{ height: 280 }}>
          {p.img ? <Pressable onPress={() => setViewer(true)} accessibilityLabel={`View photo of ${p.name}`} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 38, left: 18, height: 24, borderRadius: radius.pill, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.purple }}>
            <Icon name="repeat" size={11} color="#fff" />
            <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 }]}>Sample plan</Text>
          </View>
        </GradBox>
        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -26, padding: 18, paddingTop: 22 }}>
          <View style={{ flexDirection: 'row', marginBottom: 10 }}><GoalBadge goal={p.goal} size="md" /></View>
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, lineHeight: 27 }]}>{p.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Icon name="repeat" size={15} color={c.primary} />
            <Text style={[type(13.5, 700), { color: c.ink }]}>{mealsLbl} every week</Text>
          </View>
          <CookRow cook={p.cook} />
          <SectionLabel>About this plan</SectionLabel>
          <Text style={[type(14.5, 500), { color: c.soft, lineHeight: 23 }]}>{p.desc}</Text>
          <SectionLabel>In a typical week</SectionLabel>
          {p.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color="#fff" /></View>
              <Text style={[type(14.5, 700), { color: c.ink, flex: 1 }]}>{it}</Text>
            </View>
          ))}
          <SectionLabel>Delivery day</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {PLAN_DAYS.map((d) => <DayChip key={d} label={d} on={day === d} onPress={() => setDay(d)} />)}
          </View>
        </View>
      </ScrollView>
      <Dock>
        {isMine(p.cook) ? (
          <Btn label="Manage in My Hub" icon="chefhat" variant="ghost" block onPress={() => router.push('/hub/plans')} />
        ) : (
          <>
            <DockTotal label="Sample" value={`${money(p.price)}/wk`} />
            <Btn label="Reserve this plan" iconRight="arrow" flex={1} onPress={() => setStage('pay')} />
          </>
        )}
      </Dock>
      <ImageViewer uri={p.img} caption={p.name} visible={viewer} onClose={() => setViewer(false)} />
    </Screen>
  );
}

function Fact({ icon, text }: { icon: string; text: string }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: c.bg2 }}>
      <Icon name={icon} size={14} color={c.muted} />
      <Text style={[type(12, 700), { color: c.ink2 }]}>{text}</Text>
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
