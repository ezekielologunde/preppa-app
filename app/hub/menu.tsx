import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox, Btn } from '../../src/ui';
import { Sheet } from '../../src/ui/overlay';
import { money } from '../../src/data/data';
import { fetchMyMeals, updateMeal, setMealStatus, setMealDisclosure, MAJOR_ALLERGENS, MyMealRow, RealMealStatus } from '../../src/lib/kitchenMeals';
import { HubHeader, KBtn, KSec, KPill, KChoice } from '../(tabs)/my-hub';
import { confirmAction } from '../../src/lib/confirm';

function statusPill(c: any, s: RealMealStatus) {
  if (s === 'live') return { label: 'Live', bg: c.greenL, fg: c.green, dot: true };
  if (s === 'paused') return { label: 'Paused', bg: c.bg2, fg: c.muted };
  if (s === 'archived') return { label: 'Archived', bg: c.bg2, fg: c.muted };
  return { label: 'Sold out', bg: c.amberL, fg: c.amber };
}

export default function MenuScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [meals, setMeals] = useState<MyMealRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MyMealRow | null>(null);
  const loadSequence = useRef(0);
  const mealActionInFlight = useRef<string | null>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setError(null);
    try {
      const nextMeals = await fetchMyMeals();
      if (sequence === loadSequence.current) setMeals(nextMeals);
    } catch {
      if (sequence === loadSequence.current) setError('Check your connection and try loading your menu again.');
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]));

  const live = (meals ?? []).filter((m) => m.status === 'live').length;

  const cycleStatus = async (m: MyMealRow) => {
    if (mealActionInFlight.current) return;
    const next: RealMealStatus = m.status === 'live' ? 'paused' : 'live';
    mealActionInFlight.current = m.id;
    setBusyId(m.id);
    try {
      await setMealStatus(m.id, next);
      setMeals((ms) => (ms ?? []).map((x) => (x.id === m.id ? { ...x, status: next } : x)));
      toast(next === 'live' ? `${m.name} is live` : `${m.name} paused`, next === 'live' ? 'check' : 'pause', next === 'live');
    } catch (e: any) {
      toast(e?.message || 'Could not update this dish.', 'info');
    } finally {
      mealActionInFlight.current = null;
      setBusyId(null);
    }
  };

  const archive = async (m: MyMealRow) => {
    if (mealActionInFlight.current) return;
    mealActionInFlight.current = m.id;
    setBusyId(m.id);
    try {
      await setMealStatus(m.id, 'archived');
      setMeals((ms) => (ms ?? []).map((x) => (x.id === m.id ? { ...x, status: 'archived' } : x)));
      toast(`${m.name} archived`, 'x');
    } catch (e: any) {
      toast(e?.message || 'Could not archive this dish.', 'info');
    } finally {
      mealActionInFlight.current = null;
      setBusyId(null);
    }
  };
  const requestArchive = (m: MyMealRow) => {
    if (mealActionInFlight.current) return;
    confirmAction(
      `Archive ${m.name}?`,
      'Customers will no longer see or order this dish. Existing orders keep their saved item details.',
      () => void archive(m),
      'Archive dish',
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader eyebrow="My Hub" name="My menu" onBack={() => router.back()} noAvail right={<KBtn label="Add meal" icon="plus" onPress={() => router.push('/hub/create-meal')} />} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        {meals === null && !error ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : error && meals === null ? (
          <View accessibilityRole="alert" style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 }}>
            <Icon name="info" size={28} color={c.red} />
            <Text style={[type(16, 900), { color: c.ink, marginTop: 12 }]}>Menu couldn’t load</Text>
            <Text style={[type(13, 600), { color: c.soft, textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 16 }]}>{error}</Text>
            <Btn label="Try again" icon="repeat" onPress={load} />
          </View>
        ) : meals!.length === 0 && !error ? (
          <View style={{ paddingHorizontal: 20, paddingVertical: 30, alignItems: 'center' }}>
            <Text style={[type(15, 800), { color: c.ink }]}>No dishes yet</Text>
            <Text style={[type(13, 600), { color: c.soft, marginTop: 6, textAlign: 'center' }]}>Add your first meal to start taking orders.</Text>
          </View>
        ) : (
          <>
            {error ? (
              <View accessibilityRole="alert" style={{ marginHorizontal: 20, marginBottom: 14, borderWidth: 1, borderColor: c.red, backgroundColor: c.redL, borderRadius: radius.lg, padding: 14 }}>
                <Text style={[type(13.5, 900), { color: c.ink }]}>Couldn’t refresh your menu</Text>
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 4, lineHeight: 18 }]}>{error} Your current dishes are still shown.</Text>
                <View style={{ marginTop: 10, alignSelf: 'flex-start' }}><KBtn label="Try again" variant="ghost" icon="repeat" onPress={load} /></View>
              </View>
            ) : null}
            <Text style={[type(13, 600), { color: c.soft, paddingHorizontal: 20, paddingBottom: 8 }]}>{live} live · {meals!.length} total dishes</Text>
            {meals!.map((m) => {
              const p = statusPill(c, m.status);
              const busy = busyId === m.id;
              return (
                <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 16, padding: 13, marginHorizontal: 20, marginBottom: 10 }}>
                  <GradBox grad={m.grad} style={{ width: 50, height: 50, borderRadius: 13 }} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink, letterSpacing: -0.3 }]}>{m.name}</Text>
                    <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{money(m.price_cents / 100)} · serves {m.serves}</Text>
                    <View style={{ marginTop: 5 }}>
                      <KPill label={p.label} bg={p.bg} fg={p.fg} dot={p.dot} />
                    </View>
                  </View>
                  <View style={{ gap: 7, alignItems: 'flex-end' }}>
                    <KBtn label="Edit" variant="ghost" sm icon="edit" onPress={() => setEditing(m)} />
                    {m.status !== 'archived' ? (
                      <KBtn label={m.status === 'live' ? 'Pause' : 'Make live'} variant="ghost" sm onPress={() => cycleStatus(m)} />
                    ) : null}
                    {m.status !== 'archived' ? (
                      <Press scale={0.95} onPress={busyId ? undefined : () => requestArchive(m)} label={`Archive ${m.name}`}>
                        <Text style={[type(11.5, 700), { color: c.muted }]}>{busy ? '…' : 'Archive'}</Text>
                      </Press>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </>
        )}

        <KSec title="Meal plans" link="Manage" onLink={() => router.push('/hub/plans')} />
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={[type(13, 600), { color: c.soft, marginBottom: 10 }]}>Manage your weekly plans, subscribers, and rotation in one place.</Text>
          <KBtn label="Open meal plans" variant="ghost" block icon="repeat" onPress={() => router.push('/hub/plans')} />
        </View>
      </ScrollView>

      <EditMealSheet meal={editing} onClose={() => setEditing(null)} onSaved={(m) => { setMeals((ms) => (ms ?? []).map((x) => (x.id === m.id ? m : x))); setEditing(null); }} />
    </View>
  );
}

