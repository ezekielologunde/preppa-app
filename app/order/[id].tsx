import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { cookOfLine, money } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Avatar, Btn } from '../../src/ui';
import { Screen, TopBar, Empty } from '../../src/ui/layout';
import { OrderLineRow } from '../../src/components/shared';
import { createOrderTicket, TICKET_CATEGORIES, TicketCategory } from '../../src/lib/tickets';
import { FLAGS } from '../../src/config/flags';
import { openThread } from '../../src/lib/messages';

const STEPS = ['Order confirmed', 'Cook is preparing', 'Ready for handoff', 'Completed'];

export default function OrderDetail() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, ordersLoading, ordersError, refreshOrders, reorder, toast, refreshOrderStatus } = useStore();
  const o = orders.find((x) => x.id === id);
  const [refreshError, setRefreshError] = useState(false);
  const [reordering, setReordering] = useState(false);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (!id || refreshInFlight.current) return;
    refreshInFlight.current = true;
    try {
      const ok = await refreshOrderStatus(id);
      setRefreshError(!ok);
    } finally {
      refreshInFlight.current = false;
    }
  }, [id, refreshOrderStatus]);
  useFocusEffect(useCallback(() => {
    void refresh();
    if (o?.status !== 'confirming') return undefined;
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => clearInterval(timer);
  }, [refresh, o?.status]));

  if (!o && ordersLoading) {
    return <Screen><TopBar title="Order" /><ActivityIndicator style={{ marginTop: 60 }} color={c.primary} /></Screen>;
  }

  if (!o) {
    return (
      <Screen>
        <TopBar title="Order" />
        <Empty icon="ticket" title={ordersError ? 'Could not load order' : 'Order not found'} body={ordersError ? 'Check your connection and try loading this order again.' : 'We couldn’t find that order.'} action={ordersError ? <Btn label="Try again" icon="repeat" onPress={() => void refreshOrders()} /> : <Btn label="Your orders" onPress={() => router.replace('/orders')} />} />
      </Screen>
    );
  }

  const cook = cookOfLine({ cook: o.cook, kitchenName: o.kitchenName, grad: o.lines[0]?.grad ?? 'g1' });
  const kitchenId = o.cook;
  const openChat = async () => {
    try { const tid = await openThread(kitchenId, 'order', o.dbId); router.push(`/messages/${tid}`); }
    catch { toast('Could not open chat. Please try again.', 'info'); }
  };
  const active = o.status === 'confirming' || o.status === 'confirmed' ? 0 : o.status === 'completed' ? 3 : o.status === 'ready' ? 2 : 1;
  const headline = o.status === 'confirming' ? 'Confirming your payment' : o.status === 'confirmed' ? 'Order confirmed' : o.status === 'cancelled' ? 'Order cancelled' : o.status === 'completed' ? 'Completed, enjoy!' : o.status === 'ready' ? (o.mode === 'pickup' ? 'Ready for pickup' : 'On its way') : 'Your cook is preparing';

  return (
    <Screen>
      <TopBar title={`Order ${o.id}`} sub={o.when} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={[type(22, 900), { color: c.ink, letterSpacing: -0.7, flex: 1 }]}>{headline}</Text>
          {o.status !== 'completed' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: o.status === 'cancelled' || refreshError ? c.redL : o.status === 'confirming' || o.status === 'confirmed' ? c.bg2 : c.greenL }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: o.status === 'cancelled' || refreshError ? c.red : o.status === 'confirming' || o.status === 'confirmed' ? c.muted : c.green }} />
              <Text style={[type(12, 900), { color: o.status === 'cancelled' || refreshError ? c.red : o.status === 'confirming' || o.status === 'confirmed' ? c.soft : c.green }]}>{o.status === 'cancelled' ? 'Cancelled' : refreshError ? 'Unavailable' : o.status === 'confirming' ? 'Confirming' : o.status === 'confirmed' ? 'Confirmed' : 'Live'}</Text>
            </View>
          ) : null}
        </View>

        {refreshError ? (
          <View accessibilityRole="alert" style={{ padding: 13, borderRadius: radius.md, backgroundColor: c.redL, borderWidth: 1, borderColor: c.red }}>
            <Text style={[type(12.5, 700), { color: c.red, lineHeight: 18, marginBottom: 9 }]}>We couldn’t refresh this order. The status shown may be out of date.</Text>
            <View style={{ alignSelf: 'flex-start' }}><Btn label="Try again" icon="repeat" variant="ghost" onPress={refresh} /></View>
          </View>
        ) : null}

        {o.status === 'confirming' && !refreshError ? (
          <View style={{ padding: 13, borderRadius: radius.md, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border2 }}>
            <Text style={[type(12.5, 700), { color: c.soft, lineHeight: 18 }]}>Stripe accepted the payment step. We’re waiting for secure server confirmation before sending the order to the kitchen.</Text>
          </View>
        ) : null}

        {/* cook card */}
        <Press scale={0.99} onPress={() => router.push(`/store/${o.cook}`)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 13 }}>
              <Avatar initial={cook.initial} grad={cook.grad} size={46} />
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

        {FLAGS.chat && kitchenId ? (
          <Btn variant="ghost" icon="comment" label={`Message ${cook.name.replace(/^Chef\s+/, '').split(' ')[0]}`} onPress={openChat} />
        ) : null}

        {/* steps */}
        {o.status !== 'completed' && o.status !== 'cancelled' ? (
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
          <View style={{ marginTop: 2 }}>
            {o.lines.map((l, i) => <OrderLineRow key={l.key ?? i} line={l} first={i === 0} />)}
          </View>
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 4 }} />
          <RRow label="Subtotal" value={money(o.subtotal)} c={c} />
          <RRow label={o.mode === 'pickup' ? 'Pickup' : 'Delivery'} value="Free" c={c} green />
          <RRow label="Service fee" value={o.service === 0 ? '$0.00' : money(o.service)} c={c} green={o.service === 0} />
          <RRow label="Sales tax" value={money(o.tax ?? 0)} c={c} />
          {o.tip > 0 ? <RRow label="Tip · 100% to cook" value={money(o.tip)} c={c} /> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={[type(16, 900), { color: c.ink }]}>Total</Text>
            <Text style={[type(16, 900), { color: c.ink }]}>{money(o.total)} <Text style={[type(12, 700), { color: c.muted }]}>· Card</Text></Text>
          </View>
        </View>

        <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'center' }]}>Payments and messages are kept on Preppa for your safety.</Text>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn variant="ghost" icon="repeat" label="Reorder" flex={1} loading={reordering} onPress={async () => {
            if (reordering) return;
            setReordering(true);
            const added = await reorder(o.id);
            setReordering(false);
            if (added) router.push('/cart');
          }} />
          {o.status === 'completed' ? (o.reviewed ? <Btn icon="star" label="Review submitted" variant="ghost" flex={1} disabled /> : <Btn icon="star" label="Rate your cook" flex={1} onPress={() => router.push(`/review/${o.id}`)} />) : o.status === 'cancelled' ? null : <Btn label="Track order" flex={1} onPress={() => router.push(`/track?cook=${encodeURIComponent(o.cook)}${o.dbId ? `&orderId=${encodeURIComponent(o.dbId)}` : ''}`)} />}
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
  const submitInFlight = useRef(false);

  const input = { borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 12, color: c.ink, backgroundColor: c.bg2, ...(type(14, 600) as object) };

  const submit = async () => {
    if (submitInFlight.current) return;
    if (subject.trim().length < 3) { toast('Add a short subject', 'info'); return; }
    if (body.trim().length < 3) { toast('Describe the issue', 'info'); return; }
    submitInFlight.current = true;
    setBusy(true);
    try {
      await createOrderTicket(orderId, cat, subject.trim(), body.trim());
      toast('Issue reported — we’ll follow up', 'check', true);
      setOpen(false); setSubject(''); setBody(''); setCat('missing_item');
    } catch {
      toast('Couldn’t send your report just now. Please try again.', 'info');
    } finally {
      submitInFlight.current = false;
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
            <Press key={k.value} scale={0.96} onPress={() => setCat(k.value)} label={`${k.label}${on ? ', selected' : ''}`} selected={on}>
              <View style={{ paddingHorizontal: 12, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border }}>
                <Text style={[type(12.5, 800), { color: on ? '#fff' : c.ink }]}>{k.label}</Text>
              </View>
            </Press>
          );
        })}
      </View>
      <TextInput value={subject} onChangeText={setSubject} maxLength={120} placeholder="Subject" placeholderTextColor={c.muted} accessibilityLabel="Issue subject, 120 characters maximum" style={input} />
      <TextInput value={body} onChangeText={setBody} maxLength={2000} placeholder="What went wrong?" placeholderTextColor={c.muted} multiline accessibilityLabel="Issue description, 2,000 characters maximum" style={[input, { minHeight: 72, textAlignVertical: 'top' }]} />
      <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'right' }]}>{body.length}/2000</Text>
      <Btn label="Submit report" icon="check" loading={busy} disabled={busy} onPress={submit} />
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
