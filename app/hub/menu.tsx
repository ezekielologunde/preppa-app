import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox, Btn } from '../../src/ui';
import { Sheet } from '../../src/ui/overlay';
import { money } from '../../src/data/data';
import { fetchMyMeals, updateMeal, setMealStatus, MyMealRow, RealMealStatus } from '../../src/lib/kitchenMeals';
import { HubHeader, KBtn, KSec, KPill } from '../(tabs)/my-hub';

function statusPill(c: any, s: RealMealStatus) {
  if (s === 'live') return { label: 'Live', bg: c.greenL, fg: '#0f7a39', dot: true };
  if (s === 'paused') return { label: 'Paused', bg: c.bg2, fg: c.muted };
  if (s === 'archived') return { label: 'Archived', bg: c.bg2, fg: c.muted };
  return { label: 'Sold out', bg: '#FEF3E2', fg: '#B45309' };
}

export default function MenuScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [meals, setMeals] = useState<MyMealRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MyMealRow | null>(null);

  const load = useCallback(() => {
    fetchMyMeals().then(setMeals).catch((e) => setError(e?.message || 'Could not load your menu.'));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const live = (meals ?? []).filter((m) => m.status === 'live').length;

  const cycleStatus = async (m: MyMealRow) => {
    const next: RealMealStatus = m.status === 'live' ? 'paused' : 'live';
    setBusyId(m.id);
    try {
      await setMealStatus(m.id, next);
      setMeals((ms) => (ms ?? []).map((x) => (x.id === m.id ? { ...x, status: next } : x)));
      toast(next === 'live' ? `${m.name} is live` : `${m.name} paused`, next === 'live' ? 'check' : 'pause', next === 'live');
    } catch (e: any) {
      toast(e?.message || 'Could not update this dish.', 'info');
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (m: MyMealRow) => {
    setBusyId(m.id);
    try {
      await setMealStatus(m.id, 'archived');
      setMeals((ms) => (ms ?? []).map((x) => (x.id === m.id ? { ...x, status: 'archived' } : x)));
      toast(`${m.name} archived`, 'x');
    } catch (e: any) {
      toast(e?.message || 'Could not archive this dish.', 'info');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader eyebrow="My Hub" name="My menu" onBack={() => router.back()} noAvail right={<KBtn label="Add meal" icon="plus" onPress={() => router.push('/hub/create-meal')} />} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        {meals === null && !error ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : error ? (
          <Text style={[type(13, 600), { color: c.red, paddingHorizontal: 20 }]}>{error}</Text>
        ) : meals!.length === 0 ? (
          <View style={{ paddingHorizontal: 20, paddingVertical: 30, alignItems: 'center' }}>
            <Text style={[type(15, 800), { color: c.ink }]}>No dishes yet</Text>
            <Text style={[type(13, 600), { color: c.soft, marginTop: 6, textAlign: 'center' }]}>Add your first meal to start taking orders.</Text>
          </View>
        ) : (
          <>
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
                      <Press scale={0.95} onPress={() => archive(m)} label={`Archive ${m.name}`}>
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
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (meal) { setName(meal.name); setPrice((meal.price_cents / 100).toFixed(2)); }
  }, [meal?.id]);

  if (!meal) return null;

  const save = async () => {
    const cents = Math.round(parseFloat(price || '0') * 100);
    if (name.trim().length < 2) { toast('Dish name is too short', 'info'); return; }
    if (!cents || cents <= 0) { toast('Enter a valid price', 'info'); return; }
    setBusy(true);
    try {
      await updateMeal(meal.id, { name: name.trim(), priceCents: cents });
      onSaved({ ...meal, name: name.trim(), price_cents: cents });
      toast('Saved', 'check', true);
    } catch (e: any) {
      toast(e?.message || 'Could not save changes.', 'info');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={!!meal} onClose={onClose} title="Edit dish">
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholderTextColor={c.muted}
        style={{ height: 50, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 14, color: c.ink, backgroundColor: c.bg2, marginBottom: 16, ...(type(15, 600) as object) }}
      />
      <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }]}>Price</Text>
      <TextInput
        value={price}
        onChangeText={(t) => setPrice(t.replace(/[^0-9.]/g, ''))}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={c.muted}
        style={{ height: 50, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingHorizontal: 14, color: c.ink, backgroundColor: c.bg2, marginBottom: 18, ...(type(15, 600) as object) }}
      />
      <Btn label="Save changes" loading={busy} disabled={busy} onPress={save} />
    </Sheet>
  );
}
