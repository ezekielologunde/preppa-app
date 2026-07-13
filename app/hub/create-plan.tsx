import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Stepper } from '../../src/ui';
import { Screen, TopBar, Dock, DockTotal } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { money } from '../../src/data/data';
import { KField, KInput, MoneyInput, KSeg, KBtn } from '../(tabs)/my-hub';
import { fetchMyKitchenMeals, fetchPlan, upsertPlan, setKitchenCapacity, fetchKitchenCapacity, type CookMeal } from '../../src/lib/subscriptions';
import { fulfillPlanRequest } from '../../src/lib/services';
import { uploadPlanCover } from '../../src/lib/supabase';

const GOALS = [{ key: '', label: 'None' }, { key: 'cut', label: 'Cut' }, { key: 'maintain', label: 'Maintain' }, { key: 'bulk', label: 'Bulk' }];
const DOW = [{ key: 'monday', label: 'Mon' }, { key: 'tuesday', label: 'Tue' }, { key: 'wednesday', label: 'Wed' }, { key: 'thursday', label: 'Thu' }, { key: 'friday', label: 'Fri' }, { key: 'saturday', label: 'Sat' }, { key: 'sunday', label: 'Sun' }];

export default function CreatePlanFlow() {
  const c = useC();
  const router = useRouter();
  const { forRequest, planId } = useLocalSearchParams<{ forRequest?: string; planId?: string }>();
  const editing = typeof planId === 'string' && planId.length > 0;
  const { toast } = useStore();
  const [loading, setLoading] = useState(true);
  const [meals, setMeals] = useState<CookMeal[]>([]);
  const [hasKitchen, setHasKitchen] = useState(true);
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [fulfillment, setFulfillment] = useState('delivery');
  const [goal, setGoal] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({}); // mealId -> qty (0 = not in plan)
  const [cover, setCover] = useState('');        // public cover URL
  const [coverBusy, setCoverBusy] = useState(false);
  const [days, setDays] = useState<string[]>([]); // delivery days (lowercase)
  const [capacity, setCapacity] = useState('');   // max meal portions per delivery day ('' = unlimited)
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { kitchenId: kid, meals } = await fetchMyKitchenMeals();
      setHasKitchen(!!kid); setKitchenId(kid); setMeals(meals);
      if (kid) { try { const cap = await fetchKitchenCapacity(kid); if (cap != null) setCapacity(String(cap)); } catch { /* ignore */ } }
      if (editing) {
        const pl = await fetchPlan(planId!);
        if (pl) {
          setName(pl.name); setDesc(pl.description ?? ''); setPrice(pl.priceCents ? String(pl.priceCents / 100) : '');
          setFulfillment(pl.fulfillment); setGoal(pl.goal ?? ''); setCover(pl.coverUrl ?? ''); setDays(pl.deliveryDays ?? []);
          const q: Record<string, number> = {}; for (const it of pl.items) if (it.mealId) q[it.mealId] = it.qty; setQty(q);
        }
      }
      setLoading(false);
    })();
  }, []);

  const pickCover = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const f = (input.files || [])[0]; if (!f) return;
      setCoverBusy(true);
      try { const ext = (f.name.split('.').pop() || 'jpg').toLowerCase(); setCover(await uploadPlanCover(f, ext)); }
      catch (e: any) { toast(e?.message || 'Could not upload the photo', 'info'); }
      finally { setCoverBusy(false); }
    };
    input.click();
  };
  const toggleDay = (k: string) => setDays((d) => d.includes(k) ? d.filter((x) => x !== k) : [...d, k]);

  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([mealId, q]) => ({ mealId, qty: q }));
  const totalMeals = items.reduce((n, i) => n + i.qty, 0);
  const priceCents = Math.round((Number(price) || 0) * 100);
  const valid = !!name.trim() && priceCents > 0 && items.length > 0;

  const submit = async () => {
    if (busy) return;
    if (!valid) { toast(!name.trim() ? 'Add a plan name' : priceCents <= 0 ? 'Set a price above $0' : 'Add at least one meal to the box', 'info'); return; }
    setBusy(true);
    try {
      const pid = await upsertPlan({
        planId: editing ? planId : undefined,
        name: name.trim(), description: desc.trim() || undefined, priceCents,
        fulfillment: fulfillment as any, goal: goal || undefined, items,
        coverUrl: cover || undefined, deliveryDays: days.length ? days : undefined,
      });
      // per-kitchen weekly capacity (blank = unlimited)
      try { await setKitchenCapacity(capacity.trim() ? Math.max(0, parseInt(capacity, 10) || 0) : null); } catch { /* non-fatal */ }
      // If this plan answers a customer's meal-plan brief, link it + notify them.
      if (forRequest && pid) { try { await fulfillPlanRequest(forRequest, pid); } catch (_e) { /* non-fatal */ } }
      setDone(true);
    } catch (e: any) {
      toast(e?.message || 'Could not publish the plan', 'info');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title={editing ? 'Plan updated' : 'Plan published'}
          body={editing
            ? `Your changes to ${name} are live.`
            : forRequest
              ? `${name} is live and the customer who asked has been notified to subscribe. You’ll earn ${money(priceCents / 100)}/week (net of the Stripe fee) per subscriber.`
              : `${name} is live. Customers can subscribe now — you’ll earn ${money(priceCents / 100)}/week (net of the Stripe fee) for every subscriber.`}
          actionLabel={forRequest ? 'Back to requests' : 'Back to plans'}
          onAction={() => router.replace(forRequest ? '/hub/requests' : '/hub/plans')} />
      </Screen>
    );
  }

  if (loading) {
    return <Screen bg={c.surface}><TopBar title={editing ? 'Edit meal plan' : 'Create a meal plan'} onBack={() => router.back()} /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
  }

  if (!hasKitchen || meals.length === 0) {
    return (
      <Screen bg={c.surface}>
        <TopBar title={editing ? 'Edit meal plan' : 'Create a meal plan'} onBack={() => router.back()} />
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
      <TopBar title={editing ? 'Edit meal plan' : 'Create a meal plan'} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 16 }} />
        <KField label="Cover photo">
          <Press scale={0.98} onPress={pickCover}>
            <View style={{ height: 150, borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border2, alignItems: 'center', justifyContent: 'center' }}>
              {cover ? <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : coverBusy ? <ActivityIndicator color={c.primary} /> : (
                <View style={{ alignItems: 'center', gap: 6 }}>
                  <Icon name="camera" size={22} color={c.muted} />
                  <Text style={[type(12.5, 700), { color: c.soft }]}>Add a cover photo</Text>
                </View>
              )}
              {cover && !coverBusy ? <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}><Text style={[type(11, 800), { color: '#fff' }]}>Change</Text></View> : null}
            </View>
          </Press>
        </KField>
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
        <KField label="Delivery day(s)">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
            {DOW.map((d) => {
              const on = days.includes(d.key);
              return (
                <Press key={d.key} scale={0.95} onPress={() => toggleDay(d.key)}>
                  <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type(13, 800), { color: on ? '#fff' : c.soft }]}>{d.label}</Text>
                  </View>
                </Press>
              );
            })}
          </View>
        </KField>
        <KField label="Weekly capacity (optional)">
          <KInput value={capacity} onChange={setCapacity} placeholder="Max meals per delivery day" />
          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6, lineHeight: 16 }]}>We won’t sell past this — leave blank for unlimited. E.g. a 3-meal box → 30 means up to ~10 subscribers.</Text>
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
