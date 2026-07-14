import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Press, Btn, Icon } from '../src/ui';
import { Screen, TopBar, Dock, Block } from '../src/ui/layout';
import { Sheet } from '../src/ui/overlay';
import { Burst } from '../src/components/shared';
import {
  createServiceRequest, editServiceRequest, fetchServiceRequest,
  SERVICE_LABELS, type ServiceCategory,
} from '../src/lib/services';

const CATS: ServiceCategory[] = ['meal_plan', 'cook_at_home', 'private_dinner', 'catering', 'consultation', 'class'];
const CAT_SUB: Record<ServiceCategory, string> = {
  cook_at_home: 'A prepper cooks in your kitchen',
  private_dinner: 'A hosted dinner for your table',
  catering: 'Food for your event or party',
  consultation: 'Plan your week with a pro',
  class: 'Learn a dish, hands-on',
  meal_plan: 'A cook designs your weekly plan',
};

type Q = { key: string; label: string; type: 'chips' | 'text'; options?: string[]; multi?: boolean; placeholder?: string };
const CUISINE = ['Nigerian', 'Italian', 'Mexican', 'Asian', 'Mediterranean', 'American', 'Indian', 'Caribbean', 'Surprise me'];
const DIET = ['No restrictions', 'Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Dairy-free', 'Nut-free', 'Low-carb'];
const COURSES = ['1', '2', '3', '4+'];

