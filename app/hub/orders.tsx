import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Icon, Press, GradBox } from '../../src/ui';
import { money, GradKey } from '../../src/data/data';
import { fetchKitchenOrders, timeAgo, type KitchenOrderRow } from '../../src/lib/orders';
import { HubHeader, KSeg, KPill } from '../(tabs)/my-hub';

type UiStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled';
const STATUS: Record<UiStatus, { label: string; bg: (c: any) => string; fg: (c: any) => string }> = {
  pending: { label: 'Awaiting payment', bg: (c) => c.bg2, fg: (c) => c.soft },
  confirmed: { label: 'New', bg: (c) => c.primaryL, fg: (c) => c.primaryD },
  preparing: { label: 'Preparing', bg: (c) => c.amberL, fg: (c) => c.amber },
  ready: { label: 'Ready', bg: (c) => c.blueL, fg: (c) => c.blue },
  completed: { label: 'Done', bg: (c) => c.bg2, fg: (c) => c.soft },
  cancelled: { label: 'Cancelled', bg: (c) => c.redL, fg: (c) => c.red },
};
const GRADS: GradKey[] = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'];
const gradFor = (id: string) => GRADS[[...id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % GRADS.length];

function OrderRow({ o, onPress }: { o: KitchenOrderRow; onPress: () => void }) {
  const c = useC();
  const s = STATUS[o.status as UiStatus] ?? STATUS.pending;
  const title = o.first_item_name ? `${o.first_item_name}${o.item_count > 1 ? ` +${o.item_count - 1} more` : ''}` : `${o.item_count} item${o.item_count === 1 ? '' : 's'}`;
  return (
    <Press scale={0.99} onPress={onPress} label={`${title}, ${o.buyer_name ?? 'Customer'}, ${s.label}, ${money(o.total_cents / 100)}, open order details`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 16, padding: 13, marginHorizontal: 20, marginBottom: 10 }}>
        <GradBox grad={gradFor(o.order_id)} style={{ width: 50, height: 50, borderRadius: 13 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink, letterSpacing: -0.3 }]}>{title}</Text>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{o.buyer_name ?? 'Customer'} · {o.first_item_qty ?? 1}× · {o.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
          <View style={{ marginTop: 5 }}>
            <KPill label={s.label} bg={s.bg(c)} fg={s.fg(c)} dot={o.status === 'confirmed'} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{money(o.total_cents / 100)}</Text>
          <Text style={[type(11.5, 700), { color: c.muted, marginTop: 4 }]}>{timeAgo(o.created_at)}</Text>
        </View>
      </View>
    </Press>
  );
}

export default function OrdersScreen() {
  const c = useC();
  const router = useRouter();
  const [seg, setSeg] = useState('active');
  const [orders, setOrders] = useState<KitchenOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const nextOrders = await fetchKitchenOrders();
      if (sequence === loadSequence.current) setOrders(nextOrders);
    } catch {
      if (sequence === loadSequence.current) setError('Check your connection and try loading orders again.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]));

  const active = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');
  const past = orders.filter((o) => o.status === 'completed' || o.status === 'cancelled');
  const list = seg === 'active' ? active : past;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HubHeader
        eyebrow="My Hub"
        name="Orders"
        onBack={() => router.back()}
        below={<KSeg options={[{ key: 'active', label: `Active · ${active.length}` }, { key: 'past', label: 'History' }]} value={seg} onChange={setSeg} />}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 40, maxWidth: 1040, alignSelf: 'center', width: '100%' }}>
        {loading && orders.length === 0 ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
        ) : error && orders.length === 0 ? (
          <View accessibilityRole="alert" style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 60 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.redL, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="info" size={28} color={c.red} />
            </View>
            <Text style={[type(16, 900), { color: c.ink }]}>Orders didn’t load</Text>
            <Text style={[type(13.5, 500), { color: c.soft, marginTop: 5, textAlign: 'center', lineHeight: 20 }]}>{error}</Text>
            <Press scale={0.97} onPress={load} label="Try loading orders again" style={{ marginTop: 18 }}>
              <View style={{ minHeight: 48, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center' }}><Text style={[type(14, 800), { color: '#fff' }]}>Try again</Text></View>
            </Press>
          </View>
        ) : (
          <>
            {error ? (
              <View accessibilityRole="alert" style={{ marginHorizontal: 20, marginBottom: 14, borderWidth: 1, borderColor: c.red, backgroundColor: c.redL, borderRadius: radius.lg, padding: 14 }}>
                <Text style={[type(13.5, 900), { color: c.ink }]}>Couldn’t refresh orders</Text>
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 4, lineHeight: 18 }]}>{error} Your current order list is still shown.</Text>
                <Press scale={0.97} onPress={load} disabled={loading} label="Try loading orders again" style={{ marginTop: 12, alignSelf: 'flex-start' }}>
                  <View style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center', opacity: loading ? 0.6 : 1 }}><Text style={[type(13.5, 800), { color: '#fff' }]}>Try again</Text></View>
                </Press>
              </View>
            ) : null}
            {list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 60 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="box" size={28} color={c.muted} />
            </View>
            <Text style={[type(16, 900), { color: c.ink }]}>Nothing here yet</Text>
            <Text style={[type(13.5, 500), { color: c.soft, marginTop: 5, textAlign: 'center' }]}>New orders will appear the moment they come in.</Text>
          </View>
            ) : list.map((o) => <OrderRow key={o.order_id} o={o} onPress={() => router.push(`/hub/order/${o.order_id}`)} />)}
          </>
        )}
      </ScrollView>
    </View>
  );
}
