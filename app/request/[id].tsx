import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Btn } from '../../src/ui';
import { Screen, TopBar, Block } from '../../src/ui/layout';
import { NotFound } from '../../src/components/NotFound';
import { CardPaymentSheet } from '../../src/components/CardPaymentSheet';
import { money } from '../../src/data/data';
import {
  fetchServiceRequest, acceptQuoteAndDeposit, cancelServiceRequest,
  SERVICE_LABELS, type RequestView, type QuoteView,
} from '../../src/lib/services';

const money2 = (cents: number) => money(cents / 100);
const prettyKey = (k: string) => k.replace(/_/g, ' ').replace(/^\w/, (m) => m.toUpperCase());

export default function RequestDetailScreen() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useStore();
  const [req, setReq] = useState<RequestView | null | undefined>(undefined);
  const [busyQ, setBusyQ] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [pay, setPay] = useState<{ clientSecret: string; label: string } | null>(null);

  const load = useCallback(() => { fetchServiceRequest(id!).then(setReq); }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (req === undefined) return <Screen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
  if (req === null) return <NotFound title="Request" />;

  const answers = req.answers ?? {};
  const answerRows = Object.entries(answers).filter(([, v]) => v && (Array.isArray(v) ? v.length : true));
  const liveQuotes = req.quotes.filter((q) => q.status === 'pending' || q.status === 'accepted');
  const canEdit = req.status === 'open';
  const canCancel = !['accepted', 'cancelled', 'expired'].includes(req.status);
  const statusLabel = req.status === 'accepted' ? 'Booked' : req.status === 'cancelled' ? 'Cancelled'
    : req.status === 'expired' ? 'Expired' : liveQuotes.length ? `${liveQuotes.length} quote${liveQuotes.length !== 1 ? 's' : ''}` : 'Finding cooks';
  const statusTint = req.status === 'accepted' ? c.green : req.status === 'cancelled' || req.status === 'expired' ? c.muted : liveQuotes.length ? c.primary : c.soft;

  const accept = async (q: QuoteView) => {
    if (busyQ) return;
    setBusyQ(q.id);
    try {
      const { clientSecret, depositCents } = await acceptQuoteAndDeposit(q.id);
      if (clientSecret) setPay({ clientSecret, label: money2(depositCents ?? q.depositCents) });
      else { toast('Booking confirmed', 'check', true); load(); }
    } catch (e: any) { toast(e?.message || 'Could not start your booking', 'info'); }
    finally { setBusyQ(null); }
  };

  const cancel = async () => {
    if (canceling) return;
    setCanceling(true);
    try { await cancelServiceRequest(id!); toast('Request cancelled', 'x'); router.back(); }
    catch (e: any) { toast(e?.message || 'Could not cancel', 'info'); }
    finally { setCanceling(false); }
  };

  return (
    <Screen>
      <TopBar title={SERVICE_LABELS[req.category] ?? 'Request'} sub={`${req.eventDate}${req.eventTime ? ` · ${req.eventTime}` : ''}`} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 14 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusTint }} />
          <Text style={[type(12.5, 900), { color: statusTint, textTransform: 'uppercase', letterSpacing: 0.4 }]}>{statusLabel}</Text>
        </View>

        <Block title="What you asked for">
          {answerRows.length ? answerRows.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 5 }}>
              <Text style={[type(13, 600), { color: c.soft }]}>{prettyKey(k)}</Text>
              <Text style={[type(13.5, 700), { color: c.ink, flex: 1, textAlign: 'right' }]}>{Array.isArray(v) ? v.join(', ') : String(v)}</Text>
            </View>
          )) : (
            <Text style={[type(13.5, 600), { color: c.soft }]}>{req.details || 'No extra details.'}</Text>
          )}
          <View style={{ height: 1, backgroundColor: c.border2, marginVertical: 8 }} />
          {req.guests ? <Meta c={c} k="Guests" v={String(req.guests)} /> : null}
          {req.budgetCents ? <Meta c={c} k="Budget" v={money2(req.budgetCents)} /> : null}
          {req.approxArea ? <Meta c={c} k="Area" v={req.approxArea} /> : null}
        </Block>

        <Block title={liveQuotes.length ? 'Quotes' : 'Quotes will appear here'}>
          {liveQuotes.length === 0 ? (
            <Text style={[type(13.5, 600), { color: c.soft, lineHeight: 20 }]}>We’ve sent your request to nearby preppers. You’ll be notified as quotes come in — usually within a day.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              {liveQuotes.map((q) => (
                <View key={q.id} style={{ borderWidth: 1, borderColor: q.status === 'accepted' ? c.green : c.border2, borderRadius: radius.card, padding: 14, backgroundColor: c.surface, ...shadow.card }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={[type(15, 900), { color: c.ink }]}>{q.kitchenName}</Text>
                    <Text style={[type(16, 900), { color: c.ink }]}>{money2(q.amountCents)}</Text>
                  </View>
                  {q.note ? <Text style={[type(12.5, 600), { color: c.soft, marginTop: 6, lineHeight: 18 }]}>{q.note}</Text> : null}
                  <Text style={[type(11.5, 600), { color: c.muted, marginTop: 6 }]}>{money2(q.depositCents)} deposit to book · balance on the day</Text>
                  {q.status === 'accepted' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}><Icon name="check" size={15} color={c.green} /><Text style={[type(13, 800), { color: c.green }]}>Booked</Text></View>
                  ) : req.status === 'open' || req.status === 'quoted' ? (
                    <View style={{ marginTop: 12 }}>
                      <Btn label={busyQ === q.id ? 'Starting…' : 'Accept & pay deposit'} icon="card" block loading={busyQ === q.id} onPress={() => accept(q)} />
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </Block>

        {(canEdit || canCancel) ? (
          <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 6 }}>
            {canEdit ? <View style={{ flex: 1 }}><Btn label="Edit request" icon="edit" variant="ghost" block onPress={() => router.push(`/service-request?edit=${id}`)} /></View> : null}
            {canCancel ? (
              <Press scale={0.97} onPress={cancel} style={{ flex: canEdit ? 0.7 : 1 }}>
                <View style={{ height: 52, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                  {canceling ? <ActivityIndicator size="small" color={c.red} /> : <Text style={[type(14, 800), { color: c.red }]}>Cancel</Text>}
                </View>
              </Press>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <CardPaymentSheet visible={!!pay} clientSecret={pay?.clientSecret ?? null} amountLabel={pay?.label ?? ''} mode="pay"
        onPaid={() => { setPay(null); toast('Deposit paid — you’re booked!', 'check', true); load(); }} onClose={() => setPay(null)} />
    </Screen>
  );
}

function Meta({ c, k, v }: { c: any; k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={[type(13, 600), { color: c.soft }]}>{k}</Text>
      <Text style={[type(13.5, 700), { color: c.ink }]}>{v}</Text>
    </View>
  );
}
