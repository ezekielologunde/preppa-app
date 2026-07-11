import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COOKS, money } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore, CustomerOrder } from '../../src/store/store';
import { Icon, Press, GradBox, Btn } from '../../src/ui';
import { Empty } from '../../src/ui/layout';
import { listMySubscriptions, type MySubscription } from '../../src/lib/subscriptions';
import { listMyBookings, type BookingView } from '../../src/lib/services';

const STATUS: Record<CustomerOrder['status'], { label: string; bg: (c: any) => string; fg: (c: any) => string }> = {
  preparing: { label: 'Preparing', bg: (c) => c.primaryL, fg: (c) => c.primaryD },
  ready: { label: 'Ready', bg: (c) => c.greenL, fg: (c) => c.green },
  completed: { label: 'Completed', bg: (c) => c.bg2, fg: (c) => c.soft },
};
const weekly = (cents: number) => money((cents + Math.round(cents * 0.1)) / 100);

/** Unified activity: meal orders + weekly plans (+ service bookings in Phase 3). */
export default function Orders() {
  const c = useC();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orders } = useStore();
  const [subs, setSubs] = useState<MySubscription[]>([]);
  const [bookings, setBookings] = useState<BookingView[]>([]);
  useFocusEffect(useCallback(() => {
    let a = true;
    listMySubscriptions().then((s) => { if (a) setSubs(s); });
    listMyBookings().then((b) => { if (a) setBookings(b); });
    return () => { a = false; };
  }, []));

  const empty = orders.length === 0 && subs.length === 0 && bookings.length === 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 10, paddingBottom: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <Text style={[type(28, 900), { color: c.ink, letterSpacing: -1 }]}>Orders</Text>
        <Text style={[type(13.5, 500), { color: c.soft, marginTop: 6 }]}>Your meals, weekly plans, and bookings.</Text>
      </View>

      {empty ? (
        <Empty icon="ticket" title="Nothing yet" body="Your meals and plans will show up here once you order or subscribe." action={<Btn label="Explore meals" onPress={() => router.push('/discover')} />} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, maxWidth: 760, alignSelf: 'center', width: '100%' }}>
          {subs.length > 0 ? (
            <>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }]}>Your plans</Text>
              <View style={{ gap: 10, marginBottom: 22 }}>
                {subs.map((s) => (
                  <Press key={s.id} scale={0.99} onPress={() => router.push('/plans')}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 14, ...shadow.card }}>
                      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={21} color={c.primary} /></View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[type(15, 900), { color: c.ink }]}>{s.planName}</Text>
                        <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{s.kitchenName} · {weekly(s.priceCents)}/wk · {s.status === 'paused' ? 'Paused' : s.status === 'past_due' ? 'Payment due' : 'Active'}</Text>
                      </View>
                      <Icon name="chevRight" size={16} color={c.muted} />
                    </View>
                  </Press>
                ))}
              </View>
            </>
          ) : null}

          {bookings.length > 0 ? (
            <>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }]}>Service bookings</Text>
              <View style={{ gap: 10, marginBottom: 22 }}>
                {bookings.map((b) => (
                  <View key={b.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 14, ...shadow.card }}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="chefhat" size={21} color={c.primary} /></View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[type(15, 900), { color: c.ink }]}>{b.kitchenName}</Text>
                      <Text numberOfLines={1} style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{b.eventDate} · {money(b.amountCents / 100)} · {b.status === 'confirmed' ? 'Confirmed' : b.status === 'completed' ? 'Completed' : b.status === 'pending_deposit' ? 'Deposit pending' : b.status}</Text>
                    </View>
                    {b.balanceCents > 0 && (b.status === 'confirmed') ? <Text style={[type(11.5, 700), { color: c.muted }]}>{money(b.balanceCents / 100)} due</Text> : null}
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {orders.length > 0 ? (
            <>
              <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }]}>Meal orders</Text>
              <View style={{ gap: 10 }}>
                {orders.map((o) => {
                  const cook = COOKS[o.cook];
                  const s = STATUS[o.status];
                  const summary = o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ');
                  return (
                    <Press key={o.id} scale={0.99} onPress={() => router.push(`/order/${o.id}`)}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.surface, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, padding: 14, ...shadow.card }}>
                        <GradBox grad={cook.grad} style={{ width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={[type(20, 900), { color: '#fff' }]}>{cook.initial}</Text>
                        </GradBox>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={[type(15, 800), { color: c.ink }]}>{cook.kitchen}</Text>
                            <View style={{ backgroundColor: s.bg(c), paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill }}>
                              <Text style={[type(10.5, 900), { color: s.fg(c), textTransform: 'uppercase', letterSpacing: 0.3 }]}>{s.label}</Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={[type(12.5, 500), { color: c.soft, marginTop: 3 }]}>{summary}</Text>
                          <Text style={[type(11.5, 600), { color: c.muted, marginTop: 3 }]}>{o.id} · {o.when} · {o.flow === 'cod' ? 'Cash' : 'Card'}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 6 }}>
                          <Text style={[type(15, 900), { color: c.ink }]}>{money(o.total)}</Text>
                          <Icon name="chevRight" size={16} color={c.muted} />
                        </View>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
