import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { COOKS, money } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore, CustomerOrder } from '../src/store/store';
import { Icon, Press, GradBox, Btn } from '../src/ui';
import { Screen, TopBar, Empty } from '../src/ui/layout';

const STATUS: Record<CustomerOrder['status'], { label: string; bg: (c: any) => string; fg: (c: any) => string }> = {
  preparing: { label: 'Preparing', bg: (c) => c.primaryL, fg: (c) => c.primaryD },
  ready: { label: 'Ready', bg: (c) => c.greenL, fg: (c) => c.green },
  completed: { label: 'Completed', bg: (c) => c.bg2, fg: (c) => c.soft },
};

export default function Orders() {
  const c = useC();
  const router = useRouter();
  const { orders } = useStore();

  return (
    <Screen>
      <TopBar title="Your orders" sub={orders.length ? `${orders.length} order${orders.length !== 1 ? 's' : ''}` : undefined} />
      {orders.length === 0 ? (
        <Empty icon="ticket" title="No orders yet" body="Your meals will show up here once you order." action={<Btn label="Browse meals" onPress={() => router.replace('/home')} />} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 40 }}>
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
        </ScrollView>
      )}
    </Screen>
  );
}
