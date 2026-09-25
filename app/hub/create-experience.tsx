import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
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
import { confirmAction } from '../../src/lib/confirm';

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
const MAX_EXPERIENCE_PRICE_CENTS = 500_000;

function cents(value: string): number | null {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) return null;
  const result = Math.round(Number(value) * 100);
  return Number.isSafeInteger(result) ? result : null;
}
function boundedInt(value: string, min: number, max: number): number | null {
  const result = Number(value);
  return Number.isInteger(result) && result >= min && result <= max ? result : null;
}
function isHttpUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; } catch { return false; }
}

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
  const [loadError, setLoadError] = useState('');

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [etype, setEtype] = useState<ExperienceType>('class');
  const [photos, setPhotos] = useState<string[]>([]);  // first = cover
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInFlight = useRef(false);
  const [address, setAddress] = useState('');
  const [locationType, setLocationType] = useState<'prepper_place' | 'venue' | 'virtual'>('prepper_place');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [duration, setDuration] = useState('');
  const [minG, setMinG] = useState('1');
  const [maxG, setMaxG] = useState('8');
  const [priceModel, setPriceModel] = useState<'per_person' | 'flat'>('per_person');
  const [price, setPrice] = useState('');
  const [included, setIncluded] = useState<string[]>([]);
  const [requirements, setRequirements] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [policy, setPolicy] = useState<'flexible' | 'standard' | 'strict'>('standard');
  const [sessions, setSessions] = useState<SessRow[]>([]);
  const [repeatN, setRepeatN] = useState('4');
  const [status, setStatus] = useState<string>('draft');
  const [busy, setBusy] = useState(false);
  const mutationInFlight = useRef(false);
  const loadSequence = useRef(0);
  const mounted = useRef(true);
  const [done, setDone] = useState<{ status: string } | null>(null);

  const load = async () => {
    const request = ++loadSequence.current;
    setLoading(true);
    setLoadError('');
    try {
      if (editing) {
        const e = await fetchExperience(experienceId!);
        if (!mounted.current || request !== loadSequence.current) return;
        if (!e) throw new Error('This experience is no longer available.');
        {
          setTitle(e.title); setDesc(e.description ?? ''); setEtype(e.experienceType);
          setPhotos(e.photoUrls && e.photoUrls.length ? e.photoUrls : (e.coverUrl ? [e.coverUrl] : []));
          setAddress(e.addressText ?? ''); setDuration(String(e.durationMin)); setMinG(String(e.minGuests)); setMaxG(String(e.maxGuests));
          setLocationType(e.locationType === 'venue' || e.locationType === 'virtual' ? e.locationType : 'prepper_place'); setMeetingUrl(e.meetingUrl ?? '');
          setPriceModel(e.priceModel === 'flat' ? 'flat' : 'per_person');
          setPrice(((e.priceModel === 'flat' ? e.priceCents : e.perPersonCents) || 0) ? String(((e.priceModel === 'flat' ? e.priceCents : e.perPersonCents) as number) / 100) : '');
          setIncluded(e.whatsIncluded); setRequirements(e.requirements ?? '');
          setDietary(e.dietaryTags); setAllergens(e.allergens); setPolicy((e.cancellationPolicy as any) || 'standard'); setStatus(e.status);
          setSessions(e.sessions.filter((s) => s.status !== 'cancelled').map((s) => ({ id: s.id, ...splitISO(s.startsAt), seats: String(s.capacity), seatsTaken: s.seatsTaken, status: s.status })));
        }
      }
    } catch (e: any) {
      if (mounted.current && request === loadSequence.current) setLoadError('Check your connection and try again. Your experience has not changed.');
    } finally {
      if (mounted.current && request === loadSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; loadSequence.current += 1; };
  }, []);

  const uploadPhotos = async (items: Array<{ blob: Blob; ext: string }>) => {
    if (!items.length || photoInFlight.current) return;
    photoInFlight.current = true;
    setPhotoBusy(true);
    let failed = 0;
    for (const item of items) {
      try {
        const url = await uploadPlanCover(item.blob, item.ext);
        if (mounted.current) setPhotos((current) => (current.length >= 6 ? current : [...current, url]));
      } catch { failed += 1; }
    }
    photoInFlight.current = false;
    if (mounted.current) setPhotoBusy(false);
    if (failed) toast(failed === items.length ? 'Could not upload those photos. Please try again.' : `${failed} photo${failed === 1 ? '' : 's'} could not be uploaded.`, 'info');
  };
  const pickPhotos = async () => {
    if (photoInFlight.current || photos.length >= 6) return;
    const slots = 6 - photos.length;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
      input.onchange = () => {
        const files = Array.from(input.files || []).slice(0, slots);
        void uploadPhotos(files.map((file) => ({ blob: file, ext: (file.name.split('.').pop() || 'jpg').toLowerCase() })));
      };
      input.click();
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast('Photo library access is off. Enable it in Settings to add experience photos.', 'info');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: slots, quality: 0.85 });
      if (result.canceled || !result.assets.length) return;
      const items = await Promise.all(result.assets.slice(0, slots).map(async (asset) => {
        const response = await fetch(asset.uri);
        if (!response.ok) throw new Error('PHOTO_READ_FAILED');
        return { blob: await response.blob(), ext: (asset.uri.split('.').pop() || 'jpg').toLowerCase() };
      }));
      await uploadPhotos(items);
    } catch {
      toast('Could not open those photos. Please try again.', 'info');
    }
  };

  const parsedPriceCents = cents(price);
  const perPersonCents = parsedPriceCents ?? 0;
  const minGuests = boundedInt(minG, 1, 200);
  const maxGuests = boundedInt(maxG, 1, 200);
  const durationMin = duration.trim() ? boundedInt(duration, 15, 1440) : null;
  const validSessions = sessions.filter((s) => toISO(s.date, s.time) && boundedInt(s.seats, 1, 200) != null);
  const fieldsValid = title.trim().length >= 2 && title.trim().length <= 120 && desc.trim().length <= 4000
    && requirements.trim().length <= 2000 && address.trim().length <= 300 && meetingUrl.trim().length <= 600
    && (!price.trim() || (parsedPriceCents != null && perPersonCents <= MAX_EXPERIENCE_PRICE_CENTS))
    && minGuests != null && maxGuests != null && maxGuests >= minGuests && (!duration.trim() || durationMin != null)
    && sessions.length <= 60 && validSessions.length === sessions.length;
  const canSubmit = fieldsValid && parsedPriceCents != null && perPersonCents >= 100 && validSessions.length > 0
    && (locationType !== 'virtual' || isHttpUrl(meetingUrl.trim()));

  const addSession = () => setSessions((s) => [...s, { date: '', time: '18:00', seats: maxG || '8', seatsTaken: 0, status: 'open' }]);
  const setSess = (i: number, patch: Partial<SessRow>) => setSessions((s) => s.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeSess = (i: number) => setSessions((s) => s.filter((_, j) => j !== i));
  const repeatWeekly = () => {
    const base = sessions.find((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date));
    if (!base) { toast('Add a first session date, then repeat it', 'info'); return; }
    const n = Math.min(8, Math.max(2, parseInt(repeatN, 10) || 4));
    const seen = new Set(sessions.map((s) => `${s.date} ${s.time}`));
    const add: SessRow[] = [];
    for (let k = 1; k < n; k++) {
      const d = new Date(base.date + 'T00:00:00'); d.setDate(d.getDate() + k * 7); // date-only math (DST-safe)
      const p = (x: number) => String(x).padStart(2, '0');
      const date = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      const key = `${date} ${base.time}`;
      if (seen.has(key)) continue;
      seen.add(key);
      add.push({ date, time: base.time, seats: base.seats, seatsTaken: 0, status: 'open' });
    }
    if (add.length === 0) { toast('Those weeks are already scheduled', 'info'); return; }
    setSessions((s) => [...s, ...add]);
    toast(`Added ${add.length} weekly session${add.length !== 1 ? 's' : ''}`, 'check', true);
  };
  const cancelBooked = async (i: number, s: SessRow) => {
    if (!s.id) { removeSess(i); return; }
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    try { const r = await cancelExperienceSession(s.id); toast(`Session cancelled — ${r.refunded} booking${r.refunded !== 1 ? 's' : ''} refunded`, 'check', true); removeSess(i); }
    catch (e: any) { toast(e?.message || 'Could not cancel the session', 'info'); }
    finally { mutationInFlight.current = false; setBusy(false); }
  };
  const requestCancelBooked = (i: number, s: SessRow) => {
    if (!s.id) { removeSess(i); return; }
    if (mutationInFlight.current) return;
    confirmAction(
      'Cancel this session?',
      `All ${s.seatsTaken} booked guest${s.seatsTaken === 1 ? '' : 's'} must be fully refunded before cancellation completes.`,
      () => void cancelBooked(i, s),
      'Cancel and refund',
    );
  };

  const save = async (submit: boolean) => {
    if (mutationInFlight.current) return;
    if (!fieldsValid) {
      toast(title.trim().length < 2 ? 'Use at least 2 characters for the title' : title.trim().length > 120 ? 'Keep the title to 120 characters' : desc.trim().length > 4000 ? 'Keep the description to 4,000 characters' : requirements.trim().length > 2000 ? 'Keep requirements to 2,000 characters' : price.trim() && parsedPriceCents == null ? 'Enter a valid price with no more than two decimal places' : perPersonCents > MAX_EXPERIENCE_PRICE_CENTS ? 'Keep the price at $5,000 or less' : sessions.length > 60 ? 'Keep the schedule to 60 sessions' : 'Check duration, guest limits, and session capacity', 'info');
      return;
    }
    if (submit && !canSubmit) {
      toast(!title.trim() ? 'Add a title' : perPersonCents < 100 ? 'Set a price per person (at least $1)' : validSessions.length === 0 ? 'Add at least one session' : (locationType === 'virtual' && !meetingUrl.trim()) ? 'Add a meeting link for the online session' : 'Check your guest limits', 'info');
      return;
    }
    mutationInFlight.current = true;
    setBusy(true);
    try {
      const sess = sessions
        .map((s) => { const iso = toISO(s.date, s.time); return iso ? { id: s.id, startsAt: iso, capacity: Math.max(1, parseInt(s.seats, 10) || 1) } : null; })
        .filter(Boolean) as { id?: string; startsAt: string; capacity: number }[];
      const res = await upsertExperience({
        experienceId: editing ? experienceId : undefined,
        title: title.trim(), description: desc.trim() || undefined, experienceType: etype,
        coverUrl: photos[0] || undefined, photoUrls: photos.length ? photos : undefined,
        locationType,
        addressText: locationType !== 'virtual' ? (address.trim() || undefined) : undefined,
        meetingUrl: locationType === 'virtual' ? (meetingUrl.trim() || undefined) : undefined,
        durationMin: durationMin ?? undefined,
        minGuests: minGuests!, maxGuests: maxGuests!,
        priceModel,
        ...(priceModel === 'flat' ? { priceCents: perPersonCents } : { perPersonCents }),
        whatsIncluded: included.length ? included : undefined, requirements: requirements.trim() || undefined,
        dietaryTags: dietary.length ? dietary : undefined, allergens: allergens.length ? allergens : undefined,
        cancellationPolicy: policy, submit, sessions: sess,
      });
      setDone({ status: res.status });
    } catch (e: any) {
      toast(e?.message || 'Could not save the experience', 'info');
    } finally { mutationInFlight.current = false; setBusy(false); }
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
  if (loadError) {
    return <Screen bg={c.surface}><TopBar title={editing ? 'Edit experience' : 'Create an experience'} onBack={() => router.back()} /><View accessibilityRole="alert" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}><Text style={[type(16, 900), { color: c.ink, textAlign: 'center' }]}>Experience couldn’t load</Text><Text style={[type(13.5, 600), { color: c.soft, textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 16 }]}>{loadError}</Text><KBtn label="Try again" variant="pri" onPress={load} /></View></Screen>;
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title={editing ? 'Edit experience' : 'Create an experience'} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 16 }} />
        <KField label="Photos" hint="First is your cover · up to 6">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {photos.map((url, i) => (
              <View key={url + i} style={{ width: 96, height: 96, borderRadius: 12, overflow: 'hidden', backgroundColor: c.bg2 }}>
                <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                {i === 0 ? <View style={{ position: 'absolute', top: 4, left: 4, backgroundColor: 'rgba(0,0,0,.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><Text style={[type(9, 900), { color: '#fff', letterSpacing: 0.3 }]}>COVER</Text></View> : null}
                <Press scale={0.9} onPress={() => setPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4 }} label="Remove photo">
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={12} color="#fff" /></View>
                </Press>
                {i !== 0 ? (
                  <Press scale={0.95} onPress={() => setPhotos((p) => [p[i], ...p.filter((_, j) => j !== i)])} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} label="Make cover">
                    <View style={{ backgroundColor: 'rgba(0,0,0,.55)', paddingVertical: 3, alignItems: 'center' }}><Text style={[type(9.5, 800), { color: '#fff' }]}>Make cover</Text></View>
                  </Press>
                ) : null}
              </View>
            ))}
            {photos.length < 6 ? (
              <Press scale={0.97} onPress={pickPhotos} disabled={photoBusy} label="Add experience photos">
                <View style={{ width: 96, height: 96, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: c.border, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  {photoBusy ? <ActivityIndicator color={c.primary} /> : <><Icon name="camera" size={20} color={c.muted} /><Text style={[type(10.5, 700), { color: c.soft }]}>Add</Text></>}
                </View>
              </Press>
            ) : null}
          </View>
        </KField>
        <KField label="Title"><KInput value={title} onChange={setTitle} placeholder="e.g. Hands-on Pasta Night" maxLength={120} /></KField>
        <KField label="Description"><KInput value={desc} onChange={setDesc} placeholder="What you'll cook and eat together…" multiline maxLength={4000} /></KField>

        <KField label="Format"><KSeg options={TYPES} value={etype} onChange={(v) => setEtype(v as ExperienceType)} /></KField>

        <KField label="Pricing">
          <KSeg options={[{ key: 'per_person', label: 'Per person' }, { key: 'flat', label: 'Whole session' }]} value={priceModel} onChange={(v) => setPriceModel(v as any)} />
          {priceModel === 'flat' ? <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6, lineHeight: 16 }]}>One party books the entire session for a flat price (private buyout).</Text> : null}
        </KField>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><KField label={priceModel === 'flat' ? 'Price (whole session)' : 'Price per person'}><MoneyInput value={price} onChange={setPrice} /></KField></View>
          <View style={{ flex: 1 }}><KField label="Duration (min)"><KInput value={duration} onChange={(v) => setDuration(v.replace(/\D/g, ''))} placeholder="15 to 1440" maxLength={4} /></KField></View>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><KField label="Min guests"><KInput value={minG} onChange={(v) => setMinG(v.replace(/\D/g, ''))} placeholder="1 to 200" maxLength={3} /></KField></View>
          <View style={{ flex: 1 }}><KField label="Max guests"><KInput value={maxG} onChange={(v) => setMaxG(v.replace(/\D/g, ''))} placeholder="1 to 200" maxLength={3} /></KField></View>
        </View>

        <KField label="Location">
          <KSeg options={[{ key: 'prepper_place', label: "Host's kitchen" }, { key: 'venue', label: 'Venue' }, { key: 'virtual', label: 'Online' }]} value={locationType} onChange={(v) => setLocationType(v as any)} />
        </KField>
        {locationType === 'prepper_place' ? <KField label="Neighborhood (optional)"><KInput value={address} onChange={setAddress} placeholder="Shown to guests after they book" maxLength={300} /></KField> : null}
        {locationType === 'venue' ? <KField label="Venue"><KInput value={address} onChange={setAddress} placeholder="Venue name / address" maxLength={300} /></KField> : null}
        {locationType === 'virtual' ? <KField label="Meeting link" hint="Sent to guests after they book — keep it private"><KInput value={meetingUrl} onChange={setMeetingUrl} placeholder="https://…" maxLength={600} /></KField> : null}

        <KField label="What's included"><Chips options={INCLUDED} value={included} onToggle={(t) => setIncluded((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])} /></KField>
        <KField label="Good to know / requirements"><KInput value={requirements} onChange={setRequirements} placeholder="Skill level, what to bring, accessibility…" multiline maxLength={2000} /></KField>
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
        {sessions.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <Text style={[type(12.5, 700), { color: c.soft }]}>Repeat weekly for</Text>
            <View style={{ width: 52 }}><KInput value={repeatN} onChange={(v) => setRepeatN(v.replace(/\D/g, ''))} placeholder="4" accessibilityLabel="Number of weekly sessions" maxLength={1} /></View>
            <Text style={[type(12.5, 700), { color: c.soft }]}>weeks</Text>
            <Press scale={0.96} onPress={repeatWeekly}>
              <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Text style={[type(12.5, 800), { color: c.primaryD }]}>Add weeks</Text></View>
            </Press>
          </View>
        ) : null}
        <View style={{ gap: 10 }}>
          {sessions.map((s, i) => {
            const locked = (s.seatsTaken ?? 0) > 0;
            return (
              <View key={i} style={{ backgroundColor: c.bg2, borderRadius: 14, padding: 12, gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1.4 }}><KInput value={s.date} onChange={(v) => setSess(i, { date: v })} placeholder="YYYY-MM-DD" accessibilityLabel={`Session ${i + 1} date`} /></View>
              <View style={{ flex: 1 }}><KInput value={s.time} onChange={(v) => setSess(i, { time: v })} placeholder="18:00" accessibilityLabel={`Session ${i + 1} time`} /></View>
               <View style={{ width: 74 }}><KInput value={s.seats} onChange={(v) => setSess(i, { seats: v.replace(/\D/g, '') })} placeholder="Seats" accessibilityLabel={`Session ${i + 1} seats`} maxLength={3} /></View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={[type(11.5, 700), { color: locked ? c.primary : c.muted }]}>{locked ? `${s.seatsTaken} of ${s.seats} booked` : 'No bookings yet'}</Text>
                  {locked ? (
                    <Press scale={0.95} disabled={busy} onPress={() => requestCancelBooked(i, s)} label="Cancel session"><Text style={[type(12, 800), { color: busy ? c.muted : c.red }]}>Cancel session</Text></Press>
                  ) : (
                    <Press scale={0.95} onPress={() => removeSess(i)} label="Remove session"><View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="x" size={13} color={c.red} /><Text style={[type(12, 800), { color: c.red }]}>Remove</Text></View></Press>
                  )}
                </View>
              </View>
            );
          })}
          <Press scale={0.98} onPress={addSession} disabled={sessions.length >= 60} label="Add session">
            <View style={{ height: 46, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.border, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 }}>
              <Icon name="plus" size={16} color={c.primary} /><Text style={[type(13.5, 800), { color: c.accentText }]}>Add session</Text>
            </View>
          </Press>
        </View>

        <View style={{ marginTop: 20, backgroundColor: c.primaryL, borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <Icon name="spark" size={19} color={c.primary} />
          <Text style={[type(12.5, 600), { color: c.primaryD, lineHeight: 19, flex: 1 }]}>New experiences are reviewed before they go live. Customers pay in full when they book; your payout (85%, net of the Stripe fee) lands in Earnings.</Text>
        </View>

        {editing || status === 'draft' ? (
          <Press scale={0.98} onPress={() => save(false)} disabled={busy || !fieldsValid} style={{ marginTop: 14, opacity: busy || !fieldsValid ? 0.5 : 1 }} label="Save as draft">
            <View style={{ height: 46, borderRadius: 12, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Text style={[type(14, 800), { color: c.ink2 }]}>Save as draft</Text></View>
          </Press>
        ) : null}
      </ScrollView>
      <Dock>
        <DockTotal label="Per person" value={money(perPersonCents / 100)} />
        <KBtn label={busy ? 'Saving…' : editing && status === 'published' ? 'Save changes' : 'Submit for review'} variant="pri" flex={1} height={48} onPress={() => save(true)} disabled={!canSubmit || busy} />
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
