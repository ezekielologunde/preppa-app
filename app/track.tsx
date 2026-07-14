import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import Svg, { Line } from 'react-native-svg';
import { COOKS, CookId } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Avatar, Btn } from '../src/ui';
import { Screen, TopBar } from '../src/ui/layout';
import { fetchOrderStatus } from '../src/lib/orders';

type RealStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';

/** Real order status → the 4 UI steps (audit Critical: this screen used to be entirely
 * hardcoded fixture data — fake order id, fake ETA, fake status — even one screen away
 * from real order-status plumbing that already existed for the cook's own order list). */
function stepsFromStatus(status: RealStatus | null, pickup: boolean, theCookName: string, kitchenName: string) {
  const doneUpTo: Record<RealStatus, number> = { pending: -1, confirmed: 0, preparing: 1, ready: 2, completed: 3, cancelled: -1 };
  const idx = status ? doneUpTo[status] : -1;
  const st = (n: number) => (status === 'cancelled' ? 'pending' : n <= idx ? 'done' : n === idx + 1 ? 'active' : 'pending');
  return [
    { t: 'Order confirmed', p: `${theCookName} accepted your order`, st: st(0) },
    { t: 'Cooking now', p: 'Fresh on the stove', st: st(1) },
    { t: pickup ? 'Ready for pickup' : 'Out for delivery', p: pickup ? `Head to ${kitchenName}` : 'On the way to you', st: st(2) },
    { t: 'Delivered', p: 'Leave a review to earn points', st: st(3) },
  ];
}

