import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Press, Icon } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { KBtn } from '../(tabs)/my-hub';
import { listIncomingRequests, submitQuote, SERVICE_LABELS, type IncomingRequest } from '../../src/lib/services';

export default function HubRequests() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [items, setItems] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => { setLoading(true); listIncomingRequests().then((r) => { setItems(r); setLoading(false); }); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <TopBar title="Service requests" sub={loading ? '' : `${items.length} incoming`} onBack={() => router.back()} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : items.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 50, paddingHorizontal: 24 }}>
          <View style={{ width: 56, height: 56, borderRadius: 18, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name="chefhat" size={26} color={c.muted} /></View>
          <Text style={[type(16, 900), { color: c.ink, marginTop: 12 }]}>No requests yet</Text>
          <Text style={[type(13, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300, lineHeight: 19 }]}>When a customer nearby requests a service you offer, it shows up here to quote. Set your service types in your kitchen profile.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
          {items.map((r) => <RequestCard key={r.requestId} r={r} onQuoted={load} toast={toast} />)}
        </ScrollView>
      )}
    </Screen>
  );
}

function RequestCard({ r, onQuoted, toast }: { r: IncomingRequest; onQuoted: () => void; toast: (m: string, i?: string, ok?: boolean) => void }) {
  const c = useC();
  const router = useRouter();
  const isPlan = r.category === 'meal_plan';
  const [amount, setAmount] = useState('');
  const [deposit, setDeposit] = useState('');
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const quoted = !!r.myQuoteId;

  const send = async () => {
    if (busy) return;
    const amt = Math.round(Number(amount) * 100);
    const dep = deposit ? Math.round(Number(deposit) * 100) : Math.round(amt * 0.25);
    if (!(amt > 0)) { toast('Enter your price', 'info'); return; }
    if (dep > amt) { toast('Deposit can’t exceed the total', 'info'); return; }
    setBusy(true);
    try { await submitQuote({ requestId: r.requestId, amountCents: amt, depositCents: dep, note: note.trim() || undefined }); toast('Quote sent', 'check', true); setOpen(false); onQuoted(); }
    catch (e: any) { toast(e?.message || 'Could not send quote', 'info'); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.xl, padding: 16, ...shadow.card }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={[type(15.5, 900), { color: c.ink }]}>{SERVICE_LABELS[r.category]}</Text>
        {quoted ? <View style={{ height: 22, paddingHorizontal: 9, borderRadius: radius.pill, backgroundColor: c.greenL, alignItems: 'center', justifyContent: 'center' }}><Text style={[type(10.5, 900), { color: c.green }]}>QUOTED {r.myAmountCents ? money(r.myAmountCents / 100) : ''}</Text></View> : null}
      </View>
      <Text style={[type(12.5, 600), { color: c.soft, marginTop: 3 }]}>{r.eventDate}{r.guests ? ` · ${r.guests} guests` : ''}{r.approxArea ? ` · ${r.approxArea}` : ''}{r.budgetCents ? ` · budget ${money(r.budgetCents / 100)}` : ''}</Text>
      {r.details ? <Text style={[type(13, 500), { color: c.ink2, marginTop: 8, lineHeight: 19 }]}>{r.details}</Text> : null}

      {isPlan ? (
        <View style={{ marginTop: 12 }}><KBtn label="Create a plan for them" variant="pri" icon="plus" onPress={() => router.push(`/hub/create-plan?forRequest=${r.requestId}`)} /></View>
      ) : !quoted ? (
        !open ? (
          <View style={{ marginTop: 12 }}><KBtn label="Send a quote" variant="pri" onPress={() => setOpen(true)} /></View>
        ) : (
          <View style={{ marginTop: 12, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <QInput c={c} value={amount} onChange={setAmount} placeholder="Your price $" />
              <QInput c={c} value={deposit} onChange={setDeposit} placeholder="Deposit $ (opt)" />
            </View>
            <QInput c={c} value={note} onChange={setNote} placeholder="Note to the customer (optional)" multiline />
            <KBtn label={busy ? 'Sending…' : 'Send quote'} variant="pri" onPress={send} />
          </View>
        )
      ) : null}
    </View>
  );
}

function QInput({ c, value, onChange, placeholder, multiline }: { c: any; value: string; onChange: (t: string) => void; placeholder: string; multiline?: boolean }) {
  return (
    <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} multiline={multiline}
      keyboardType={multiline ? undefined : 'decimal-pad'}
      style={[type(15, 600), { flex: 1, color: c.ink, backgroundColor: c.bg2, borderWidth: 1.5, borderColor: c.border, borderRadius: radius.md, minHeight: multiline ? 68 : 48, paddingHorizontal: 14, paddingTop: multiline ? 12 : 0 }]} />
  );
}
