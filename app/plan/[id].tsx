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
import { Stepper } from '../../src/ui/primitives';
import { fetchPlan, subscribeToPlan, estimateCycle, customerWeeklyCents, type Plan } from '../../src/lib/subscriptions';
import { useSavedCards } from '../../src/lib/useSavedCards';
import { createSetupIntent } from '../../src/lib/payments';

const WEEKDAY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money2 = (cents: number) => money(cents / 100);
function isoDate(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function chipLabel(d: Date): string { return `${WEEKDAY_SHORT[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`; }
/** Next N valid start dates from today+lead, filtered to the plan's delivery days if any. */
function candidateStartDates(leadHours: number, deliveryDays: string[] | undefined, count = 8): Date[] {
  const out: Date[] = [];
  const min = new Date(); min.setHours(0, 0, 0, 0);
  min.setDate(min.getDate() + Math.max(1, Math.ceil(leadHours / 24)));
  const allow = (deliveryDays ?? []).map((d) => d.toLowerCase());
  for (let i = 0; i < 60 && out.length < count; i++) {
    const d = new Date(min); d.setDate(min.getDate() + i);
    if (allow.length === 0 || allow.includes(WEEKDAY[d.getDay()])) out.push(d);
  }
  return out;
}

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
  const { refetch } = useSavedCards();

  const selModel = plan.selectionModel ?? 'fixed';
  const target = plan.mealsPerDelivery ?? plan.items.reduce((n, i) => n + i.qty, 0);
  const dates = React.useMemo(() => candidateStartDates(plan.leadTimeHours ?? 48, plan.deliveryDays, 8), [plan.id]);

  const [stage, setStage] = useState<'info' | 'customize' | 'schedule' | 'review' | 'done'>('info');
  const [sel, setSel] = useState<Record<string, number>>({}); // mealId -> qty (customer_choice)
  const [startIso, setStartIso] = useState<string>(dates[0] ? isoDate(dates[0]) : '');
  const [busy, setBusy] = useState(false);
  const [addCard, setAddCard] = useState<string | null>(null);
  const [result, setResult] = useState<{ firstDeliveryDate: string | null } | null>(null);

  const selectedItems = selModel === 'customer_choice'
    ? plan.items.filter((i) => (sel[i.mealId ?? ''] ?? 0) > 0).map((i) => ({ ...i, qty: sel[i.mealId!]! }))
    : plan.items;
  const selCount = selModel === 'customer_choice' ? Object.values(sel).reduce((n, q) => n + q, 0) : target;
  const est = estimateCycle(plan, selModel === 'customer_choice' ? selectedItems : undefined);
  const weeklyLabel = `${money2(est.totalCents)}/wk`;
  const startDay = startIso ? WEEKDAY_SHORT[new Date(startIso + 'T00:00:00').getDay()] : undefined;

  const bump = (mealId: string, d: number) => setSel((s) => {
    const q = Math.max(0, (s[mealId] ?? 0) + d);
    const next = { ...s, [mealId]: q };
    if (q === 0) delete next[mealId];
    return next;
  });

  const doSubscribe = async (pmId?: string) => {
    setBusy(true);
    try {
      const res = await subscribeToPlan({
        planId: plan.id,
        paymentMethodId: pmId,
        fulfillment: plan.fulfillment,
        startDate: startIso || undefined,
        preferredDay: startDay,
        selection: selModel === 'customer_choice' ? selectedItems.map((i) => ({ mealId: i.mealId!, qty: i.qty })) : undefined,
      });
      setResult({ firstDeliveryDate: res.firstDeliveryDate });
      setStage('done');
    } catch (e: any) {
      if (e?.code === 'no_card') {
        try { const { clientSecret } = await createSetupIntent(); setAddCard(clientSecret); }
        catch { toast('Add a card to subscribe.', 'info'); }
      } else if (e?.code === 'already_subscribed') {
        toast("You're already subscribed to this plan.", 'info'); router.replace('/experiences?tab=mine');
      } else {
        toast(e?.message || 'Could not start your plan. Please try again.', 'info');
      }
    } finally { setBusy(false); }
  };

  const subscribe = async () => {
    if (busy) return;
    if (Platform.OS !== 'web') { toast('Subscribing is available on the web app for now.', 'info'); return; }
    await doSubscribe();
  };
  const onCardSaved = async () => { setAddCard(null); await refetch(); await doSubscribe(); };

  if (stage === 'done') {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="You’re subscribed!"
          body={<>Your <Text style={type(15, 800)}>{plan.name}</Text> from <Text style={type(15, 800)}>{plan.kitchenName}</Text> starts {result?.firstDeliveryDate ? fmtDate(result.firstDeliveryDate) : 'soon'}. You’re charged {weeklyLabel} per delivery after you confirm that week’s meals — skip, pause, or cancel anytime.</>}
          actionLabel="View my plans"
          onAction={() => router.replace('/experiences?tab=mine')}
        />
      </Screen>
    );
  }

  if (stage !== 'info') {
    const back = stage === 'customize' ? () => setStage('info')
      : stage === 'schedule' ? () => setStage(selModel === 'customer_choice' ? 'customize' : 'info')
        : () => setStage('schedule');
    const titleByStage = { customize: 'Choose your meals', schedule: 'Schedule', review: 'Review & confirm' } as const;
    return (
      <Screen>
        <TopBar title={titleByStage[stage as 'customize' | 'schedule' | 'review']} sub={plan.name} onBack={back} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
          {stage === 'customize' ? (
            <Block title={`Pick your meals${target ? ` · ${selCount}/${target}` : ''}`}>
              {plan.items.map((it) => (
                <View key={it.mealId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[type(14.5, 700), { color: c.ink }]}>{it.name}</Text>
                    {it.priceCents ? <Text style={[type(12, 600), { color: c.muted, marginTop: 2 }]}>{money2(it.priceCents)}</Text> : null}
                  </View>
                  <Stepper value={sel[it.mealId ?? ''] ?? 0} onDec={() => bump(it.mealId!, -1)} onInc={() => bump(it.mealId!, 1)} sm />
                </View>
              ))}
            </Block>
          ) : null}

          {stage === 'schedule' ? (
            <Block title={`First ${plan.fulfillment === 'pickup' ? 'pickup' : 'delivery'}`}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {dates.map((d) => { const iso = isoDate(d); return <DayChip key={iso} label={chipLabel(d)} on={startIso === iso} onPress={() => setStartIso(iso)} />; })}
              </View>
              <Text style={[type(12.5, 600), { color: c.muted, marginTop: 12, lineHeight: 19 }]}>You’ll confirm each week’s meals before the cutoff, then your card is charged for that {plan.fulfillment === 'pickup' ? 'pickup' : 'delivery'}.</Text>
            </Block>
          ) : null}

          {stage === 'review' ? (
            <>
              <Block title="Your plan">
                <SummaryRow label="Plan" value={plan.name} c={c} />
                <SummaryRow label="Kitchen" value={plan.kitchenName} c={c} />
                <SummaryRow label="Meals" value={`${selCount || target} / week`} c={c} />
                <SummaryRow label={`First ${plan.fulfillment === 'pickup' ? 'pickup' : 'delivery'}`} value={startIso ? fmtDate(startIso) : '—'} c={c} />
              </Block>
              <Block title="Weekly pricing">
                <SummaryRow label="Meals subtotal" value={money2(est.subtotalCents)} c={c} />
                <SummaryRow label="Service fee" value={money2(est.feeCents)} c={c} />
                <View style={{ height: 1, backgroundColor: c.border2, marginVertical: 8 }} />
                <SummaryRow label="Per week" value={money2(est.totalCents)} bold c={c} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
                  <Icon name="shield" size={15} color={c.green} />
                  <Text style={[type(12.5, 600), { color: c.soft, flex: 1, lineHeight: 18 }]}>Delivery is free for subscribers. You’re charged per delivery — skip a week (no charge), pause, or cancel anytime.</Text>
                </View>
              </Block>
            </>
          ) : null}
        </ScrollView>

        <Dock>
          <DockTotal label="Per week" value={weeklyLabel} />
          {stage === 'customize' ? (
            <Btn label="Continue" iconRight="arrow" flex={1} disabled={selCount < 1} onPress={() => setStage('schedule')} />
          ) : stage === 'schedule' ? (
            <Btn label="Review" iconRight="arrow" flex={1} disabled={!startIso} onPress={() => setStage('review')} />
          ) : (
            <Btn label={busy ? 'Starting…' : 'Confirm & subscribe'} icon="repeat" flex={1} loading={busy} onPress={subscribe} />
          )}
        </Dock>
        <CardPaymentSheet visible={!!addCard} clientSecret={addCard} amountLabel="" mode="save" onPaid={onCardSaved} onClose={() => setAddCard(null)} />
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <GradBox grad={['#A855F7', c.purple]} img={plan.coverUrl ?? undefined} style={{ height: 200 }}>
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} />
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 34, left: 18, height: 24, borderRadius: radius.pill, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,.28)' }}>
            <Icon name="repeat" size={11} color="#fff" />
            <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 }]}>{selModel === 'customer_choice' ? 'You choose' : 'Weekly plan'}</Text>
          </View>
        </GradBox>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -26, padding: 18, paddingTop: 22 }}>
          {plan.goal ? <View style={{ flexDirection: 'row', marginBottom: 10 }}><GoalBadge goal={plan.goal as any} size="md" /></View> : null}
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, lineHeight: 27 }]}>{plan.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <Icon name="repeat" size={15} color={c.primary} />
            <Text style={[type(13.5, 700), { color: c.ink }]}>{target || plan.items.length} meal{(target || plan.items.length) !== 1 ? 's' : ''} / week · {plan.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="chefhat" size={17} color={c.primary} /></View>
            <Text style={[type(14, 800), { color: c.ink }]}>{plan.kitchenName}</Text>
          </View>

          {plan.description ? (<><SectionLabel>About this plan</SectionLabel><Text style={[type(14.5, 500), { color: c.soft, lineHeight: 23 }]}>{plan.description}</Text></>) : null}

          {plan.cadenceWeeks === 2 ? (
            <Text style={[type(13, 600), { color: c.soft, marginTop: 8 }]}>Billed biweekly</Text>
          ) : (
            <Text style={[type(13, 600), { color: c.soft, marginTop: 8 }]}>Billed weekly</Text>
          )}
          {plan.rotating && (
            <Text style={[type(13, 600), { color: c.soft, marginTop: 2 }]}>Meals rotate weekly</Text>
          )}

          <SectionLabel>{selModel === 'customer_choice' ? 'Choose from' : 'In your weekly box'}</SectionLabel>
          {plan.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color="#fff" /></View>
              <Text style={[type(14.5, 700), { color: c.ink, flex: 1 }]}>{it.name}{it.qty > 1 && selModel === 'fixed' ? `  ×${it.qty}` : ''}</Text>
            </View>
          ))}

          {(plan.dietaryTags?.length ?? 0) > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
              {plan.dietaryTags!.map((t) => <View key={t} style={{ height: 26, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Text style={[type(11.5, 700), { color: c.ink2 }]}>{t}</Text></View>)}
            </View>
          ) : null}

          <Text style={[type(12.5, 600), { color: c.muted, marginTop: 16, lineHeight: 19 }]}>Charged per delivery after you confirm that week’s meals. Skip, pause, or cancel anytime — no lock-in. Includes the service fee; delivery free for subscribers.</Text>
        </View>
      </ScrollView>

      <Dock>
        <DockTotal label="Per week" value={weeklyLabel} />
        <Btn label="Get started" icon="repeat" flex={1} onPress={() => setStage(selModel === 'customer_choice' ? 'customize' : 'schedule')} />
      </Dock>
    </Screen>
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return `${WEEKDAY_SHORT[d.getDay()]} ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}
function SummaryRow({ label, value, bold, c }: { label: string; value: string; bold?: boolean; c: any }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 }}>
      <Text style={[type(13.5, bold ? 800 : 600), { color: bold ? c.ink : c.soft }]}>{label}</Text>
      <Text style={[type(bold ? 15 : 13.5, bold ? 900 : 700), { color: c.ink }]}>{value}</Text>
    </View>
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
        <Burst title="You’re on the list!" body={<>You’ve reserved <Text style={type(15, 800)}>{p.name}</Text> with <Text style={type(15, 800)}>{cook.name}</Text>. This is a sample plan — subscribe to a live plan from Plans.</>} actionLabel="Browse plans" onAction={() => router.replace('/experiences?tab=plans')} />
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