export default function Track() {
  const c = useC();
  const router = useRouter();
  const { flow, cook, orderId } = useLocalSearchParams<{ flow: string; cook?: string; orderId?: string }>();
  const { mode } = useStore();
  const cod = flow === 'cod';
  const ck = ((cook || 'maria') as CookId);
  const theCook = COOKS[ck];
  const [live, setLive] = useState<{ status: string; fulfillment: string } | null>(null);

  const poll = useCallback(() => {
    if (!orderId) return;
    fetchOrderStatus(orderId).then(setLive).catch(() => {});
  }, [orderId]);

  useFocusEffect(useCallback(() => {
    if (!orderId) return;
    poll();
    const t = setInterval(poll, 8000);
    return () => clearInterval(t);
  }, [poll, orderId]));

  // Real order (has a real orderId, non-cod): reflect actual DB status. COD and any legacy
  // link with no orderId fall back to the prior static presentation (COD's own mock status
  // is a separate, already-tracked finding — not this screen's job to fix).
  const pickup = live ? live.fulfillment === 'pickup' : mode === 'pickup';
  const STEPS = orderId && !cod
    ? stepsFromStatus((live?.status as RealStatus) ?? null, pickup, theCook.name, theCook.kitchen)
    : [
        { t: 'Order confirmed', p: `${theCook.name} accepted your order`, st: 'done' },
        { t: 'Cooking now', p: 'Fresh on the stove', st: cod ? 'done' : 'active' },
        { t: mode === 'pickup' ? 'Ready for pickup' : 'Out for delivery', p: mode === 'pickup' ? `Head to ${theCook.kitchen}` : 'On the way to you', st: cod ? 'done' : 'pending' },
        { t: cod ? 'Handed off · paid in cash' : 'Delivered', p: cod ? 'Confirmed by QR + code' : 'Leave a review to earn points', st: cod ? 'done' : 'pending' },
      ];
  const realStatusLabel = live?.status === 'completed' ? 'Delivered' : live?.status === 'cancelled' ? 'Cancelled' : 'Live';

  return (
    <Screen>
      <TopBar title={cod ? 'Order complete' : 'Track order'} sub={orderId ? `#${orderId.slice(0, 8)}` : undefined} onBack={() => router.replace('/home')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {/* map */}
        <View style={{ height: 180, backgroundColor: c.bg2, overflow: 'hidden' }}>
          <Svg width="100%" height={180}>
            {Array.from({ length: 20 }).map((_, i) => (
              <Line key={`v${i}`} x1={i * 28} y1={0} x2={i * 28} y2={180} stroke={c.border} strokeWidth={1} />
            ))}
            {Array.from({ length: 7 }).map((_, i) => (
              <Line key={`h${i}`} x1={0} y1={i * 28} x2={600} y2={i * 28} stroke={c.border} strokeWidth={1} />
            ))}
            <Line x1={44} y1={70} x2={300} y2={70} stroke={c.primary} strokeWidth={3} strokeDasharray="8 6" strokeLinecap="round" />
          </Svg>
          <Pin left={30} bg={c.ink} icon="chefhat" />
          <Pin right={46} bg={c.primary} icon="home" />
        </View>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, marginTop: -22, padding: 18, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={[type(12, 700), { color: c.muted, textTransform: 'uppercase' }]}>Status</Text>
              <Text style={[type(24, 900), { color: c.ink, letterSpacing: -0.6 }]}>
                {cod ? 'Completed' : orderId ? (live ? realStatusLabel : 'Loading…') : 'Live'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.greenL }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.green }} />
              <Text style={[type(12.5, 900), { color: c.green }]}>{cod ? 'Delivered' : orderId ? realStatusLabel : 'Live'}</Text>
            </View>
          </View>

          <View style={{ marginTop: 20 }}>
            {STEPS.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: s.st === 'done' ? c.green : s.st === 'active' ? c.primary : c.bg2 }}>
                    {s.st === 'done' ? <Icon name="check" size={15} color="#fff" /> : s.st === 'active' ? <Icon name="chefhat" size={15} color="#fff" /> : <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.muted }} />}
                  </View>
                  {i < STEPS.length - 1 ? <View style={{ width: 2, flex: 1, minHeight: 26, backgroundColor: s.st === 'done' ? c.green : c.border }} /> : null}
                </View>
                <View style={{ paddingBottom: 20, flex: 1 }}>
                  <Text style={[type(15, 800), { color: s.st === 'pending' ? c.muted : c.ink }]}>{s.t}</Text>
                  <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2 }]}>{s.p}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: radius.lg, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}>
            <Avatar cook={ck} size={46} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={[type(15, 900), { color: c.ink }]}>{theCook.name}</Text><Icon name="shield" size={15} color={c.green} /></View>
              <Text style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>Your cook is preparing your order</Text>
            </View>
          </View>

          {/* Handoff code is only for in-person pickup/meetup. Prepaid delivery
              comes to your door — no code needed. (Cash-on-delivery uses /cod.) */}
          {!cod && mode === 'pickup' ? (
            <View style={{ marginTop: 14, padding: 14, borderRadius: radius.lg, backgroundColor: c.purpleL, borderWidth: 1, borderColor: c.purple }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="qr" size={20} color={c.purpleOn} />
                <Text style={[type(12.5, 700), { color: c.purpleOn, flex: 1, lineHeight: 18 }]}>
                  Show your code when you collect — your cook scans it to confirm the right order.
                </Text>
              </View>
              <View style={{ marginTop: 12 }}>
                <Btn icon="qr" label="Show pickup code" block onPress={() => router.push(`/handoff?mode=${mode}&cook=${ck}`)} />
              </View>
            </View>
          ) : null}

          <View style={{ marginTop: 14 }}>
            <Btn label={cod ? 'Back to home' : 'Done'} block onPress={() => router.replace('/home')} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Pin({ left, right, bg, icon }: { left?: number; right?: number; bg: string; icon: string }) {
  return (
    <View style={{ position: 'absolute', top: 48, left, right, width: 34, height: 34, borderRadius: 17, borderBottomRightRadius: 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '45deg' }], shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 }}>
      <View style={{ transform: [{ rotate: '-45deg' }] }}><Icon name={icon} size={16} color="#fff" /></View>
    </View>
  );
}
