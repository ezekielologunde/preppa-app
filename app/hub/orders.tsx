import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox } from '../../src/ui';
import { money } from '../../src/data/data';
import { ORDERS, myMeal, CookOrder, OrderStatus } from '../../src/data/cook';
import { HubHeader, KSeg, KPill } from '../(tabs)/my-hub';

const STATUS: Record<OrderStatus, { label: string; bg: (c: any) => string; fg: (c: any) => string; dot?: boolean }> = {
  new: { label: 'New', bg: (c) => c.primaryL, fg: (c) => c.primaryD },
  prep: { label: 'Preparing', bg: (c) => '#FEF3E2', fg: () => '#B45309' },
  ready: { label: 'Ready', bg: (c) => '#E6F0FE', fg: () => '#2563EB' },
  done: { label: 'Done', bg: (c) => c.bg2, fg: (c) => c.soft },
};

function OrderRow({ o, onPress }: { o: CookOrder; onPress: () => void }) {
  const c = useC();
  const m = myMeal(o.meal);
  const s = STATUS[o.status];
  return (
    <Press scale={0.99} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 16, padding: 13, marginHorizontal: 20, marginBottom: 10 }}>
        <GradBox grad={m.grad} style={{ width: 50, height: 50, borderRadius: 13 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink, letterSpacing: -0.3 }]}>{m.name}</Text>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{o.cust} · {o.qty}× · {o.mode === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
          <View style={{ marginTop: 5 }}>
            <KPill label={s.label} bg={s.bg(c)} fg={s.fg(c)} dot={o.status === 'new'} />
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.3 }]}>{money(o.total)}</Text>
          <Text style={[type(11.5, 700), { color: c.muted, marginTop: 4 }]}>{o.when}</Text>
        </View>
      </View>
    </Press>
  );
}

export default function OrdersScreen() {
  const c = useC();
  const router = useRouter();
  const [seg, setSeg] = useState('active');
  const active = ORDERS.filter((o) => o.status !== 'done');
  const past = ORDERS.filter((o) => o.status === 'done');
  const groups: [string | null, CookOrder[]][] =
    seg === 'past'
      ? [['Yesterday', past.filter((o) => o.day === 'yesterday')], ['Earlier', past.filter((o) => o.day === 'earlier')]]
      : [[null, active]];
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
        {list.length === 0 ? (
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 60 }}>
            <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Icon name="box" size={28} color={c.muted} />
            </View>
            <Text style={[type(16, 900), { color: c.ink }]}>Nothing here yet</Text>
            <Text style={[type(13.5, 500), { color: c.soft, marginTop: 5, textAlign: 'center' }]}>New orders will appear the moment they come in.</Text>
          </View>
        ) : null}
        {groups.map(([label, items], gi) =>
          items.length > 0 ? (
            <React.Fragment key={gi}>
              {label ? <Text style={[type(12, 900), { color: c.muted, letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }]}>{label}</Text> : null}
              {items.map((o) => <OrderRow key={o.id} o={o} onPress={() => router.push(`/hub/order/${o.id}`)} />)}
            </React.Fragment>
          ) : null,
        )}
      </ScrollView>
    </View>
  );
}