/** The "what do you really need" drill-down, per category. */
const DRILL: Record<ServiceCategory, Q[]> = {
  cook_at_home: [
    { key: 'cuisine', label: 'What cuisine?', type: 'chips', options: CUISINE, multi: true },
    { key: 'dietary', label: 'Any dietary needs?', type: 'chips', options: DIET, multi: true },
    { key: 'occasion', label: "What's the occasion?", type: 'chips', options: ['Weeknight dinner', 'Date night', 'Birthday', 'Family gathering', 'Weekly meal prep', 'Other'] },
    { key: 'courses', label: 'How many courses?', type: 'chips', options: COURSES },
  ],
  private_dinner: [
    { key: 'cuisine', label: 'What cuisine?', type: 'chips', options: CUISINE, multi: true },
    { key: 'dietary', label: 'Any dietary needs?', type: 'chips', options: DIET, multi: true },
    { key: 'occasion', label: "What's the occasion?", type: 'chips', options: ['Date night', 'Anniversary', 'Birthday', 'Celebration', 'Business dinner', 'Other'] },
    { key: 'courses', label: 'How many courses?', type: 'chips', options: COURSES },
  ],
  catering: [
    { key: 'style', label: 'Service style', type: 'chips', options: ['Drop-off', 'Buffet setup', 'Staffed & served'] },
    { key: 'cuisine', label: 'What cuisine?', type: 'chips', options: CUISINE, multi: true },
    { key: 'dietary', label: 'Any dietary needs?', type: 'chips', options: DIET, multi: true },
  ],
  consultation: [
    { key: 'goal', label: "What's your goal?", type: 'chips', options: ['Lose weight', 'Build muscle', 'Eat healthier', 'Save time', 'Manage a condition', 'Learn to cook'], multi: true },
    { key: 'diet', label: 'Diet style', type: 'chips', options: ['No preference', 'Vegetarian', 'Vegan', 'Keto', 'Mediterranean', 'High-protein'] },
    { key: 'focus', label: 'Focus areas', type: 'chips', options: ['Meal planning', 'Grocery & budget', 'Macros', 'Prep techniques'], multi: true },
  ],
  class: [
    { key: 'dish', label: 'What do you want to learn?', type: 'text', placeholder: 'e.g. jollof rice, fresh pasta, sushi' },
    { key: 'level', label: 'Your skill level', type: 'chips', options: ['Beginner', 'Some experience', 'Advanced'] },
    { key: 'format', label: 'Format', type: 'chips', options: ['Hands-on', 'Watch & learn'] },
  ],
  meal_plan: [
    { key: 'meals_per_week', label: 'How many meals per week?', type: 'chips', options: ['3', '5', '7', '10', '14'] },
    { key: 'servings', label: 'Servings per meal', type: 'chips', options: ['1', '2', '3', '4+'] },
    { key: 'dietary', label: 'Dietary style', type: 'chips', options: DIET, multi: true },
    { key: 'goal', label: 'Your goal', type: 'chips', options: ['Eat healthier', 'Save time', 'Lose weight', 'Build muscle', 'Family meals', 'Budget-friendly'], multi: true },
    { key: 'delivery_day', label: 'Preferred delivery day', type: 'chips', options: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
  ],
};

type Answers = Record<string, string | string[]>;
function answerText(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join(', ');
  return v ?? '';
}
/** Human-readable summary of the structured answers, for the details column + prepper. */
function buildDetails(cat: ServiceCategory, a: Answers, notes: string): string {
  const parts = DRILL[cat]
    .map((q) => { const t = answerText(a[q.key]); return t ? `${q.label} ${t}` : ''; })
    .filter(Boolean);
  if (notes.trim()) parts.push(notes.trim());
  return parts.join(' · ');
}

type Stage = 'category' | 'specifics' | 'details' | 'review';

export default function ServiceRequestScreen() {
  const c = useC();
  const router = useRouter();
  const { toast, location, coords } = useStore();
  const { category: catParam, edit } = useLocalSearchParams<{ category?: string; kitchen?: string; edit?: string }>();
  const editing = typeof edit === 'string' && edit.length > 0;

  const [stage, setStage] = useState<Stage>('category');
  const [category, setCategory] = useState<ServiceCategory>((CATS.includes(catParam as ServiceCategory) ? catParam : 'cook_at_home') as ServiceCategory);
  const [answers, setAnswers] = useState<Answers>({});
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [guests, setGuests] = useState('');
  const [address, setAddress] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [dateSheet, setDateSheet] = useState(false);
  const [timeSheet, setTimeSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ targets: number; edited: boolean } | null>(null);

  // edit mode: prefill from the existing request
  useEffect(() => {
    if (!editing) return;
    fetchServiceRequest(edit!).then((r) => {
      if (!r) { toast('Request not found', 'info'); return; }
      if (r.status !== 'open') { toast('This request already has quotes — it can no longer be edited.', 'info'); router.replace(`/request/${edit}`); return; }
      setCategory(r.category);
      setAnswers((r.answers as Answers) ?? {});
      setEventDate(r.eventDate ?? '');
      setEventTime(r.eventTime ?? '');
      setGuests(r.guests ? String(r.guests) : '');
      setAddress(r.addressText ?? '');
      setBudget(r.budgetCents ? String(r.budgetCents / 100) : '');
    });
  }, [editing]);

  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim());
  const isPlan = category === 'meal_plan';
  const qs = DRILL[category];
  const setAns = (key: string, val: string | string[]) => setAnswers((a) => ({ ...a, [key]: val }));
  const toggleMulti = (key: string, opt: string) => setAnswers((a) => {
    const cur = Array.isArray(a[key]) ? (a[key] as string[]) : [];
    return { ...a, [key]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
  });

  const submit = async () => {
    if (busy) return;
    if (!dateValid) { setStage('details'); toast('Choose a date', 'info'); return; }
    setBusy(true);
    const body = {
      category, eventDate: eventDate.trim(),
      eventTime: eventTime.trim() || undefined,
      guests: guests ? parseInt(guests) : undefined,
      address: address.trim() || undefined,
      approxArea: location || undefined,
      lat: coords?.lat, lng: coords?.lng,
      budgetCents: budget ? Math.round(Number(budget) * 100) : undefined,
      details: buildDetails(category, answers, notes) || undefined,
      answers,
    };
    try {
      if (editing) {
        const { newTargets } = await editServiceRequest(edit!, body);
        setDone({ targets: newTargets, edited: true });
      } else {
        const res = await createServiceRequest(body);
        setDone({ targets: res.targets, edited: false });
      }
    } catch (e: any) {
      toast(e?.message || 'Could not post your request', 'info');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title={done.edited ? 'Request updated' : done.targets > 0 ? 'Request sent!' : 'Request posted'}
          body={done.edited
            ? (done.targets > 0 ? `Saved. We also notified ${done.targets} more prepper${done.targets !== 1 ? 's' : ''} that now match.` : 'Your changes are saved.')
            : isPlan
              ? (done.targets > 0 ? `We sent your brief to ${done.targets} cook${done.targets !== 1 ? 's' : ''} nearby. They’ll design weekly plans for you — you’ll be notified to review and subscribe.` : 'No cooks offer plans nearby yet — we’ll notify you when one does.')
              : (done.targets > 0 ? `We sent it to ${done.targets} verified prepper${done.targets !== 1 ? 's' : ''} nearby. You’ll get quotes to review soon.` : 'No preppers offer this nearby yet — we’ll notify you when one does.')}
          actionLabel="View my requests"
          onAction={() => router.replace('/experiences')}
        />
      </Screen>
    );
  }

  const stageIdx = ['category', 'specifics', 'details', 'review'].indexOf(stage);
  const title = editing ? 'Edit request' : isPlan ? 'Request a meal plan' : 'Request a cook';
  const back = stage === 'category' ? () => router.back()
    : stage === 'specifics' ? () => setStage('category')
      : stage === 'details' ? () => setStage('specifics')
        : () => setStage('details');

  return (
    <Screen>
      <TopBar title={title} sub={`Step ${stageIdx + 1} of 4`} onBack={back} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}>
        {stage === 'category' ? (
          <Block title="What do you need?">
            <View style={{ gap: 10 }}>
              {CATS.map((k) => {
                const on = category === k;
                return (
                  <Press key={k} scale={0.98} onPress={() => setCategory(k)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[type(15, 800), { color: c.ink }]}>{SERVICE_LABELS[k]}</Text>
                        <Text style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>{CAT_SUB[k]}</Text>
                      </View>
                      {on ? <Icon name="check" size={18} color={c.primary} /> : null}
                    </View>
                  </Press>
                );
              })}
            </View>
          </Block>
        ) : null}

        {stage === 'specifics' ? (
          <Block title="Tell them what you want">
            <View style={{ gap: 18 }}>
              {qs.map((q) => (
                <View key={q.key}>
                  <Text style={[type(13, 800), { color: c.ink2, marginBottom: 9 }]}>{q.label}</Text>
                  {q.type === 'text' ? (
                    <Input c={c} value={(answers[q.key] as string) ?? ''} onChange={(t) => setAns(q.key, t)} placeholder={q.placeholder ?? ''} />
                  ) : (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {q.options!.map((opt) => {
                        const on = q.multi ? (Array.isArray(answers[q.key]) && (answers[q.key] as string[]).includes(opt)) : answers[q.key] === opt;
                        return (
                          <Press key={opt} scale={0.96} onPress={() => q.multi ? toggleMulti(q.key, opt) : setAns(q.key, opt)}>
                            <View style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={[type(13, 700), { color: on ? '#fff' : c.soft }]}>{opt}</Text>
                            </View>
                          </Press>
                        );
                      })}
                    </View>
                  )}
                </View>
              ))}
            </View>
          </Block>
        ) : null}

        {stage === 'details' ? (
          <Block title={isPlan ? 'When & where' : 'When & where'}>
            <View style={{ gap: 14 }}>
              <Field c={c} label={isPlan ? 'Start date' : 'Date'}><PickerButton c={c} icon="calendar" placeholder="Choose a date" value={eventDate ? formatDatePretty(eventDate) : ''} onPress={() => setDateSheet(true)} /></Field>
              {isPlan ? null : (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}><Field c={c} label="Time (optional)"><PickerButton c={c} icon="clock" placeholder="Any time" value={eventTime ? formatTimePretty(eventTime) : ''} onPress={() => setTimeSheet(true)} /></Field></View>
                  <View style={{ flex: 1 }}><Field c={c} label="Guests"><Input c={c} value={guests} onChange={setGuests} placeholder="6" keyboardType="number-pad" /></Field></View>
                </View>
              )}
              <Field c={c} label={isPlan ? 'Weekly budget ($, optional)' : 'Budget ($, optional)'}><Input c={c} value={budget} onChange={setBudget} placeholder={isPlan ? '120' : '300'} keyboardType="decimal-pad" /></Field>
              <Field c={c} label={isPlan ? 'Delivery address (private — shared only with the cook you subscribe to)' : 'Address (private — shared only with the prepper you book)'}><Input c={c} value={address} onChange={setAddress} placeholder={isPlan ? 'Where should meals be delivered?' : 'Where should they cook?'} /></Field>
              <Field c={c} label="Anything else? (optional)"><Input c={c} value={notes} onChange={setNotes} placeholder={isPlan ? 'Allergies, dislikes, favorite cuisines…' : 'Allergies, must-haves, parking…'} multiline /></Field>
            </View>
          </Block>
        ) : null}

        {stage === 'review' ? (
          <>
            <Block title="Review">
              <Row c={c} k="Service" v={SERVICE_LABELS[category]} />
              {qs.map((q) => { const t = answerText(answers[q.key]); return t ? <Row key={q.key} c={c} k={q.label.replace(/\?$/, '')} v={t} /> : null; })}
              <Row c={c} k="Date" v={formatDatePretty(eventDate) + (eventTime ? ` · ${formatTimePretty(eventTime)}` : '')} />
              {guests ? <Row c={c} k="Guests" v={guests} /> : null}
              {budget ? <Row c={c} k="Budget" v={`$${budget}`} /> : null}
              {notes.trim() ? <Row c={c} k="Notes" v={notes.trim()} /> : null}
            </Block>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16 }}>
              <Icon name="shield" size={15} color={c.green} />
              <Text style={[type(12, 600), { color: c.soft, flex: 1, lineHeight: 17 }]}>{isPlan ? 'Your exact address stays private until you subscribe. You can edit this brief until a cook responds.' : 'Your exact address stays private until you accept a quote. You can edit this request until a prepper quotes.'}</Text>
            </View>
          </>
        ) : null}
      </ScrollView>

      <Dock>
        {stage === 'category' ? (
          <Btn label="Continue" iconRight="arrow" block onPress={() => setStage('specifics')} />
        ) : stage === 'specifics' ? (
          <Btn label="Continue" iconRight="arrow" block onPress={() => setStage('details')} />
        ) : stage === 'details' ? (
          <Btn label="Review" iconRight="arrow" block disabled={!dateValid} onPress={() => setStage('review')} />
        ) : (
          <Btn label={busy ? (editing ? 'Saving…' : 'Posting…') : editing ? 'Save changes' : isPlan ? 'Request plans' : 'Get quotes'} icon="send" block loading={busy} onPress={submit} />
        )}
      </Dock>

      <CalendarSheet visible={dateSheet} onClose={() => setDateSheet(false)} value={eventDate} onSelect={setEventDate} />
      <TimeSheet visible={timeSheet} onClose={() => setTimeSheet(false)} value={eventTime} onSelect={setEventTime} />
    </Screen>
  );
}

