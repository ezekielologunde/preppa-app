import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../../src/theme/ThemeContext';
import { type } from '../../../src/theme/theme';
import { useStore } from '../../../src/store/store';
import { Icon, Press, GradBox } from '../../../src/ui';
import { Screen, TopBar, Dock, Empty } from '../../../src/ui/layout';
import { money } from '../../../src/data/data';
import { fetchKitchenOrderDetail, updateOrderStatus, declineOrder, timeAgo, type KitchenOrderDetail, type KitchenOrderStatus } from '../../../src/lib/orders';
import { KBtn } from '../../(tabs)/my-hub';
import { openThreadAsKitchen } from '../../../src/lib/messages';

const FLOW: KitchenOrderStatus[] = ['confirmed', 'preparing', 'ready', 'completed'];
const LABELS: Record<KitchenOrderStatus, string> = { pending: 'Awaiting payment', confirmed: 'New', preparing: 'Preparing', ready: 'Ready', completed: 'Completed', cancelled: 'Cancelled' };
const NEXT: Partial<Record<KitchenOrderStatus, KitchenOrderStatus>> = { confirmed: 'preparing', preparing: 'ready', ready: 'completed' };

export default function OrderDetail() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useStore();
  const [o, setO] = useState<KitchenOrderDetail | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [openingChat, setOpeningChat] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setO(undefined);
    setLoadError('');
    fetchKitchenOrderDetail(id)
      .then(setO)
      .catch((e: any) => {
        setLoadError(e?.message || 'Could not load this order.');
        setO(null);
      });
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
  if (loadError) {
    return (
      <Screen>
        <TopBar title="Order" onBack={() => router.back()} />
        <Empty icon="info" title="Could not load order" body={loadError} action={<KBtn label="Try again" variant="pri" onPress={load} />} />
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
  const isPaid = o.pay_status === 'paid';
  const idx = FLOW.indexOf(status);
  const isPickup = o.fulfillment === 'pickup';
  const nextLbl: Partial<Record<KitchenOrderStatus, string>> = { confirmed: 'Accept & start cooking', preparing: 'Mark ready', ready: isPickup ? 'Mark picked up' : 'Mark delivered' };
  const next = isPaid ? NEXT[status] : undefined;

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

  const cancelOrder = async () => {
    if (cancelling) return;
    setCancelling(true);
    try {
       const { refunded } = await declineOrder(o.order_id, cancelReason.trim() || undefined);
      toast(refunded ? 'Order cancelled — customer refunded' : 'Order cancelled', 'check', true);
      setConfirmCancel(false);
      load();
    } catch (e: any) {
      toast(e?.message || 'Could not cancel the order', 'info');
    } finally {
      setCancelling(false);
    }
  };
  const canCancel = isPaid && status !== 'completed' && status !== 'cancelled';
  const messageCustomer = async () => {
    if (openingChat) return;
    setOpeningChat(true);
    try {
      const threadId = await openThreadAsKitchen(o.buyer_id, 'order', o.order_id);
      router.push(`/messages/${threadId}`);
    } catch (e: any) {
      toast(e?.message || 'Could not open this conversation. Please try again.', 'info');
    } finally {
      setOpeningChat(false);
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
              <Text style={[type(12.5, 600), { color: isPaid ? c.soft : c.red, marginTop: 2 }]}>{isPickup ? 'Picking up' : 'Delivery'} · {isPaid ? 'Paid' : o.pay_status === 'refunded' ? 'Refunded' : 'Payment not confirmed'}</Text>
            </View>
            <Press scale={0.9} onPress={messageCustomer} disabled={openingChat} label={`Message ${o.buyer_name ?? 'customer'}`}>
              <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                {openingChat ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="chat" size={16} color={c.ink2} />}
              </View>
            </Press>
          </View>
          {!isPickup ? (
            <View accessibilityRole={o.delivery_address_text ? undefined : 'alert'} style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border2, flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
              <Icon name="pin" size={16} color={o.delivery_address_text ? c.primary : c.red} />
              <View style={{ flex: 1, gap: 9 }}>
                <View>
                  <Text style={[type(11.5, 800), { color: c.muted, textTransform: 'uppercase' }]}>Delivery address</Text>
                  <Text style={[type(13.5, 700), { color: o.delivery_address_text ? c.ink : c.red, marginTop: 3, lineHeight: 19 }]}>{o.delivery_address_text || 'Address unavailable. Contact the customer before preparing this order.'}</Text>
                </View>
                {o.delivery_instructions ? (
                  <View>
                    <Text style={[type(11.5, 800), { color: c.muted, textTransform: 'uppercase' }]}>Customer instructions</Text>
                    <Text style={[type(13.5, 700), { color: c.ink, marginTop: 3, lineHeight: 19 }]}>{o.delivery_instructions}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>

        {status === 'cancelled' ? (
          <View accessibilityRole="alert" style={{ marginHorizontal: 20, backgroundColor: c.redL, borderWidth: 1, borderColor: c.red, borderRadius: 16, padding: 14 }}>
            <Text style={[type(14, 900), { color: c.red }]}>This order is cancelled</Text>
            <Text style={[type(12.5, 600), { color: c.red, marginTop: 4, lineHeight: 18 }]}>No more fulfillment actions are available for this order.</Text>
          </View>
        ) : null}

        {!isPaid && status !== 'cancelled' ? (
          <View accessibilityRole="alert" style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: c.amberL, borderWidth: 1, borderColor: c.amber, borderRadius: 16, padding: 14 }}>
            <Text style={[type(14, 900), { color: c.ink }]}>Wait for payment confirmation</Text>
            <Text style={[type(12.5, 600), { color: c.soft, marginTop: 4, lineHeight: 18 }]}>Do not start preparing this order. Fulfillment actions will appear after payment is confirmed.</Text>
          </View>
        ) : null}

        {/* progress */}
        {status !== 'cancelled' ? <View style={{ marginHorizontal: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16 }}>
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
        </View> : null}

        {canCancel ? (
          confirmCancel ? (
            <View style={{ marginHorizontal: 20, marginTop: 14, backgroundColor: c.redL, borderWidth: 1, borderColor: c.red, borderRadius: 16, padding: 14 }}>
              <Text style={[type(13, 800), { color: c.red }]}>Cancel this order?</Text>
              <Text style={[type(12, 600), { color: c.red, marginTop: 3, lineHeight: 17 }]}>The customer will be refunded automatically.</Text>
              <Text style={[type(12, 800), { color: c.ink, marginTop: 12, marginBottom: 6 }]}>Reason for the customer (optional)</Text>
              <TextInput
                value={cancelReason}
                onChangeText={setCancelReason}
                placeholder="For example: ingredient unavailable"
                placeholderTextColor={c.muted}
                accessibilityLabel="Cancellation reason for the customer"
                maxLength={240}
                multiline
                style={[type(14, 500), { color: c.ink, minHeight: 52, borderWidth: 1, borderColor: c.border, borderRadius: 12, backgroundColor: c.surface, paddingHorizontal: 12, paddingVertical: 10 }]}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <KBtn label="Never mind" variant="ghost" flex={1} onPress={() => setConfirmCancel(false)} />
                <KBtn label={cancelling ? 'Cancelling…' : 'Yes, cancel'} flex={1} onPress={cancelOrder} style={{ backgroundColor: c.red }} />
              </View>
            </View>
          ) : (
            <Press scale={0.98} onPress={() => setConfirmCancel(true)} style={{ marginTop: 16, alignSelf: 'center' }}>
              <Text style={[type(13, 700), { color: c.red }]}>Cancel order</Text>
            </Press>
          )
        ) : null}
      </ScrollView>
      {next ? (
        <Dock>
          <KBtn label={busy ? 'Saving…' : nextLbl[status] ?? 'Next'} variant="pri" block onPress={advance} />
        </Dock>
      ) : null}
    </Screen>
  );
}