function EditMealSheet({ meal, onClose, onSaved }: { meal: MyMealRow | null; onClose: () => void; onSaved: (m: MyMealRow) => void }) {
  const c = useC();
  const { toast } = useStore();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (meal) {
      setName(meal.name); setPrice((meal.price_cents / 100).toFixed(2));
      setIngredients(meal.ingredients ?? ''); setAllergens(meal.allergens ?? []); setReviewed(!!meal.allergen_reviewed_at);
    }
  }, [meal?.id]);

  if (!meal) return null;

  const save = async () => {
    const cents = Math.round(parseFloat(price || '0') * 100);
    if (name.trim().length < 2) { toast('Dish name is too short', 'info'); return; }
    if (name.trim().length > 120) { toast('Keep the dish name to 120 characters', 'info'); return; }
    if (!Number.isSafeInteger(cents) || cents < 100 || cents > 100_000_000) { toast('Enter a price from $1 to $1,000,000', 'info'); return; }
    const hasDisclosure = !!meal.allergen_reviewed_at;
    const disclosureTouched = ingredients.trim() !== (meal.ingredients ?? '') || allergens.join() !== (meal.allergens ?? []).join() || (!hasDisclosure && reviewed);
    if (disclosureTouched && (ingredients.trim().length < 3 || ingredients.trim().length > 5000 || !reviewed)) {
      toast(ingredients.trim().length < 3 ? 'List the ingredients customers should know about' : ingredients.trim().length > 5000 ? 'Keep the ingredient list to 5,000 characters' : 'Confirm you reviewed the allergen disclosure', 'info');
      return;
    }
    setBusy(true);
    try {
      await updateMeal(meal.id, { name: name.trim(), priceCents: cents });
      let next: MyMealRow = { ...meal, name: name.trim(), price_cents: cents };
      if (disclosureTouched) {
        await setMealDisclosure(meal.id, { ingredients: ingredients.trim(), allergens, reviewed });
        next = { ...next, ingredients: ingredients.trim(), allergens, allergen_reviewed_at: new Date().toISOString() };
      }
      onSaved(next);
      toast('Saved', 'check', true);
    } catch (e: any) {
      toast(e?.message || 'Could not save changes.', 'info');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!meal} onClose={onClose} title="Edit dish" scroll>
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholderTextColor={c.muted}
        accessibilityLabel="Dish name"
        maxLength={120}
        style={{ height: 50, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 14, color: c.ink, backgroundColor: c.bg2, marginBottom: 16, ...(type(15, 600) as object) }}
      />
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Price</Text>
      <TextInput
        value={price}
        onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={c.muted}
        accessibilityLabel="Dish price"
        maxLength={12}
        style={{ height: 50, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 14, color: c.ink, backgroundColor: c.bg2, marginBottom: 18, ...(type(15, 600) as object) }}
      />
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Ingredients</Text>
      <TextInput
        value={ingredients}
        onChangeText={setIngredients}
        multiline
        placeholder="Chicken, rice, onion, garlic, olive oil, spices…"
        placeholderTextColor={c.muted}
        accessibilityLabel="Ingredients"
        maxLength={5000}
        style={{ minHeight: 84, textAlignVertical: 'top', borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 14, color: c.ink, backgroundColor: c.bg2, marginBottom: 16, ...(type(15, 600) as object) }}
      />
      <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'right', marginTop: -12, marginBottom: 16 }]} accessibilityLabel={`${ingredients.length} of 5000 ingredient characters used`}>{ingredients.length}/5000</Text>
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }]}>Contains allergens</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 16 }}>
        {MAJOR_ALLERGENS.map((x) => <KChoice key={x} label={x} on={allergens.includes(x)} onPress={() => setAllergens((a) => (a.includes(x) ? a.filter((y) => y !== x) : [...a, x]))} check />)}
      </View>
      <Press scale={0.98} onPress={() => setReviewed((v) => !v)} label="I reviewed the full recipe and disclosed every applicable major allergen">
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: radius.md, backgroundColor: c.bg2, borderWidth: 1, borderColor: reviewed ? c.primary : c.border, marginBottom: 18 }}>
          <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: reviewed ? c.primary : c.border, backgroundColor: reviewed ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{reviewed ? <Icon name="check" size={13} color="#fff" /> : null}</View>
          <Text style={[type(12.5, 700), { color: c.soft, lineHeight: 18, flex: 1 }]}>I reviewed the full recipe and disclosed every applicable major allergen.</Text>
        </View>
      </Press>
      <Btn label="Save changes" loading={busy} disabled={busy} onPress={save} />
    </Sheet>
  );
}
