import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COOKS, money } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Avatar, Btn } from '../../src/ui';
import { Screen, TopBar, Empty } from '../../src/ui/layout';
import { createOrderTicket, TICKET_CATEGORIES, TicketCategory } from '../../src/lib/tickets';

const STEPS = ['Order confirmed', 'Cook is preparing', 'Ready for handoff', 'Completed'];

export default function OrderDetail() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, reorder, toast } = useStore();
  const o = orders.find((x) => x.id === id);

  if (!o) {
    return (
      <Screen>
        <TopBar title="Order" />
        <Empty icon="ticket" title="Order not found" body="We couldn’t find that order." action={<Btn label="Your orders" onPress={() => router.replace('/orders')} />} />
      </Screen>
    );
  }

  const cook = COOKS[o.cook];
  const active = o.status === 'completed' ? 3 : o.status === 'ready' ? 2 : 1;
  const headline = o.status === 'completed' ? (o.flow === 'cod' ? 'Completed · paid in cash' : 'Completed — enjoy!') : o.status === 'ready' ? (o.mode === 'pickup' ? 'Ready for pickup' : 'On its way') : 'Your cook is preparing';

  return (
    <Screen>
      <TopBar title={`Order ${o.id}`} sub={o.when} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type(22, 900), { color: c.ink, letterSpacing: -0.7, flex: 1 }]}>{headline}</Text>
          {o.status !== 'completed' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: c.greenL }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.green }} />
              <Text style={[type(12, 900), { color: c.green }]}>Live</Text>
            </View>
          ) : null}
        </View>

        {/* cook card */}
        <Press scale={0.99} onPress={() => router.push(`/store/${o.cook}`)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 13 }}>
            <Avatar cook={o.cook} size={46} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[type(15, 900), { color: c.ink }]}>{cook.kitchen}</Text>
                <Icon name="shield" size={14} color={c.green} />
              </View>
              <Text style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>View kitchen</Text>
            </View>
            <Icon name="chevRight" size={16} color={c.muted} />
          </View>
        </Press>

        {/* steps */}
        {o.status !== 'completed' ? (
          <View style={{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 16 }}>
            {STEPS.map((label, i) => {
              const done = i < active;
              const current = i === active;
              const on = done || current;
              return (
                <View key={label} style={{ flexDirection: 'row', gap: 13, alignItems: 'flex-start' }}>
                  <View style={{ alignItems: 'center' }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: on ? c.primary : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                      {done ? <Icon name="check" size={15} color="#fff" /> : <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: current ? '#fff' : c.muted }} />}
                    </View>
                    {i < STEPS.length - 1 ? <View style={{ width: 2, height: 24, backgroundColor: done ? c.primary : c.border }} /> : null}
                  </View>
                  <Text style={[type(14.5, current ? 900 : 600), { color: on ? c.ink : c.soft, paddingTop: 3 }]}>{label}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* receipt */}
        <View style={{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 16, gap: 8 }}>
          <Text style={[type(12, 900), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }]}>Receipt</Text>
          {o.lines.map((l, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[type(14, 600), { color: c.ink }]}>{l.qty}× {l.name}</Text>
              <Text style={[type(14, 700), { color: c.ink }]}>{money(l.price * l.qty)}</Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
          <RRow label="Subtotal" value={money(o.subtotal)} c={c} />
          <RRow label={o.mode === 'pickup' ? 'Pickup' : 'Delivery'} value="Free" c={c} green />
          <RRow label="Service fee" value={o.service === 0 ? '$0.00' : money(o.service)} c={c} green={o.service === 0} />
          <RRow label="Sales tax" value={money(o.tax ?? 0)} c={c} />
          {o.tip > 0 ? <RRow label="Tip · 100% to cook" value={money(o.tip)} c={c} /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={[type(16, 900), { color: c.ink }]}>Total</Text>
            <Text style={[type(16, 900), { color: c.ink }]}>{money(o.total)} <Text style={[type(12, 700), { color: c.muted }]}>· {o.flow === 'cod' ? 'Cash' : 'Card'}</Text></Text>
          </View>
        </View>

        <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'center' }]}>Payments and messages are kept on Preppa for your safety.</Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn variant="ghost" icon="repeat" label="Reorder" flex={1} onPress={() => { reorder(o.id); router.push('/cart'); }} />
          {o.status === 'completed' ? <Btn icon="star" label="Rate your cook" flex={1} onPress={() => router.push(`/review/${o.id}`)} /> : <Btn label="Track order" flex={1} onPress={() => router.push(`/track?flow=${o.flow}`)} />}
        </View>

        {o.dbId ? <ReportIssue orderId={o.dbId} /> : null}
      </ScrollView>
    </Screen>
  );
}

/** Inline "Report an issue" form — only shown for orders backed by a real DB order. */
function ReportIssue({ orderId }: { orderId: string }) {
  const c = useC();
  const { toast } = useStore();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<TicketCategory>('missing_item');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const input = { borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 12, color: c.ink, backgroundColor: c.bg2, ...(type(14, 600) as object) };

  const submit = async () => {
    if (subject.trim().length < 3) { toast('Add a short subject', 'info'); return; }
    if (body.trim().length < 3) { toast('Describe the issue', 'info'); return; }
    setBusy(true);
    try {
      await createOrderTicket(orderId, cat, subject.trim(), body.trim());
      toast('Issue reported — we’ll follow up', 'check', true);
      setOpen(false); setSubject(''); setBody(''); setCat('missing_item');
    } catch {
      toast('Couldn’t send your report just now. Please try again.', 'info');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return <Btn variant="ghost" icon="info" label="Report an issue" onPress={() => setOpen(true)} />;
  }
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={[type(15, 900), { color: c.ink, flex: 1 }]}>Report an issue</Text>
        <Press onPress={() => setOpen(false)} label="Close"><Icon name="x" size={18} color={c.muted} /></Press>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {TICKET_CATEGORIES.map((k) => {
          const on = cat === k.value;
          return (
            <Press key={k.value} scale={0.96} onPress={() => setCat(k.value)}>
              <View style={{ paddingHorizontal: 12, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
                <Text style={[type(12.5, 800), { color: on ? '#fff' : c.ink }]}>{k.label}</Text>
              </View>
            </Press>
          );
        })}
      </View>
      <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor={c.muted} style={input} />
      <TextInput value={body} onChangeText={setBody} placeholder="What went wrong?" placeholderTextColor={c.muted} multiline style={[input, { minHeight: 72, textAlignVertical: 'top' }]} />
      <Btn label="Submit report" icon="check" loading={busy} onPress={submit} />
    </View>
  );
}

function RRow({ label, value, c, green }: { label: string; value: string; c: any; green?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text style={[type(13.5, 600), { color: c.soft }]}>{label}</Text>
      <Text style={[type(13.5, 700), { color: green ? c.green : c.ink }]}>{value}</Text>
    </View>
  );
}
