import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';
import { Screen, TopBar, Dock, DockTotal } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { money } from '../../src/data/data';
import { KField, KInput, MoneyInput, KSeg, KBtn } from '../(tabs)/my-hub';
import { uploadPlanCover } from '../../src/lib/supabase';
import { fetchExperience, upsertExperience, cancelExperienceSession, type ExperienceType } from '../../src/lib/experiences';

const TYPES: { key: ExperienceType; label: string }[] = [
  { key: 'class', label: 'Class' }, { key: 'supper_club', label: 'Supper club' },
  { key: 'tasting', label: 'Tasting' }, { key: 'workshop', label: 'Workshop' },
];
const INCLUDED = ['Ingredients', 'Equipment', 'Recipes', 'Drinks', 'Cleanup', 'Apron', 'Take-home box'];
const DIETARY = ['Vegetarian', 'Vegan', 'Halal', 'Gluten-free', 'Dairy-free', 'Pescatarian'];
const ALLERGENS = ['Nuts', 'Peanuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy', 'Fish', 'Sesame'];
const POLICIES: { key: 'flexible' | 'standard' | 'strict'; label: string; sub: string }[] = [
  { key: 'flexible', label: 'Flexible', sub: 'Free cancellation up to 24h before' },
  { key: 'standard', label: 'Standard', sub: 'Free cancellation up to 48h before' },
  { key: 'strict', label: 'Strict', sub: 'Non-refundable' },
];

