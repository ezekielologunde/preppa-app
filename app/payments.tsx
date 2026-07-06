import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, MiniTag } from '../src/ui/layout';

interface Card { id: string; brand: string; last4: string; exp: string; }

const CARDS: Card[] = [
  { id: 'visa', brand: 'Visa', last4: '4242', exp: '08/27' },
  { id: 'mc', brand: 'Mastercard', last4: '8210', exp: '11/26' },
];

export default function Payments() {
  const c = useC();
  const { toast } = useStore();
  const [selected, setSelected] = useState('visa');

  return (
    <Screen>
      <TopBar title="Payment methods" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {CARDS.map((card) => {
          const on = card.id === selected;
          return (
            <Press key={card.id} scale={0.99} onPress={() => { setSelected(card.id); toast('Default card updated', 'card', true); }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, borderRadius: radius.card }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: on ? c.surface : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="card" size={20} color={on ? c.primary : c.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text style={[type(14.5, 800), { color: c.ink }]}>{card.brand} •••• {card.last4}</Text>
                    {on ? <MiniTag label="Default" tone="green" /> : null}
                  </View>
                  <Text style={[type(12.5, 500), { color: c.soft, marginTop: 3 }]}>Expires {card.exp}</Text>
                </View>
                <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : null}
                </View>
              </View>
            </Press>
          );
        })}

        {/* cash on delivery — always available */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface, borderRadius: radius.card }}>
          <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.purpleL, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="wallet" size={20} color={c.purple} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Text style={[type(14.5, 800), { color: c.ink }]}>Cash on delivery</Text>
              <MiniTag label="Always on" tone="purple" />
            </View>
            <Text style={[type(12.5, 500), { color: c.soft, marginTop: 3 }]}>Pay in cash with QR handoff at the door</Text>
          </View>
        </View>

        <View style={{ height: 4 }} />
        <Btn label="Add card" icon="plus" variant="ghost" block onPress={() => toast('Add card — demo')} />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6, paddingHorizontal: 4 }}>
          <Icon name="lock" size={14} color={c.muted} />
          <Text style={[type(12, 500), { color: c.muted, flex: 1, lineHeight: 18 }]}>Payments are securely processed by Stripe. Preppa never stores your card number.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
