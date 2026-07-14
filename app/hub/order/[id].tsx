import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../../src/theme/ThemeContext';
import { type } from '../../../src/theme/theme';
import { useStore } from '../../../src/store/store';
import { Icon, Press, GradBox } from '../../../src/ui';
import { Screen, TopBar, Dock, Empty } from '../../../src/ui/layout';
import { money } from '../../../src/data/data';
import { fetchKitchenOrderDetail, updateOrderStatus, timeAgo, type KitchenOrderDetail, type KitchenOrderStatus } from '../../../src/lib/orders';
import { KBtn } from '../../(tabs)/my-hub';

const FLOW: KitchenOrderStatus[] = ['confirmed', 'preparing', 'ready', 'completed'];
const LABELS: Record<KitchenOrderStatus, string> = { confirmed: 'New', preparing: 'Preparing', ready: 'Ready', completed: 'Completed' };
const NEXT: Partial<Record<KitchenOrderStatus, KitchenOrderStatus>> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' };

export default function OrderDetail() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useStore();
  const [o, setO] = useState<KitchenOrderDetail | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    fetchKitchenOrderDetail(id).then(setO).catch(() => setO(null));
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (o === undefined) {
    return (
      <Screen>
        <TopBar title="Order" onBack={() => router.back()} />
        <ActivityIndicator style={{ marginTop: 60 }} color={c.primary} />
      </Screen>
    );
  }
  if (!o) {
    return (
      <Screen>
        <TopBar title="Order" onBack={() => router.back()} />
        <Empty icon="ticket" title="Order not found" body="This order isn’t available." />
      </Screen>
    );
  }

  const status = (o.status as KitchenOrderStatus) ?? 'confirmed';
  const idx = FLOW.indexOf(status);
  const isPickup = o.fulfillment === 'pickup';
  const nextLbl: Partial<Record<KitchenOrderStatus, string>> = { confirmed: 'Accept & start cooking', preparing: 'Mark ready', ready: isPickup ? 'Mark picked up' : 'Mark delivered' };
  const next = NEXT[status];

  const advance = async () => {
    if (!next || busy) return;
    setBusy(true);
    try {
      await updateOrderStatus(o.order_id, next);
      toast(nextLbl[status] ?? 'Updated', 'check', true);
      load();
    } catch (e: any) {
      toast(e?.message || 'Could not update the order', 'info');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title={`Order ${o.order_id.slice(0, 8)}`} sub={timeAgo(o.created_at)} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 120 }}>
        {/* summary */}
        <View style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, gap: 8 }}>
          {o.items.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[type(14, 700), { color: c.ink }]}>{it.qty}× {it.name}</Text>
              <Text style={[type(14, 700), { color: c.ink }]}>{money((it.unit_price_cents * it.qty) / 100)}</Text>
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: c.border2, marginVertical: 4 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={[type(15, 900), { color: c.ink }]}>Total</Text>
            <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{money(o.total_cents / 100)}</Text>
          </View>
          <Text style={[type(12.5, 600), { color: c.soft }]}>{isPickup ? 'Pickup' : 'Delivery'} · {LABELS[status]}</Text>
        </View>

        {/* customer */}
        <View style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16 }}>
          <Text style={[type(13, 900), { color: c.ink, marginBottom: 13 }]}>Customer</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <GradBox grad="g8" style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(19, 900), { color: '#fff' }]}>{(o.buyer_name ?? '?')[0]}</Text>
            </GradBox>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.2 }]}>{o.buyer_name ?? 'Customer'}</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{isPickup ? 'Picking up' : 'Delivery'} · {o.method === 'cod' ? 'Cash on delivery' : 'Paid'}</Text>
            </View>
            <Press scale={0.9} onPress={() => toast('Open Messages to reply', 'chat')}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chat" size={16} color={c.ink2} />
              </View>
            </Press>
          </View>
        </View>

        {/* progress */}
        <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16 }}>
          <Text style={[type(13, 900), { color: c.ink, marginBottom: 4 }]}>Progress</Text>
          {FLOW.map((s, i) => {
            const reached = i <= idx;
            return (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: reached ? c.green : c.bg2 }}>
                  {reached ? <Icon name="check" size={14} color="#fff" /> : <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.muted }} />}
                </View>
                <Text style={[type(14, i === idx ? 900 : 700), { color: reached ? c.ink : c.muted }]}>{LABELS[s]}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
      {next ? (
        <Dock>
          <KBtn label={busy ? 'Saving…' : nextLbl[status] ?? 'Next'} variant="pri" block onPress={advance} />
        </Dock>
      ) : null}
    </Screen>
  );
}
