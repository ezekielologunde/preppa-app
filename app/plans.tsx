import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Modal, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press } from '../src/ui';
import { Stepper } from '../src/ui/primitives';
import { money } from '../src/data/data';
import {
  fetchActivePlans, listMySubscriptions, pauseSubscription, resumeSubscription, cancelSubscription,
  skipCycle, selectCycleMeals, customerWeeklyCents,
  type Plan, type MySubscription, type CycleSummary,
} from '../src/lib/subscriptions';

const money2 = (cents: number) => money(cents / 100);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}`;
}
/** Customer weekly price to advertise for a browse card (fixed = cook price + fee). */
const browseWeekly = (p: Plan) => customerWeeklyCents(p.priceCents, p.serviceFeeBps);

export default function PlansTab() {
  const c = useC();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useStore();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subs, setSubs] = useState<MySubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [editSub, setEditSub] = useState<MySubscription | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s] = await Promise.all([fetchActivePlans(), listMySubscriptions()]);
    setPlans(p); setSubs(s); setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (sub: MySubscription, action: 'pause' | 'resume' | 'cancel' | 'skip') => {
    if (busy) return;
    setBusy(sub.id);
    try {
      if (action === 'pause') { await pauseSubscription(sub.id); toast('Plan paused', 'check', true); }
      else if (action === 'resume') { await resumeSubscription(sub.id); toast('Plan resumed', 'check', true); }
      else if (action === 'skip') { await skipCycle(sub.nextCycle!.id); toast('Skipped this week', 'check', true); }
      else { await cancelSubscription(sub.id); toast('Plan canceled', 'x'); }
      await load();
    } catch (e: any) {
      toast(e?.message || 'Could not update your plan', 'info');
    } finally { setBusy(null); }
  };

  const subscribedPlanIds = new Set(subs.map((s) => s.planId));
  const available = plans.filter((p) => !subscribedPlanIds.has(p.id));

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 10, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <Text style={[type(28, 900), { color: c.ink, letterSpacing: -1 }]}>Meal plans</Text>
        <Text style={[type(14, 500), { color: c.soft, marginTop: 8, lineHeight: 20 }]}>A weekly box from a local cook you love — cooked fresh, on repeat. Choose your meals, skip a week, pause or cancel anytime.</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40, maxWidth: 760, alignSelf: 'center', width: '100%' }}>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : (
          <>
            {subs.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
                <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }]}>Your plans</Text>
                {subs.map((s) => (
                  <SubCard key={s.id} s={s} busy={busy === s.id} onAct={(a) => act(s, a)} onEditMeals={() => setEditSub(s)} />
                ))}
              </View>
            ) : null}

            <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }]}>
                {subs.length > 0 ? 'More plans near you' : 'Plans from cooks near you'}
              </Text>
              {available.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                  <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={26} color={c.primary} /></View>
                  <Text style={[type(16, 900), { color: c.ink, marginTop: 14 }]}>No plans near you yet</Text>
                  <Text style={[type(13.5, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 20 }]}>Cooks are adding weekly boxes. Check back soon — or order a meal now on Home.</Text>
                </View>
              ) : (
                available.map((p) => <PlanCard key={p.id} p={p} onPress={() => router.push(`/plan/${p.id}`)} />)
              )}
            </View>
          </>
        )}
      </ScrollView>

      <EditMealsModal sub={editSub} onClose={() => setEditSub(null)} onSaved={async () => { setEditSub(null); await load(); toast('Meals updated', 'check', true); }} />
    </View>
  );
}

function cycleStatus(cy: CycleSummary | null, lifecycle: string): { label: string; tint: (c: any) => string } {
  if (lifecycle === 'paused') return { label: 'Paused', tint: (c) => c.muted };
  if (lifecycle === 'suspended' || lifecycle === 'payment_failed') return { label: 'Payment issue', tint: (c) => c.red };
  if (lifecycle === 'cancellation_scheduled') return { label: 'Ending', tint: (c) => c.muted };
  if (!cy) return { label: 'Active', tint: (c) => c.green };
  if (cy.skipped || cy.status === 'skipped') return { label: 'Skipped', tint: (c) => c.muted };
  if (cy.status === 'selection_open') return { label: 'Confirm this week', tint: (c) => c.primary };
  if (cy.status === 'selection_closed') return { label: 'Confirmed', tint: (c) => c.green };
  if (cy.status === 'charged' || cy.status === 'order_created') return { label: 'On the way', tint: (c) => c.green };
  return { label: 'Active', tint: (c) => c.green };
}

function SubCard({ s, busy, onAct, onEditMeals }: {
  s: MySubscription; busy: boolean;
  onAct: (a: 'pause' | 'resume' | 'cancel' | 'skip') => void; onEditMeals: () => void;
}) {
  const c = useC();
  const cy = s.nextCycle;
  const paused = s.lifecycle === 'paused';
  const st = cycleStatus(cy, s.lifecycle);
  const tint = st.tint(c);
  const meals = (cy && cy.items.length ? cy.items : s.items);
  const priceLabel = cy && cy.totalCents > 0 ? `${money2(cy.totalCents)}` : `${money2(customerWeeklyCents(s.priceCents))}`;
  const canSkip = !!cy && (cy.status === 'selection_open' || cy.status === 'scheduled') && !cy.skipped && s.lifecycle === 'active';
  const canEditMeals = !!cy && cy.canEdit && s.selectionModel === 'customer_choice';

  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16, ...shadow.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={[type(16.5, 900), { color: c.ink, letterSpacing: -0.3 }]}>{s.planName}</Text>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{s.kitchenName} · {priceLabel}/wk{s.preferredDay ? ` · ${s.preferredDay}` : ''}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: c.bg2 }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tint }} />
          <Text style={[type(11, 900), { color: tint, textTransform: 'uppercase', letterSpacing: 0.3 }]}>{st.label}</Text>
        </View>
      </View>

      {cy && !cy.skipped && s.lifecycle === 'active' ? (
        <View style={{ marginTop: 12, backgroundColor: c.bg2, borderRadius: radius.md, padding: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="repeat" size={13} color={c.primary} />
            <Text style={[type(12, 800), { color: c.ink2 }]}>
              {s.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'} {fmtDate(cy.deliveryDate)}
              {cy.canEdit ? ` · confirm by ${fmtDate(cy.selectionDeadline)}` : ''}
            </Text>
          </View>
          {meals.length > 0 ? (
            <Text numberOfLines={2} style={[type(12.5, 600), { color: c.soft, marginTop: 6, lineHeight: 18 }]}>
              {meals.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(' · ')}
            </Text>
          ) : (
            <Text style={[type(12.5, 600), { color: c.muted, marginTop: 6 }]}>No meals chosen yet — pick before the cutoff.</Text>
          )}
          {canEditMeals ? (
            <Press scale={0.97} onPress={onEditMeals} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
              <Text style={[type(12.5, 800), { color: c.primary }]}>Choose meals ›</Text>
            </Press>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {paused ? <PillBtn label="Resume" primary busy={busy} onPress={() => onAct('resume')} /> : null}
        {!paused && canSkip ? <PillBtn label="Skip week" busy={busy} onPress={() => onAct('skip')} /> : null}
        {!paused && s.lifecycle === 'active' ? <PillBtn label="Pause" busy={busy} onPress={() => onAct('pause')} /> : null}
        <PillBtn label="Cancel" danger busy={busy} onPress={() => onAct('cancel')} />
      </View>
    </View>
  );
}

function PillBtn({ label, primary, danger, busy, onPress }: { label: string; primary?: boolean; danger?: boolean; busy?: boolean; onPress: () => void }) {
  const c = useC();
  const bg = primary ? c.primary : c.bg2;
  const fg = primary ? '#fff' : danger ? c.red : c.ink2;
  return (
    <Press scale={0.96} onPress={busy ? undefined : onPress} style={{ flex: 1 }}>
      <View style={{ height: 40, borderRadius: radius.md, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', borderWidth: primary ? 0 : 1, borderColor: c.border }}>
        {busy ? <ActivityIndicator size="small" color={fg} /> : <Text style={[type(13.5, 800), { color: fg }]}>{label}</Text>}
      </View>
    </Press>
  );
}

/** Inline meal editor for a customer-choice cycle that's still open. */
function EditMealsModal({ sub, onClose, onSaved }: { sub: MySubscription | null; onClose: () => void; onSaved: () => void }) {
  const c = useC();
  const { toast } = useStore();
  const [sel, setSel] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!sub) return;
    const init: Record<string, number> = {};
    for (const it of sub.nextCycle?.items ?? []) if (it.mealId) init[it.mealId] = it.qty;
    setSel(init);
  }, [sub?.id]);

  if (!sub || !sub.nextCycle) return null;
  const menu = sub.items; // offered meals for this plan
  const count = Object.values(sel).reduce((n, q) => n + q, 0);
  const bump = (id: string, d: number) => setSel((s) => {
    const q = Math.max(0, (s[id] ?? 0) + d); const next = { ...s, [id]: q }; if (q === 0) delete next[id]; return next;
  });

  const save = async () => {
    setBusy(true);
    try {
      await selectCycleMeals(sub.nextCycle!.id, Object.entries(sel).filter(([, q]) => q > 0).map(([mealId, qty]) => ({ mealId, qty })));
      onSaved();
    } catch (e: any) { toast(e?.message || 'Could not save your meals', 'info'); }
    finally { setBusy(false); }
  };

  return (
    <Modal visible={!!sub} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' }}>
        <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 18, maxHeight: '80%' }}>
          <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.4 }]}>This week’s meals</Text>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 4 }]}>Confirm by {fmtDate(sub.nextCycle.selectionDeadline)} · {count} chosen</Text>
          <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
            {menu.map((it) => (
              <View key={it.mealId} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type(14.5, 700), { color: c.ink }]}>{it.name}</Text>
                  {it.priceCents ? <Text style={[type(12, 600), { color: c.muted, marginTop: 2 }]}>{money2(it.priceCents)}</Text> : null}
                </View>
                <Stepper value={sel[it.mealId ?? ''] ?? 0} onDec={() => bump(it.mealId!, -1)} onInc={() => bump(it.mealId!, 1)} sm />
              </View>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <PillBtn label="Cancel" busy={false} onPress={onClose} />
            <Press scale={0.97} onPress={busy ? undefined : save} style={{ flex: 1 }}>
              <View style={{ height: 44, borderRadius: radius.md, backgroundColor: count > 0 ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[type(14, 800), { color: '#fff' }]}>Save meals</Text>}
              </View>
            </Press>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PlanCard({ p, onPress }: { p: Plan; onPress: () => void }) {
  const c = useC();
  const meals = p.mealsPerDelivery ?? p.items.reduce((n, i) => n + i.qty, 0);
  return (
    <Press scale={0.985} onPress={onPress} style={{ marginBottom: 12 }}>
      <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16, ...shadow.card }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{p.name}</Text>
            <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{p.kitchenName} · {meals} meals/wk · {p.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}{p.selectionModel === 'customer_choice' ? ' · you choose' : ''}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.5 }]}>{money2(browseWeekly(p))}</Text>
            <Text style={[type(10.5, 700), { color: c.muted }]}>/week</Text>
          </View>
        </View>
        {p.items.length > 0 ? (
          <Text numberOfLines={1} style={[type(12.5, 600), { color: c.ink2, marginTop: 10 }]}>{p.items.map((i) => i.name).join(' · ')}</Text>
        ) : null}
      </View>
    </Press>
  );
}
