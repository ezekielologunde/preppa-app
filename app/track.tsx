import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { cookOfLine } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Avatar, Btn } from '../src/ui';
import { Screen, TopBar, Empty } from '../src/ui/layout';
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
  const { cook, orderId } = useLocalSearchParams<{ cook?: string; orderId?: string }>();
  const { mode, orders } = useStore();
  // The freshest source for this order's real kitchen identity is the just-created
  // CustomerOrder (matched by dbId/orderId, or by the same grouping key) — cookOfLine's
  // COOKS fallback only covers the 6 seed kitchens.
  const matchedOrder = orders.find((o) => (orderId && o.dbId === orderId) || (!!cook && o.cook === cook));
  const ck = cook ?? matchedOrder?.cook ?? '';
  const theCook = cookOfLine({ cook: ck, kitchenName: matchedOrder?.kitchenName, grad: matchedOrder?.lines[0]?.grad ?? 'g1' });
  const [live, setLive] = useState<{ status: string; fulfillment: string; payStatus: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(!!orderId);

  const poll = useCallback(() => {
    if (!orderId) return;
    fetchOrderStatus(orderId)
      .then((next) => {
        if (!next) throw new Error('This order could not be found. Open Orders to view your current activity.');
        setLive(next);
        setLoadError('');
      })
      .catch((e) => setLoadError(e?.message ?? 'Couldn’t refresh this order.'))
      .finally(() => setLoading(false));
  }, [orderId]);

  useFocusEffect(useCallback(() => {
    if (!orderId) return;
    poll();
    const t = setInterval(poll, 8000);
    return () => clearInterval(t);
  }, [poll, orderId]));

  if (!orderId) {
    return <Screen><TopBar title="Track order" /><Empty icon="ticket" title="Order unavailable" body="Open your orders and select a current order to see its verified kitchen updates." action={<Btn label="Your orders" onPress={() => router.replace('/orders')} />} /></Screen>;
  }

  const pickup = live ? live.fulfillment === 'pickup' : mode === 'pickup';
  const paymentConfirmed = live?.payStatus === 'paid' || live?.payStatus === 'refunded';
  const confirmingPayment = !!live && !paymentConfirmed;
  const STEPS = stepsFromStatus(paymentConfirmed ? (live?.status as RealStatus) ?? null : null, pickup, theCook.name, theCook.kitchen);
  const realStatusLabel = live && !paymentConfirmed ? 'Confirming payment' : live?.status === 'completed' ? 'Delivered' : live?.status === 'cancelled' ? 'Cancelled' : 'Live';

  return (
    <Screen>
      <TopBar title="Track order" sub={`#${orderId.slice(0, 8)}`} onBack={() => router.replace('/home')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ minHeight: 116, backgroundColor: c.bg2, paddingHorizontal: 20, paddingVertical: 22, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={pickup ? 'bag' : 'truck'} size={23} color={c.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type(15, 900), { color: c.ink }]}>Live kitchen updates</Text>
            <Text style={[type(12.5, 600), { color: c.soft, lineHeight: 18, marginTop: 3 }]}>This timeline reflects status updates from {theCook.name}. Location tracking is not available.</Text>
          </View>
        </View>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, marginTop: -22, padding: 18, paddingTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <Text style={[type(12, 700), { color: c.muted, textTransform: 'uppercase' }]}>Status</Text>
              <Text style={[type(24, 900), { color: c.ink, letterSpacing: -0.6 }]}>
                {live ? realStatusLabel : loading ? 'Loading…' : 'Unavailable'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: orderId && loadError && !live ? c.redL : confirmingPayment ? c.bg2 : c.greenL }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: orderId && loadError && !live ? c.red : confirmingPayment ? c.muted : c.green }} />
              <Text style={[type(12.5, 900), { color: orderId && loadError && !live ? c.red : confirmingPayment ? c.soft : c.green }]}>
                {loadError && !live ? 'Unavailable' : realStatusLabel}
              </Text>
            </View>
          </View>

          {orderId && loadError ? (
            <View style={{ marginTop: 14, padding: 13, borderRadius: radius.lg, backgroundColor: c.redL, borderWidth: 1, borderColor: c.red }}>
              <Text style={[type(12.5, 700), { color: c.red, lineHeight: 18 }]}>{loadError}</Text>
              <View style={{ marginTop: 10, alignSelf: 'flex-start' }}><Btn label="Try again" icon="repeat" variant="ghost" onPress={poll} /></View>
            </View>
          ) : null}

          <View style={{ marginTop: 20 }}>
            {STEPS.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 14 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: s.st === 'done' ? c.green : s.st === 'active' ? c.primaryD : c.bg2 }}>
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
            <Avatar cook={ck} initial={theCook.initial} grad={theCook.grad} size={46} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Text style={[type(15, 900), { color: c.ink }]}>{theCook.name}</Text><Icon name="shield" size={15} color={c.green} /></View>
              <Text style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>Your cook is preparing your order</Text>
            </View>
          </View>

          <View style={{ marginTop: 14 }}>
            <Btn label="Done" block onPress={() => router.replace('/home')} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
