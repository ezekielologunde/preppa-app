import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Press, Btn, Icon } from '../src/ui';
import { Screen, TopBar, Dock, Block } from '../src/ui/layout';
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
    if (!dateValid) { setStage('details'); toast('Enter the date as YYYY-MM-DD', 'info'); return; }
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
              <Field c={c} label={isPlan ? 'Start date (YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'}><Input c={c} value={eventDate} onChange={setEventDate} placeholder="2026-08-15" /></Field>
              {isPlan ? null : (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}><Field c={c} label="Time (optional)"><Input c={c} value={eventTime} onChange={setEventTime} placeholder="18:30" /></Field></View>
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
              <Row c={c} k="Date" v={eventDate + (eventTime ? ` · ${eventTime}` : '')} />
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
    </Screen>
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
