import React, { useEffect, useRef, useState } from 'react';
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
const DIETARY = ['Vegetarian', 'Vegan', 'Halal', 'Gluten-free', 'Dairy-free', 'Keto', 'High-protein', 'Low-carb', 'Pescatarian'];
const ALLERGENS = ['Nuts', 'Peanuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy', 'Fish', 'Sesame'];
const MAX_PLAN_PRICE_CENTS = 500_000;
const MAX_CAPACITY = 1_000_000;

function moneyCents(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function optionalInt(value: string, min: number, max: number): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

const digitsOnly = (value: string) => value.replace(/\D/g, '');

export default function CreatePlanFlow() {
  const c = useC();
  const router = useRouter();
  const { forRequest, planId } = useLocalSearchParams<{ forRequest?: string; planId?: string }>();
  const editing = typeof planId === 'string' && planId.length > 0;
  const { toast } = useStore();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [meals, setMeals] = useState<CookMeal[]>([]);
  const [hasKitchen, setHasKitchen] = useState(true);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [fulfillment, setFulfillment] = useState('delivery');
  const [goal, setGoal] = useState('');
  const [selectionModel, setSelectionModel] = useState<'fixed' | 'customer_choice'>('fixed');
  const [perMeal, setPerMeal] = useState('');            // per-meal price (customer_choice)
  const [mealsPerDelivery, setMealsPerDelivery] = useState(''); // how many the customer picks each week
  const [servings, setServings] = useState('');          // servings per meal
  const [dietary, setDietary] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  // advanced (collapsed) config
  const [advanced, setAdvanced] = useState(false);
  const [cutoff, setCutoff] = useState('');              // order cutoff (hours before delivery)
  const [lead, setLead] = useState('');                  // lead time for the first box (hours)
  const [minCommit, setMinCommit] = useState('');        // minimum commitment (weeks)
  const [trialOn, setTrialOn] = useState(false);
  const [trialPrice, setTrialPrice] = useState('');      // trial price per week
  const [trialWeeks, setTrialWeeks] = useState('');      // number of trial cycles
  const [qtyByWeek, setQtyByWeek] = useState<Record<number, Record<string, number>>>({ 0: {} }); // week -> mealId -> qty
  const [activeWeek, setActiveWeek] = useState(0);
  const [rotationWeeks, setRotationWeeks] = useState(1);
  const [cover, setCover] = useState('');        // public cover URL
  const [coverBusy, setCoverBusy] = useState(false);
  const coverInFlight = useRef(false);
  const [days, setDays] = useState<string[]>([]); // delivery days (lowercase)
  const [capacity, setCapacity] = useState('');   // max meal portions per delivery day ('' = unlimited)
  const [cadenceWeeks, setCadenceWeeks] = useState<1 | 2>(1); // NEW: 1=weekly, 2=biweekly
  const [rotating, setRotating] = useState(false); // NEW: meals rotate weekly
  const [busy, setBusy] = useState(false);
  const saveInFlight = useRef(false);
  const loadSequence = useRef(0);
  const mounted = useRef(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [existingStatus, setExistingStatus] = useState<'draft' | 'active' | 'archived' | null>(null);
  const [done, setDone] = useState(false);

  const load = async () => {
    const request = ++loadSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      const { kitchenId: kid, meals } = await fetchMyKitchenMeals();
      if (!mounted.current || request !== loadSequence.current) return;
      setHasKitchen(!!kid); setMeals(meals);
      if (kid) {
        const cap = await fetchKitchenCapacity(kid);
        if (!mounted.current || request !== loadSequence.current) return;
        setCapacity(cap == null ? '' : String(cap));
      }
      if (editing) {
        const pl = await fetchPlan(planId!);
        if (!mounted.current || request !== loadSequence.current) return;
        if (!pl) throw new Error('This meal plan is no longer available.');
        {
          setName(pl.name); setDesc(pl.description ?? ''); setPrice(pl.priceCents ? String(pl.priceCents / 100) : '');
          setFulfillment(pl.fulfillment); setGoal(pl.goal ?? ''); setCover(pl.coverUrl ?? ''); setDays(pl.deliveryDays ?? []);
          setSelectionModel(pl.selectionModel === 'customer_choice' ? 'customer_choice' : 'fixed');
          setPerMeal(pl.perMealCents ? String(pl.perMealCents / 100) : '');
          setMealsPerDelivery(pl.mealsPerDelivery ? String(pl.mealsPerDelivery) : '');
          setServings(pl.servings ? String(pl.servings) : '');
          setDietary(pl.dietaryTags ?? []); setAllergens(pl.allergens ?? []);
          setCadenceWeeks(pl.cadenceWeeks === 2 ? 2 : 1); // NEW
          setRotating(pl.rotating ?? false); // NEW
          if (pl.cutoffHours != null) setCutoff(String(pl.cutoffHours));
          if (pl.leadTimeHours != null) setLead(String(pl.leadTimeHours));
          if (pl.minCommitment != null) setMinCommit(String(pl.minCommitment));
          if (pl.trialCycles && pl.trialCycles > 0) {
            setTrialOn(true); setTrialWeeks(String(pl.trialCycles));
            setTrialPrice(pl.trialPriceCents != null ? String(pl.trialPriceCents / 100) : '');
          }
          // open Advanced if anything there is non-default
          if ((pl.cutoffHours && pl.cutoffHours !== 48) || (pl.leadTimeHours && pl.leadTimeHours !== 48) || (pl.minCommitment && pl.minCommitment > 1) || (pl.trialCycles && pl.trialCycles > 0)) setAdvanced(true);
          const byWeek: Record<number, Record<string, number>> = {};
          (pl.itemsByWeek ?? [pl.items]).forEach((weekItems, w) => {
            const q: Record<string, number> = {};
            for (const it of weekItems) if (it.mealId) q[it.mealId] = Math.min(20, Math.max(0, it.qty));
            byWeek[w] = q;
          });
          setQtyByWeek(byWeek);
          setRotationWeeks(Math.max(1, pl.rotationWeeks ?? 1));
          setExistingStatus(pl.status ?? 'active');
        }
      }
    } catch (e: any) {
      if (mounted.current && request === loadSequence.current) setLoadError('Check your connection and try again. Your meal plan has not changed.');
    } finally {
      if (mounted.current && request === loadSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; loadSequence.current += 1; };
  }, []);

  const pickCover = () => {
    if (coverInFlight.current || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const f = (input.files || [])[0]; if (!f) return;
      if (coverInFlight.current) return;
      coverInFlight.current = true;
      setCoverBusy(true);
      try {
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase();
        const nextCover = await uploadPlanCover(f, ext);
        if (mounted.current) setCover(nextCover);
      }
      catch (e: any) { toast(e?.message || 'Could not upload the photo', 'info'); }
      finally { coverInFlight.current = false; if (mounted.current) setCoverBusy(false); }
    };
    input.click();
  };
  const toggleDay = (k: string) => setDays((d) => d.includes(k) ? d.filter((x) => x !== k) : [...d, k]);

  const choice = selectionModel === 'customer_choice';
  const isRotating = rotating && !choice;
  const qty = qtyByWeek[activeWeek] ?? {};
  const setQty = (updater: (s: Record<string, number>) => Record<string, number>) =>
    setQtyByWeek((s) => ({ ...s, [activeWeek]: updater(s[activeWeek] ?? {}) }));
  const items = Object.entries(qty).filter(([, q]) => q > 0).map(([mealId, q]) => ({ mealId, qty: q }));
  const totalMeals = items.reduce((n, i) => n + i.qty, 0);
  // validity is gated on week 0 only -- advance_cycles() falls back to week 0's menu for
  // any rotation week a cook hasn't filled in yet, so week 0 must always be complete.
  const week0Items = Object.entries(qtyByWeek[0] ?? {}).filter(([, q]) => q > 0);
  const allWeekItems = isRotating
    ? Array.from({ length: rotationWeeks }, (_, w) => w).flatMap((w) =>
        Object.entries(qtyByWeek[w] ?? {}).filter(([, q]) => q > 0).map(([mealId, q]) => ({ mealId, qty: q, weekIndex: w })))
    : items;
  const parsedPriceCents = moneyCents(price);
  const parsedPerMealCents = moneyCents(perMeal);
  const priceCents = parsedPriceCents ?? 0;
  const perMealCents = parsedPerMealCents ?? 0;
  const mpd = optionalInt(mealsPerDelivery, 1, 30) ?? 0;
  const servingCount = optionalInt(servings, 1, 20);
  // Weekly price shown to the cook: fixed = the bundle price; customer-choice ≈ per-meal × picks.
  const weeklyCents = choice ? perMealCents * mpd : priceCents;
  const nameValid = name.trim().length >= 2 && name.trim().length <= 80;
  const priceValid = choice
    ? parsedPerMealCents != null && perMealCents >= 100 && perMealCents <= MAX_PLAN_PRICE_CENTS && mpd >= 1 && mpd <= 30 && weeklyCents <= MAX_PLAN_PRICE_CENTS
    : parsedPriceCents != null && priceCents > 0 && priceCents <= MAX_PLAN_PRICE_CENTS;
  const settingsValid = (!servings.trim() || servingCount != null)
    && (!capacity.trim() || optionalInt(capacity, 0, MAX_CAPACITY) != null)
    && (!cutoff.trim() || optionalInt(cutoff, 0, 336) != null)
    && (!lead.trim() || optionalInt(lead, 0, 336) != null)
    && (!minCommit.trim() || optionalInt(minCommit, 1, 52) != null)
    && (!trialOn || ((moneyCents(trialPrice) ?? -1) >= 0 && (moneyCents(trialPrice) ?? MAX_PLAN_PRICE_CENTS + 1) <= MAX_PLAN_PRICE_CENTS && optionalInt(trialWeeks || '1', 1, 12) != null));
  const valid = nameValid && desc.trim().length <= 600 && week0Items.length > 0 && allWeekItems.length <= 60 && priceValid && settingsValid;
  const advancedSummary = [cadenceWeeks === 2 ? 'Biweekly' : null, rotating ? 'Rotating' : null, trialOn ? 'Trial' : null, `${cutoff || '48'}h cutoff`, minCommit && minCommit !== '1' ? `${minCommit}wk min` : null].filter(Boolean).join(' · ');
  const submit = async (asDraft = false) => {
    if (saveInFlight.current) return;
    if (!valid) {
      toast(name.trim().length < 2 ? 'Use at least 2 characters for the plan name'
        : name.trim().length > 80 ? 'Keep the plan name to 80 characters'
        : desc.trim().length > 600 ? 'Keep the description to 600 characters'
        : week0Items.length === 0 ? (choice ? 'Add meals to the menu' : 'Add at least one meal to the box')
        : allWeekItems.length > 60 ? 'Keep the plan to 60 meal entries across all rotation weeks'
        : !priceValid ? (choice ? (parsedPerMealCents == null || perMealCents < 100 ? 'Set a valid price per meal of at least $1' : weeklyCents > MAX_PLAN_PRICE_CENTS ? 'Keep the full delivery price at $5,000 or less' : 'Choose 1 to 30 meals per delivery')
          : parsedPriceCents == null || priceCents <= 0 ? 'Set a valid weekly price above $0' : 'Keep the weekly price at $5,000 or less')
        : 'Check the serving, capacity, cutoff, commitment, and trial limits', 'info');
      return;
    }
    saveInFlight.current = true;
    setBusy(true);
    setSavingDraft(asDraft);
    try {
      const pid = await upsertPlan({
        planId: editing ? planId : undefined,
        name: name.trim(), description: desc.trim() || undefined,
        fulfillment: fulfillment as any, goal: goal || undefined, items: allWeekItems,
        coverUrl: cover || undefined, deliveryDays: days.length ? days : undefined,
        selectionModel,
        servings: servingCount,
        dietaryTags: dietary.length ? dietary : undefined,
        allergens: allergens.length ? allergens : undefined,
        cadenceWeeks, // NEW
        rotating: isRotating, // NEW
        rotationWeeks: isRotating ? rotationWeeks : 1,
        cutoffHours: optionalInt(cutoff, 0, 336),
        leadTimeHours: optionalInt(lead, 0, 336),
        minCommitment: optionalInt(minCommit, 1, 52),
        asDraft,
        ...(trialOn
          ? { trialPriceCents: moneyCents(trialPrice) ?? 0, trialCycles: optionalInt(trialWeeks || '1', 1, 12) }
          : { trialCycles: 0 }),
        ...(choice
          ? { perMealCents, mealsPerDelivery: mpd, priceCents: perMealCents * mpd }
          : { priceCents }),
      });
      // Capacity protects the kitchen from overselling. Do not report full success if it was not saved.
      try {
        await setKitchenCapacity(capacity.trim() ? optionalInt(capacity, 0, MAX_CAPACITY)! : null);
      } catch {
        throw new Error('The plan was saved, but weekly capacity could not update. Try saving again.');
      }
      // If this plan answers a customer's meal-plan brief, link it + notify them.
      if (!asDraft && forRequest && pid) {
        try {
          await fulfillPlanRequest(forRequest, pid);
        } catch {
          throw new Error('The plan was published, but it could not be linked to the customer request. Try again from the request.');
        }
      }
      if (asDraft) { toast('Draft saved', 'check', true); router.replace('/hub/plans'); return; }
      setDone(true);
    } catch (e: any) {
      toast(e?.message || 'Could not publish the plan', 'info');
    } finally { saveInFlight.current = false; setBusy(false); }
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title={editing ? 'Plan updated' : 'Plan published'}
          body={editing
            ? `Your changes to ${name} are live.`
            : forRequest
              ? `${name} is live and the customer who asked has been notified to subscribe. You’ll earn about ${money(weeklyCents / 100)}/week (net of the Stripe fee) per subscriber.`
              : `${name} is live. Customers can subscribe now — you’ll earn about ${money(weeklyCents / 100)}/week (net of the Stripe fee) for every subscriber.`}
          actionLabel={forRequest ? 'Back to requests' : 'Back to plans'}
          onAction={() => router.replace(forRequest ? '/hub/requests' : '/hub/plans')} />
      </Screen>
    );
  }

  if (loading) {
    return <Screen bg={c.surface}><TopBar title={editing ? 'Edit meal plan' : 'Create a meal plan'} onBack={() => router.back()} /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
  }
  if (loadError) {
    return <Screen bg={c.surface}><TopBar title={editing ? 'Edit meal plan' : 'Create a meal plan'} onBack={() => router.back()} /><View accessibilityRole="alert" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text style={[type(16, 900), { color: c.ink, textAlign: 'center' }]}>Meal plan couldn’t load</Text><Text style={[type(13.5, 600), { color: c.soft, textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 16 }]}>{loadError}</Text><KBtn label="Try again" variant="pri" onPress={load} /></View></Screen>;
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
          <Press scale={0.98} onPress={pickCover} disabled={coverBusy} label={cover ? 'Change plan cover photo' : 'Add plan cover photo'}>
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
        <KField label="Plan name"><KInput value={name} onChange={setName} placeholder="e.g. Weeknight Dinner Box" maxLength={80} /></KField>
        <KField label="What’s in the box (short description)">
          <KInput value={desc} onChange={setDesc} placeholder="Three chef-cooked dinners, rotating each week…" multiline maxLength={600} />
          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6, textAlign: 'right' }]}>{desc.length}/600</Text>
        </KField>

        <KField label="How it works">
          <KSeg options={[{ key: 'fixed', label: 'Fixed box' }, { key: 'customer_choice', label: 'Customer picks' }]} value={selectionModel} onChange={(v) => setSelectionModel(v as any)} />
          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6, lineHeight: 16 }]}>
            {choice ? 'Customers choose their meals each week from the menu below, at a set price per meal.' : 'Every subscriber gets the same box of meals you pick below.'}
          </Text>
        </KField>

        {choice ? (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><KField label="Price per meal"><MoneyInput value={perMeal} onChange={setPerMeal} /></KField></View>
            <View style={{ flex: 1 }}><KField label="Meals per delivery"><KInput value={mealsPerDelivery} onChange={(v) => setMealsPerDelivery(digitsOnly(v))} placeholder="1 to 30" maxLength={2} /></KField></View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><KField label="Weekly price"><MoneyInput value={price} onChange={setPrice} /></KField></View>
            <View style={{ flex: 1 }}><KField label="Servings per meal"><KInput value={servings} onChange={(v) => setServings(digitsOnly(v))} placeholder="1 to 20" maxLength={2} /></KField></View>
          </View>
        )}
        {choice ? <KField label="Servings per meal"><KInput value={servings} onChange={(v) => setServings(digitsOnly(v))} placeholder="1 to 20" maxLength={2} /></KField> : null}

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
          <KInput value={capacity} onChange={(v) => setCapacity(digitsOnly(v))} placeholder="Max meals per delivery day" accessibilityLabel="Kitchen capacity per delivery day" maxLength={7} />
          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6, lineHeight: 16 }]}>We won’t sell past this — leave blank for unlimited. E.g. a 3-meal box → 30 means up to ~10 subscribers.</Text>
        </KField>
        <KField label="Dietary tags (optional)">
          <TagChips options={DIETARY} value={dietary} onToggle={(t) => setDietary((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} />
        </KField>
        <KField label="Contains allergens (optional)">
          <TagChips options={ALLERGENS} value={allergens} onToggle={(t) => setAllergens((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} danger />
        </KField>

        <Text style={[type(13, 800), { color: c.soft, marginTop: 18, marginBottom: 8 }]}>
          {choice ? `Menu customers choose from${items.length ? ` · ${items.length} offered` : ''}` : `Meals in the box${totalMeals > 0 ? ` · ${totalMeals}/week` : ''}`}
        </Text>
        {isRotating ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
              {Array.from({ length: rotationWeeks }, (_, w) => w).map((w) => {
                const filled = Object.values(qtyByWeek[w] ?? {}).some((n) => n > 0);
                return (
                  <Press key={w} onPress={() => setActiveWeek(w)}>
                    <View style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: activeWeek === w ? c.primary : c.bg2, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Text style={[type(12.5, 800), { color: activeWeek === w ? '#fff' : c.ink }]}>Week {w + 1}</Text>
                      {!filled ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: activeWeek === w ? '#fff' : c.muted }} /> : null}
                    </View>
                  </Press>
                );
              })}
            </View>
            {rotationWeeks < 4 ? (
              <Press onPress={() => { setRotationWeeks((n) => n + 1); }} label="Add rotation week">
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={15} color={c.ink} /></View>
              </Press>
            ) : null}
            {rotationWeeks > 2 ? (
              <Press onPress={() => { setRotationWeeks((n) => n - 1); if (activeWeek >= rotationWeeks - 1) setActiveWeek(0); }} label="Remove rotation week">
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name="minus" size={15} color={c.ink} /></View>
              </Press>
            ) : null}
          </View>
        ) : null}
        {isRotating ? (
          <Text style={[type(11.5, 600), { color: c.muted, marginBottom: 8, lineHeight: 16 }]}>Week {activeWeek + 1} of {rotationWeeks} — cycles automatically. Any week left empty falls back to Week 1’s menu.</Text>
        ) : null}
        <View style={{ borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, overflow: 'hidden' }}>
          {meals.map((m, i) => {
            const q = qty[m.id] || 0;
            return (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, backgroundColor: q > 0 ? c.primaryL : c.surface, borderBottomWidth: i === meals.length - 1 ? 0 : 1, borderBottomColor: c.border2 }}>
                <Press scale={0.95} onPress={() => setQty((s) => ({ ...s, [m.id]: q > 0 ? 0 : 1 }))} label={q > 0 ? `Remove ${m.name} from this plan` : `Add ${m.name} to this plan`} selected={q > 0}>
                  <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: q > 0 ? c.primary : c.border, backgroundColor: q > 0 ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {q > 0 ? <Icon name="check" size={14} color="#fff" /> : null}
                  </View>
                </Press>
                <View style={{ flex: 1 }}>
                  <Text style={[type(14.5, 700), { color: c.ink }]}>{m.name}</Text>
                  <Text style={[type(12, 600), { color: c.muted, marginTop: 1 }]}>{money(m.priceCents / 100)}</Text>
                </View>
                {!choice && q > 0 ? <Stepper sm value={q} onDec={() => setQty((s) => ({ ...s, [m.id]: Math.max(0, q - 1) }))} onInc={() => setQty((s) => ({ ...s, [m.id]: Math.min(20, q + 1) }))} /> : null}
              </View>
            );
          })}
        </View>

        <Press scale={0.99} onPress={() => setAdvanced((a) => !a)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 18, paddingVertical: 13, borderTopWidth: 1, borderTopColor: c.border2 }}>
            <Icon name="sliders" size={17} color={c.soft} />
            <Text style={[type(14, 800), { color: c.ink, flex: 1 }]}>Advanced options</Text>
            {!advanced ? <Text numberOfLines={1} style={[type(12, 600), { color: c.muted, maxWidth: 150 }]}>{advancedSummary}</Text> : null}
            <Icon name={advanced ? 'chevDown' : 'chevRight'} size={16} color={c.muted} />
          </View>
        </Press>
        {advanced ? (
          <View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><KField label="Order cutoff (hrs)"><KInput value={cutoff} onChange={(v) => setCutoff(digitsOnly(v))} placeholder="0 to 336" maxLength={3} /></KField></View>
              <View style={{ flex: 1 }}><KField label="Lead time (hrs)"><KInput value={lead} onChange={(v) => setLead(digitsOnly(v))} placeholder="0 to 336" maxLength={3} /></KField></View>
            </View>
            <KField label="Minimum commitment (weeks)"><KInput value={minCommit} onChange={(v) => setMinCommit(digitsOnly(v))} placeholder="1 to 52" maxLength={2} /></KField>
            <KField label="Cadence">
              <KSeg options={[{ key: '1', label: 'Weekly' }, { key: '2', label: 'Biweekly' }]} value={String(cadenceWeeks)} onChange={(v) => setCadenceWeeks(parseInt(v) as 1 | 2)} />
              <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6, lineHeight: 16 }]}>
                Customers are charged and receive meals every {cadenceWeeks === 1 ? 'week' : 'two weeks'}.
              </Text>
            </KField>
            <KField label="Rotating Menu">
              <KSeg options={[{ key: 'fixed', label: 'Fixed meals' }, { key: 'rotating', label: 'Meals rotate weekly' }]} value={rotating ? 'rotating' : 'fixed'} onChange={(v) => { const on = v === 'rotating'; setRotating(on); if (on && rotationWeeks < 2) setRotationWeeks(2); }} />
              <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6, lineHeight: 16 }]}>
                Fixed: same meals every week. Rotating: new meals each week.
              </Text>
            </KField>
            <KField label="Intro trial">
              <KSeg options={[{ key: 'off', label: 'No trial' }, { key: 'on', label: 'Offer a trial' }]} value={trialOn ? 'on' : 'off'} onChange={(v) => setTrialOn(v === 'on')} />
              <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6, lineHeight: 16 }]}>A discounted (or free) first weeks to win subscribers — then the normal price kicks in.</Text>
            </KField>
            {trialOn ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}><KField label="Trial price / week"><MoneyInput value={trialPrice} onChange={setTrialPrice} /></KField></View>
                <View style={{ flex: 1 }}><KField label="Trial weeks"><KInput value={trialWeeks} onChange={(v) => setTrialWeeks(digitsOnly(v))} placeholder="1 to 12" maxLength={2} /></KField></View>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={{ marginTop: 20, backgroundColor: c.primaryL, borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <Icon name="spark" size={19} color={c.primary} />
          <Text style={[type(12.5, 600), { color: c.primaryD, lineHeight: 19, flex: 1 }]}>Customers are billed weekly and can pause or cancel anytime. Your payout lands net of the Stripe fee — cash out from Earnings.</Text>
        </View>
      </ScrollView>
      <Dock>
        <DockTotal label={choice ? 'Per meal' : 'Per week'} value={money((choice ? perMealCents : priceCents) / 100)} />
        {existingStatus !== 'active' ? (
          <KBtn label={busy && savingDraft ? 'Saving…' : 'Save draft'} variant="ghost" height={48} onPress={() => submit(true)} disabled={!valid || busy} />
        ) : null}
        <KBtn label={busy && !savingDraft ? 'Publishing…' : existingStatus === 'active' ? 'Save changes' : 'Publish plan'} variant="pri" flex={1} height={48} onPress={() => submit(false)} disabled={!valid || busy} />
      </Dock>
    </Screen>
  );
}

/** Toggleable tag chips (dietary / allergens). `danger` tints selected chips as a warning (allergens). */
function TagChips({ options, value, onToggle, danger }: { options: string[]; value: string[]; onToggle: (t: string) => void; danger?: boolean }) {
  const c = useC();
  const onBg = danger ? c.redL : c.primary;
  const onFg = danger ? c.red : '#fff';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {options.map((t) => {
        const on = value.includes(t);
        return (
          <Press key={t} scale={0.95} onPress={() => onToggle(t)} label={t} selected={on}>
            <View style={{ height: 34, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: on ? onBg : c.bg2, borderWidth: 1, borderColor: on ? onBg : c.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(12.5, 800), { color: on ? onFg : c.soft }]}>{t}</Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}
