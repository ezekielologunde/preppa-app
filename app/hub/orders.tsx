import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Icon, Press, GradBox } from '../../src/ui';
import { money, GradKey } from '../../src/data/data';
import { fetchKitchenOrders, timeAgo, type KitchenOrderRow } from '../../src/lib/orders';
import { HubHeader, KSeg, KPill } from '../(tabs)/my-hub';

type UiStatus = 'confirmed' | 'preparing' | 'ready' | 'completed';
const STATUS: Record<UiStatus, { label: string; bg: (c: any) => string; fg: (c: any) => string }> = {
  confirmed: { label: 'New', bg: (c) => c.primaryL, fg: (c) => c.primaryD },
  preparing: { label: 'Preparing', bg: () => '#FEF3E2', fg: () => '#B45309' },
  ready: { label: 'Ready', bg: () => '#E6F0FE', fg: () => '#2563EB' },
  completed: { label: 'Done', bg: (c) => c.bg2, fg: (c) => c.soft },
};
const GRADS: GradKey[] = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'];
const gradFor = (id: string) => GRADS[[...id].reduce((h, ch) => h + ch.charCodeAt(0), 0) % GRADS.length];

function OrderRow({ o, onPress }: { o: KitchenOrderRow; onPress: () => void }) {
  const c = useC();
  const s = STATUS[o.status as UiStatus] ?? STATUS.confirmed;
  const title = o.first_item_name ? `${o.first_item_name}${o.item_count > 1 ? ` +${o.item_count - 1} more` : ''}` : `${o.item_count} item${o.item_count === 1 ? '' : 's'}`;
  return (
    <Press scale={0.99} onPress={onPress}>
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

  const load = useCallback(() => {
    fetchKitchenOrders().then(setOrders).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const active = orders.filter((o) => o.status !== 'completed');
  const past = orders.filter((o) => o.status === 'completed');
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
        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
        ) : list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 60 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="box" size={28} color={c.muted} />
            </View>
            <Text style={[type(16, 900), { color: c.ink }]}>Nothing here yet</Text>
            <Text style={[type(13.5, 500), { color: c.soft, marginTop: 5, textAlign: 'center' }]}>New orders will appear the moment they come in.</Text>
          </View>
        ) : (
          list.map((o) => <OrderRow key={o.order_id} o={o} onPress={() => router.push(`/hub/order/${o.order_id}`)} />)
        )}
      </ScrollView>
    </View>
  );
}
