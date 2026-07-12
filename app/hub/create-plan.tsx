import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Stepper } from '../../src/ui';
import { Screen, TopBar, Dock, DockTotal } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { money } from '../../src/data/data';
import { KField, KInput, MoneyInput, KSeg, KBtn } from '../(tabs)/my-hub';
import { fetchMyKitchenMeals, upsertPlan, type CookMeal } from '../../src/lib/subscriptions';
import { fulfillPlanRequest } from '../../src/lib/services';

const GOALS = [{ key: '', label: 'None' }, { key: 'cut', label: 'Cut' }, { key: 'maintain', label: 'Maintain' }, { key: 'bulk', label: 'Bulk' }];

export default function CreatePlanFlow() {
  const c = useC();
  const router = useRouter();
  const { forRequest } = useLocalSearchParams<{ forRequest?: string }>();
  const { toast } = useStore();
  const [loading, setLoading] = useState(true);
  const [meals, setMeals] = useState<CookMeal[]>([]);
  const [hasKitchen, setHasKitchen] = useState(true);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [fulfillment, setFulfillment] = useState('delivery');
  const [goal, setGoal] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({}); // mealId -> qty (0 = not in plan)
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetchMyKitchenMeals().then(({ kitchenId, meals }) => {
      setHasKitchen(!!kitchenId);
      setMeals(meals);
      setLoading(false);
    });
  }, []);

  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([mealId, q]) => ({ mealId, qty: q }));
  const totalMeals = items.reduce((n, i) => n + i.qty, 0);
  const priceCents = Math.round((Number(price) || 0) * 100);
  const valid = !!name.trim() && priceCents > 0 && items.length > 0;

  const submit = async () => {
    if (busy) return;
    if (!valid) { toast(!name.trim() ? 'Add a plan name' : priceCents <= 0 ? 'Set a price above $0' : 'Add at least one meal to the box', 'info'); return; }
    setBusy(true);
    try {
      const planId = await upsertPlan({ name: name.trim(), description: desc.trim() || undefined, priceCents, fulfillment: fulfillment as any, goal: goal || undefined, items });
      // If this plan answers a customer's meal-plan brief, link it + notify them.
      if (forRequest && planId) { try { await fulfillPlanRequest(forRequest, planId); } catch (_e) { /* non-fatal */ } }
      setDone(true);
    } catch (e: any) {
      toast(e?.message || 'Could not publish the plan', 'info');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Plan published"
          body={forRequest
            ? `${name} is live and the customer who asked has been notified to subscribe. You’ll earn ${money(priceCents / 100)}/week (net of the Stripe fee) per subscriber.`
            : `${name} is live. Customers can subscribe now — you’ll earn ${money(priceCents / 100)}/week (net of the Stripe fee) for every subscriber.`}
          actionLabel={forRequest ? 'Back to requests' : 'Back to plans'}
          onAction={() => router.replace(forRequest ? '/hub/requests' : '/hub/plans')} />
      </Screen>
    );
  }

  if (loading) {
    return <Screen bg={c.surface}><TopBar title="Create a meal plan" onBack={() => router.back()} /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
  }

  if (!hasKitchen || meals.length === 0) {
    return (
      <Screen bg={c.surface}>
        <TopBar title="Create a meal plan" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 60, height: 60, borderRadius: 19, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="chefhat" size={28} color={c.primary} /></View>
          <Text style={[type(18, 900), { color: c.ink, marginTop: 14, textAlign: 'center' }]}>{hasKitchen ? 'Add meals first' : 'Set up your kitchen first'}</Text>
          <Text style={[type(13.5, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 20 }]}>A plan is a weekly box of your meals. {hasKitchen ? 'Create a few meals, then build a plan from them.' : 'Finish your kitchen setup to start selling.'}</Text>
          <View style={{ marginTop: 18 }}><KBtn label={hasKitchen ? 'Add a meal' : 'Go to My Hub'} variant="pri" onPress={() => router.replace(hasKitchen ? '/hub/create-meal' : '/my-hub')} /></View>
        </View>
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title="Create a meal plan" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 16 }} />
        <KField label="Plan name"><KInput value={name} onChange={setName} placeholder="e.g. Weeknight Dinner Box" /></KField>
        <KField label="What’s in the box (short description)"><KInput value={desc} onChange={setDesc} placeholder="Three chef-cooked dinners, rotating each week…" multiline /></KField>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><KField label="Weekly price"><MoneyInput value={price} onChange={setPrice} /></KField></View>
        </View>
        <KField label="Fulfillment">
          <KSeg options={[{ key: 'delivery', label: 'Delivery' }, { key: 'pickup', label: 'Pickup' }]} value={fulfillment} onChange={setFulfillment} />
        </KField>
        <KField label="Goal (optional)">
          <KSeg options={GOALS} value={goal} onChange={setGoal} />
        </KField>

        <Text style={[type(13, 800), { color: c.soft, marginTop: 18, marginBottom: 8 }]}>Meals in the box{totalMeals > 0 ? ` · ${totalMeals}/week` : ''}</Text>
        <View style={{ borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, overflow: 'hidden' }}>
          {meals.map((m, i) => {
            const q = qty[m.id] || 0;
            return (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: q > 0 ? c.primaryL : c.surface, borderBottomWidth: i === meals.length - 1 ? 0 : 1, borderBottomColor: c.border2 }}>
                <Press scale={0.95} onPress={() => setQty((s) => ({ ...s, [m.id]: q > 0 ? 0 : 1 }))}>
                  <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: q > 0 ? c.primary : c.border, backgroundColor: q > 0 ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {q > 0 ? <Icon name="check" size={14} color="#fff" /> : null}
                  </View>
                </Press>
                <View style={{ flex: 1 }}>
                  <Text style={[type(14.5, 700), { color: c.ink }]}>{m.name}</Text>
                  <Text style={[type(12, 600), { color: c.muted, marginTop: 1 }]}>{money(m.priceCents / 100)}</Text>
                </View>
                {q > 0 ? <Stepper sm value={q} onDec={() => setQty((s) => ({ ...s, [m.id]: Math.max(0, q - 1) }))} onInc={() => setQty((s) => ({ ...s, [m.id]: q + 1 }))} /> : null}
              </View>
            );
          })}
        </View>

        <View style={{ marginTop: 20, backgroundColor: c.primaryL, borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <Icon name="spark" size={19} color={c.primary} />
          <Text style={[type(12.5, 600), { color: c.primaryD, lineHeight: 19, flex: 1 }]}>Customers are billed weekly and can pause or cancel anytime. Your payout lands net of the Stripe fee — cash out from Earnings.</Text>
        </View>
      </ScrollView>
      <Dock>
        <DockTotal label="Per week" value={money(priceCents / 100)} />
        <KBtn label={busy ? 'Publishing…' : 'Publish plan'} variant="pri" flex={1} height={48} onPress={submit} style={{ opacity: valid && !busy ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}
