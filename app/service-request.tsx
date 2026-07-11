import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Press, Btn, Icon } from '../src/ui';
import { Screen, TopBar, Dock } from '../src/ui/layout';
import { Burst } from '../src/components/shared';
import { createServiceRequest, SERVICE_LABELS, type ServiceCategory } from '../src/lib/services';

const CATS: ServiceCategory[] = ['cook_at_home', 'private_dinner', 'catering', 'consultation', 'class'];

export default function ServiceRequestScreen() {
  const c = useC();
  const router = useRouter();
  const { toast, location, coords } = useStore();
  const { category: catParam, kitchen } = useLocalSearchParams<{ category?: string; kitchen?: string }>();
  const [category, setCategory] = useState<ServiceCategory>((CATS.includes(catParam as ServiceCategory) ? catParam : 'cook_at_home') as ServiceCategory);
  const [eventDate, setEventDate] = useState('');
  const [guests, setGuests] = useState('');
  const [address, setAddress] = useState('');
  const [budget, setBudget] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ targets: number } | null>(null);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(eventDate.trim());

  const submit = async () => {
    if (busy) return;
    if (!valid) { toast('Enter the date as YYYY-MM-DD', 'info'); return; }
    setBusy(true);
    try {
      const res = await createServiceRequest({
        category, eventDate: eventDate.trim(),
        guests: guests ? parseInt(guests) : undefined,
        address: address.trim() || undefined,
        approxArea: location || undefined,
        lat: coords?.lat, lng: coords?.lng,
        budgetCents: budget ? Math.round(Number(budget) * 100) : undefined,
        details: details.trim() || undefined,
      });
      setDone({ targets: res.targets });
    } catch (e: any) {
      toast(e?.message || 'Could not post your request', 'info');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title={done.targets > 0 ? 'Request sent!' : 'Request posted'}
          body={done.targets > 0 ? `We sent it to ${done.targets} verified prepper${done.targets !== 1 ? 's' : ''} nearby. You’ll get quotes to review soon.` : 'No preppers offer this nearby yet — we’ll notify you when one does.'}
          actionLabel="View my requests"
          onAction={() => router.replace('/discover?mode=services')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Request a service" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 14 }}>
        <Field c={c} label="Service">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATS.map((k) => {
              const on = category === k;
              return (
                <Press key={k} scale={0.96} onPress={() => setCategory(k)}>
                  <View style={{ height: 40, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type(13, 700), { color: on ? '#fff' : c.soft }]}>{SERVICE_LABELS[k]}</Text>
                  </View>
                </Press>
              );
            })}
          </View>
        </Field>
        {kitchen ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.primaryL, borderRadius: radius.md, padding: 12 }}>
            <Icon name="chefhat" size={16} color={c.primary} />
            <Text style={[type(12.5, 700), { color: c.primaryD, flex: 1 }]}>Directed to this prepper. They’ll be notified to quote first.</Text>
          </View>
        ) : null}
        <Field c={c} label="Date (YYYY-MM-DD)"><Input c={c} value={eventDate} onChange={setEventDate} placeholder="2026-08-15" /></Field>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Field c={c} label="Guests"><Input c={c} value={guests} onChange={setGuests} placeholder="6" keyboardType="number-pad" /></Field></View>
          <View style={{ flex: 1 }}><Field c={c} label="Budget ($, optional)"><Input c={c} value={budget} onChange={setBudget} placeholder="300" keyboardType="decimal-pad" /></Field></View>
        </View>
        <Field c={c} label="Address (private — shared only with the prepper you book)"><Input c={c} value={address} onChange={setAddress} placeholder="Where should they cook?" /></Field>
        <Field c={c} label="Details"><Input c={c} value={details} onChange={setDetails} placeholder="Cuisine, dietary needs, occasion…" multiline /></Field>
      </ScrollView>
      <Dock>
        <Btn label={busy ? 'Posting…' : 'Get quotes'} icon="send" block loading={busy} onPress={submit} />
      </Dock>
    </Screen>
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