// ---- date/time helpers (stored as 'YYYY-MM-DD' / 24h 'HH:MM' — same shape the API already expects) ----
function pad2(n: number) { return String(n).padStart(2, '0'); }
function toISODate(y: number, m: number, d: number) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function parseISODate(s: string): { y: number; m: number; d: number } | null {
  const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!mm) return null;
  return { y: +mm[1], m: +mm[2] - 1, d: +mm[3] };
}
function formatDatePretty(s: string): string {
  const p = parseISODate(s);
  if (!p) return '';
  return new Date(p.y, p.m, p.d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}
function formatTimePretty(hhmm: string): string {
  const mm = /^(\d{2}):(\d{2})$/.exec(hhmm.trim());
  if (!mm) return '';
  let h = +mm[1];
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${mm[2]} ${ap}`;
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 7; h <= 22; h++) { out.push(`${pad2(h)}:00`); if (h < 22) out.push(`${pad2(h)}:30`); }
  return out;
})();

/** Button that looks like the text inputs on this screen but opens a picker sheet instead of a keyboard. */
function PickerButton({ c, icon, value, placeholder, onPress }: { c: any; icon: string; value: string; placeholder: string; onPress: () => void }) {
  return (
    <Press scale={0.98} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 15, backgroundColor: c.bg2, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md }}>
        <Icon name={icon} size={17} color={value ? c.ink2 : c.muted} />
        <Text style={[type(15.5, 600), { color: value ? c.ink : c.muted, flex: 1 }]}>{value || placeholder}</Text>
        <Icon name="chevDown" size={14} color={c.muted} />
      </View>
    </Press>
  );
}

/** Calendar-grid date picker. Disables days before today — an event can't be scheduled in the past. */
function CalendarSheet({ visible, onClose, value, onSelect }: { visible: boolean; onClose: () => void; value: string; onSelect: (iso: string) => void }) {
  const c = useC();
  const today = new Date();
  const min = { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
  const [viewY, setViewY] = useState(min.y);
  const [viewM, setViewM] = useState(min.m);

  useEffect(() => {
    if (!visible) return;
    const p = parseISODate(value) ?? min;
    setViewY(p.y); setViewM(p.m);
  }, [visible]);

  const selected = parseISODate(value);
  const isBeforeMin = (y: number, m: number, d: number) => y < min.y || (y === min.y && m < min.m) || (y === min.y && m === min.m && d < min.d);
  const canGoPrev = viewY > min.y || viewM > min.m;
  const goPrev = () => { if (!canGoPrev) return; if (viewM === 0) { setViewY(viewY - 1); setViewM(11); } else setViewM(viewM - 1); };
  const goNext = () => { if (viewM === 11) { setViewY(viewY + 1); setViewM(0); } else setViewM(viewM + 1); };

  const dim = new Date(viewY, viewM + 1, 0).getDate();
  const lead = new Date(viewY, viewM, 1).getDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)];

  return (
    <Sheet visible={visible} onClose={onClose} title="Select a date">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 14 }}>
        <Press label="Previous month" disabled={!canGoPrev} onPress={goPrev} hitSlop={8}>
          <Icon name="chevLeft" size={20} color={canGoPrev ? c.ink : c.border} />
        </Press>
        <Text style={[type(15, 900), { color: c.ink }]}>{MONTH_NAMES[viewM]} {viewY}</Text>
        <Press label="Next month" onPress={goNext} hitSlop={8}>
          <Icon name="chevRight" size={20} color={c.ink} />
        </Press>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {DOW.map((d, i) => (
          <Text key={i} style={[type(11.5, 800), { color: c.muted, flex: 1, textAlign: 'center' }]}>{d}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <View key={i} style={{ width: `${100 / 7}%`, aspectRatio: 1 }} />;
          const disabled = isBeforeMin(viewY, viewM, d);
          const isSel = !!selected && selected.y === viewY && selected.m === viewM && selected.d === d;
          return (
            <Press key={i} disabled={disabled} label={`${MONTH_NAMES[viewM]} ${d}`} selected={isSel}
              onPress={() => { onSelect(toISODate(viewY, viewM, d)); onClose(); }}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? c.primary : 'transparent' }}>
                <Text style={[type(14, isSel ? 900 : 600), { color: disabled ? c.muted : isSel ? '#fff' : c.ink }]}>{d}</Text>
              </View>
            </Press>
          );
        })}
      </View>
    </Sheet>
  );
}

/** 30-minute time-slot picker. */
function TimeSheet({ visible, onClose, value, onSelect }: { visible: boolean; onClose: () => void; value: string; onSelect: (hhmm: string) => void }) {
  const c = useC();
  return (
    <Sheet visible={visible} onClose={onClose} title="Select a time" scroll>
      <Press scale={0.98} onPress={() => { onSelect(''); onClose(); }}>
        <View style={{ height: 46, borderRadius: radius.md, backgroundColor: !value ? c.primaryL : c.bg2, borderWidth: 1, borderColor: !value ? c.primary : c.border, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
          <Text style={[type(13.5, 800), { color: !value ? c.primaryD : c.soft }]}>Flexible / any time</Text>
        </View>
      </Press>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TIME_SLOTS.map((t) => {
          const on = t === value;
          return (
            <Press key={t} scale={0.96} onPress={() => { onSelect(t); onClose(); }} style={{ width: '31%' }}>
              <View style={{ height: 44, borderRadius: radius.md, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(13, 800), { color: on ? '#fff' : c.ink }]}>{formatTimePretty(t)}</Text>
              </View>
            </Press>
          );
        })}
      </View>
    </Sheet>
  );
}

function Row({ c, k, v }: { c: any; k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 6 }}>
      <Text style={[type(13, 600), { color: c.soft }]}>{k}</Text>
      <Text style={[type(13.5, 700), { color: c.ink, flex: 1, textAlign: 'right' }]}>{v}</Text>
    </View>
  );
}
function Field({ c, label, children }: { c: any; label: string; children: React.ReactNode }) {
  return <View><Text style={[type(12.5, 800), { color: c.soft, marginBottom: 8 }]}>{label}</Text>{children}</View>;
}
function Input({ c, value, onChange, placeholder, keyboardType, multiline }: { c: any; value: string; onChange: (t: string) => void; placeholder: string; keyboardType?: any; multiline?: boolean }) {
  const [f, setF] = useState(false);
  return (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted}
      keyboardType={keyboardType} multiline={multiline} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={[type(15.5, 600), { color: c.ink, backgroundColor: f ? c.surface : c.bg2, borderWidth: 1.5, borderColor: f ? c.primary : c.border, borderRadius: radius.md, minHeight: multiline ? 84 : 52, paddingHorizontal: 15, paddingTop: multiline ? 14 : 0 }]} />
  );
}
