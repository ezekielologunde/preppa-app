import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../../../src/theme/ThemeContext';
import { type } from '../../../src/theme/theme';
import { useStore } from '../../../src/store/store';
import { Icon, Press, GradBox } from '../../../src/ui';
import { Screen, TopBar, Dock, Empty } from '../../../src/ui/layout';
import { money } from '../../../src/data/data';
import { orderById, myMeal, OrderStatus } from '../../../src/data/cook';
import { KBtn } from '../../(tabs)/my-hub';

const FLOW: OrderStatus[] = ['new', 'prep', 'ready', 'done'];
const LABELS: Record<OrderStatus, string> = { new: 'New', prep: 'Preparing', ready: 'Ready', done: 'Completed' };
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = { new: 'prep', prep: 'ready', ready: 'done' };

export default function OrderDetail() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useStore();
  const o = orderById(id!);
  const m = o ? myMeal(o.meal) : undefined;
  const [status, setStatus] = useState<OrderStatus>(o?.status ?? 'new');
  if (!o || !m) {
    return (
      <Screen>
        <TopBar title="Order" onBack={() => router.back()} />
        <Empty icon="ticket" title="Order not found" body="This order isn’t available." />
      </Screen>
    );
  }
  const idx = FLOW.indexOf(status);
  const nextLbl: Record<string, string> = { new: 'Accept & start cooking', prep: 'Mark ready', ready: o.mode === 'pickup' ? 'Mark picked up' : 'Mark delivered' };
  const next = NEXT[status];

  return (
    <Screen>
      <TopBar title={`Order ${o.id}`} sub={o.when} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 120 }}>
        {/* summary */}
        <View style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
          <GradBox grad={m.grad} style={{ width: 54, height: 54, borderRadius: 15 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{o.qty}× {m.name}</Text>
            <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{o.mode === 'pickup' ? 'Pickup' : 'Delivery'} · {LABELS[status]}</Text>
          </View>
          <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{money(o.total)}</Text>
        </View>

        {/* customer */}
        <View style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16 }}>
          <Text style={[type(13, 900), { color: c.ink, marginBottom: 13 }]}>Customer</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <GradBox grad="g8" style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(19, 900), { color: '#fff' }]}>{o.cust[0]}</Text>
            </GradBox>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.2 }]}>{o.cust}</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{o.mode === 'pickup' ? 'Picking up · 412 Elm St' : '88 Highland Ave NE · Apt 4'}</Text>
            </View>
            <Press scale={0.9} onPress={() => toast('Message ' + o.cust, 'chat')}>
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
          <KBtn label={nextLbl[status]} variant="pri" block onPress={() => { setStatus(next); toast(nextLbl[status], 'check', true); }} />
        </Dock>
      ) : null}
    </Screen>
  );
}