interface SessRow { id?: string; date: string; time: string; seats: string; seatsTaken: number; status: string }
function toISO(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const d = new Date(`${date}T${time}:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function splitISO(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}

export default function CreateExperienceFlow() {
  const c = useC();
  const router = useRouter();
  const { experienceId } = useLocalSearchParams<{ experienceId?: string }>();
  const editing = typeof experienceId === 'string' && experienceId.length > 0;
  const { toast } = useStore();
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [etype, setEtype] = useState<ExperienceType>('class');
  const [cover, setCover] = useState('');
  const [coverBusy, setCoverBusy] = useState(false);
  const [address, setAddress] = useState('');
  const [duration, setDuration] = useState('');
  const [minG, setMinG] = useState('1');
  const [maxG, setMaxG] = useState('8');
  const [price, setPrice] = useState('');
  const [included, setIncluded] = useState<string[]>([]);
  const [requirements, setRequirements] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [policy, setPolicy] = useState<'flexible' | 'standard' | 'strict'>('standard');
  const [sessions, setSessions] = useState<SessRow[]>([]);
  const [status, setStatus] = useState<string>('draft');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ status: string } | null>(null);

  useEffect(() => {
    (async () => {
      if (editing) {
        const e = await fetchExperience(experienceId!);
        if (e) {
          setTitle(e.title); setDesc(e.description ?? ''); setEtype(e.experienceType); setCover(e.coverUrl ?? '');
          setAddress(e.addressText ?? ''); setDuration(String(e.durationMin)); setMinG(String(e.minGuests)); setMaxG(String(e.maxGuests));
          setPrice(e.perPersonCents ? String(e.perPersonCents / 100) : ''); setIncluded(e.whatsIncluded); setRequirements(e.requirements ?? '');
          setDietary(e.dietaryTags); setAllergens(e.allergens); setPolicy((e.cancellationPolicy as any) || 'standard'); setStatus(e.status);
          setSessions(e.sessions.filter((s) => s.status !== 'cancelled').map((s) => ({ id: s.id, ...splitISO(s.startsAt), seats: String(s.capacity), seatsTaken: s.seatsTaken, status: s.status })));
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

  const perPersonCents = Math.round((Number(price) || 0) * 100);
  const validSessions = sessions.filter((s) => toISO(s.date, s.time) && Number(s.seats) > 0);
  const canSubmit = !!title.trim() && perPersonCents >= 100 && Number(maxG) >= Number(minG) && validSessions.length > 0;

  const addSession = () => setSessions((s) => [...s, { date: '', time: '18:00', seats: maxG || '8', seatsTaken: 0, status: 'open' }]);
  const setSess = (i: number, patch: Partial<SessRow>) => setSessions((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeSess = (i: number) => setSessions((s) => s.filter((_, j) => j !== i));
  const cancelBooked = async (i: number, s: SessRow) => {
    if (!s.id) { removeSess(i); return; }
    if (typeof window !== 'undefined' && !window.confirm(`Cancel this session? All ${s.seatsTaken} booked guests will be fully refunded and notified.`)) return;
    try { const r = await cancelExperienceSession(s.id); toast(`Session cancelled — ${r.refunded} booking${r.refunded !== 1 ? 's' : ''} refunded`, 'check', true); removeSess(i); }
    catch (e: any) { toast(e?.message || 'Could not cancel the session', 'info'); }
  };

  const save = async (submit: boolean) => {
    if (busy) return;
    if (submit && !canSubmit) {
      toast(!title.trim() ? 'Add a title' : perPersonCents < 100 ? 'Set a price per person (at least $1)' : validSessions.length === 0 ? 'Add at least one session' : 'Check your guest limits', 'info');
      return;
    }
    if (!title.trim()) { toast('Add a title', 'info'); return; }
    setBusy(true);
    try {
      const sess = sessions
        .map((s) => { const iso = toISO(s.date, s.time); return iso ? { id: s.id, startsAt: iso, capacity: Math.max(1, parseInt(s.seats, 10) || 1) } : null; })
        .filter(Boolean) as { id?: string; startsAt: string; capacity: number }[];
      const res = await upsertExperience({
        experienceId: editing ? experienceId : undefined,
        title: title.trim(), description: desc.trim() || undefined, experienceType: etype,
        coverUrl: cover || undefined, locationType: 'prepper_place', addressText: address.trim() || undefined,
        durationMin: duration.trim() ? Math.max(15, parseInt(duration, 10) || 120) : undefined,
        minGuests: Math.max(1, parseInt(minG, 10) || 1), maxGuests: Math.max(1, parseInt(maxG, 10) || 8),
        priceModel: 'per_person', perPersonCents,
        whatsIncluded: included.length ? included : undefined, requirements: requirements.trim() || undefined,
        dietaryTags: dietary.length ? dietary : undefined, allergens: allergens.length ? allergens : undefined,
        cancellationPolicy: policy, submit, sessions: sess,
      });
      setDone({ status: res.status });
    } catch (e: any) {
      toast(e?.message || 'Could not save the experience', 'info');
    } finally { setBusy(false); }
  };

  if (done) {
    const pending = done.status === 'pending';
    return (
      <Screen bg={c.surface}>
        <Burst
          title={pending ? 'Submitted for review' : done.status === 'published' ? 'Experience updated' : 'Draft saved'}
          body={pending
            ? `${title} is in review — we’ll publish it once approved, then customers can book your sessions.`
            : done.status === 'published' ? `Your changes to ${title} are live.` : `${title} is saved as a draft. Submit it for review when you’re ready to go live.`}
          actionLabel="Back to experiences" onAction={() => router.replace('/hub/experiences')} />
      </Screen>
    );
  }
  if (loading) {
    return <Screen bg={c.surface}><TopBar title={editing ? 'Edit experience' : 'Create an experience'} onBack={() => router.back()} /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title={editing ? 'Edit experience' : 'Create an experience'} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 16 }} />
        <KField label="Cover photo">
          <Press scale={0.98} onPress={pickCover}>
            <View style={{ height: 150, borderRadius: radius.card, overflow: 'hidden', backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border2, alignItems: 'center', justifyContent: 'center' }}>
              {cover ? <Image source={{ uri: cover }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : coverBusy ? <ActivityIndicator color={c.primary} /> : (
                <View style={{ alignItems: 'center', gap: 6 }}><Icon name="camera" size={22} color={c.muted} /><Text style={[type(12.5, 700), { color: c.soft }]}>Add a cover photo</Text></View>
              )}
              {cover && !coverBusy ? <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}><Text style={[type(11, 800), { color: '#fff' }]}>Change</Text></View> : null}
            </View>
          </Press>
        </KField>
        <KField label="Title"><KInput value={title} onChange={setTitle} placeholder="e.g. Hands-on Pasta Night" /></KField>
        <KField label="Description"><KInput value={desc} onChange={setDesc} placeholder="What you'll cook and eat together…" multiline /></KField>

        <KField label="Format"><KSeg options={TYPES} value={etype} onChange={(v) => setEtype(v as ExperienceType)} /></KField>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><KField label="Price per person"><MoneyInput value={price} onChange={setPrice} /></KField></View>
          <View style={{ flex: 1 }}><KField label="Duration (min)"><KInput value={duration} onChange={setDuration} placeholder="120" /></KField></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><KField label="Min guests"><KInput value={minG} onChange={setMinG} placeholder="1" /></KField></View>
          <View style={{ flex: 1 }}><KField label="Max guests"><KInput value={maxG} onChange={setMaxG} placeholder="8" /></KField></View>
        </View>

        <KField label="Where" hint="Hosted at your kitchen"><KInput value={address} onChange={setAddress} placeholder="Neighborhood or address (shown after booking)" /></KField>

        <KField label="What's included"><Chips options={INCLUDED} value={included} onToggle={(t) => setIncluded((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} /></KField>
        <KField label="Good to know / requirements"><KInput value={requirements} onChange={setRequirements} placeholder="Skill level, what to bring, accessibility…" multiline /></KField>
        <KField label="Dietary options"><Chips options={DIETARY} value={dietary} onToggle={(t) => setDietary((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} /></KField>
        <KField label="Contains allergens"><Chips options={ALLERGENS} value={allergens} onToggle={(t) => setAllergens((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} danger /></KField>

        <KField label="Cancellation policy">
          <View style={{ gap: 8 }}>
            {POLICIES.map((p) => (
              <Press key={p.key} scale={0.98} onPress={() => setPolicy(p.key)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13, borderRadius: 12, backgroundColor: policy === p.key ? c.primaryL : c.bg2, borderWidth: 1.5, borderColor: policy === p.key ? c.primary : 'transparent' }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: policy === p.key ? c.primary : c.border, backgroundColor: policy === p.key ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{policy === p.key ? <Icon name="check" size={12} color="#fff" /> : null}</View>
                  <View style={{ flex: 1 }}><Text style={[type(14, 800), { color: c.ink }]}>{p.label}</Text><Text style={[type(12, 600), { color: c.soft, marginTop: 1 }]}>{p.sub}</Text></View>
                </View>
              </Press>
            ))}
          </View>
        </KField>

        {/* Sessions */}
        <Text style={[type(13, 800), { color: c.ink, marginTop: 22, marginBottom: 4 }]}>Sessions</Text>
        <Text style={[type(12, 600), { color: c.soft, marginBottom: 10, lineHeight: 17 }]}>Add the dates and times customers can book, with seats per session.</Text>
        <View style={{ gap: 10 }}>
          {sessions.map((s, i) => {
            const locked = (s.seatsTaken ?? 0) > 0;
            return (
              <View key={i} style={{ backgroundColor: c.bg2, borderRadius: 14, padding: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1.4 }}><KInput value={s.date} onChange={(v) => setSess(i, { date: v })} placeholder="YYYY-MM-DD" /></View>
                  <View style={{ flex: 1 }}><KInput value={s.time} onChange={(v) => setSess(i, { time: v })} placeholder="18:00" /></View>
                  <View style={{ width: 74 }}><KInput value={s.seats} onChange={(v) => setSess(i, { seats: v })} placeholder="Seats" /></View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[type(11.5, 700), { color: locked ? c.primary : c.muted }]}>{locked ? `${s.seatsTaken} of ${s.seats} booked` : 'No bookings yet'}</Text>
                  {locked ? (
                    <Press scale={0.95} onPress={() => cancelBooked(i, s)} label="Cancel session"><Text style={[type(12, 800), { color: c.red }]}>Cancel session</Text></Press>
                  ) : (
                    <Press scale={0.95} onPress={() => removeSess(i)} label="Remove session"><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="x" size={13} color={c.red} /><Text style={[type(12, 800), { color: c.red }]}>Remove</Text></View></Press>
                  )}
                </View>
              </View>
            );
          })}
          <Press scale={0.98} onPress={addSession}>
            <View style={{ height: 46, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
              <Icon name="plus" size={16} color={c.primary} /><Text style={[type(13.5, 800), { color: c.primary }]}>Add session</Text>
            </View>
          </Press>
        </View>

        <View style={{ marginTop: 20, backgroundColor: c.primaryL, borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <Icon name="spark" size={19} color={c.primary} />
          <Text style={[type(12.5, 600), { color: c.primaryD, lineHeight: 19, flex: 1 }]}>New experiences are reviewed before they go live. Customers pay in full when they book; your payout (85%, net of the Stripe fee) lands in Earnings.</Text>
        </View>

        {editing || status === 'draft' ? (
          <Press scale={0.98} onPress={() => save(false)} style={{ marginTop: 14 }}>
            <View style={{ height: 46, borderRadius: 12, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Text style={[type(14, 800), { color: c.ink2 }]}>Save as draft</Text></View>
          </Press>
        ) : null}
      </ScrollView>
      <Dock>
        <DockTotal label="Per person" value={money(perPersonCents / 100)} />
        <KBtn label={busy ? 'Saving…' : editing && status === 'published' ? 'Save changes' : 'Submit for review'} variant="pri" flex={1} height={48} onPress={() => save(true)} style={{ opacity: canSubmit && !busy ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}

function Chips({ options, value, onToggle, danger }: { options: string[]; value: string[]; onToggle: (t: string) => void; danger?: boolean }) {
  const c = useC();
  const onBg = danger ? c.redL : c.primary;
  const onFg = danger ? c.red : '#fff';
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {options.map((t) => {
        const on = value.includes(t);
        return (
          <Press key={t} scale={0.95} onPress={() => onToggle(t)}>
            <View style={{ height: 34, paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: on ? onBg : c.bg2, borderWidth: 1, borderColor: on ? onBg : c.border, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(12.5, 800), { color: on ? onFg : c.soft }]}>{t}</Text>
            </View>
          </Press>
        );
      })}
    </View>
  );
}
