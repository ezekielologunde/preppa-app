import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { COOKS, money } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, GradBox, Stepper, Btn } from '../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block, Empty } from '../src/ui/layout';
import { useTotals, Summary } from '../src/components/shared';

const TIPS = [0, 2, 3, 5];

export default function Cart() {
  const c = useC();
  const router = useRouter();
  const { cart, cartCount, setQty, removeLine, tip, setTip, mode } = useStore();
  const t = useTotals(cart, tip, mode);

  if (cart.length === 0) {
    return (
      <Screen>
        <TopBar title="Your cart" />
        <Empty icon="cart" title="Your cart is empty" body="Find something homemade from a cook near you." action={<Btn label="Browse meals" onPress={() => { router.back(); router.replace('/home'); }} />} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Your cart" sub={`${cartCount} item${cartCount !== 1 ? 's' : ''}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {cart.map((l) => (
          <View key={l.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
            <GradBox grad={l.grad} style={{ width: 64, height: 64, borderRadius: radius.md }} />
            <View style={{ flex: 1 }}>
              <Text style={[type(14, 800), { color: c.ink }]}>{l.name}</Text>
              <Text style={[type(11.5, 600), { color: c.soft, marginTop: 1 }]}>by {COOKS[l.cook].name}</Text>
              <Text style={[type(14, 900), { color: c.primary, marginTop: 6 }]}>{money(l.price * l.qty)}</Text>
            </View>
            {l.qty <= 1 ? (
              <Press scale={0.9} onPress={() => removeLine(l.key)}>
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="x" size={16} color={c.muted} />
                </View>
              </Press>
            ) : (
              <Stepper sm value={l.qty} onDec={() => setQty(l.key, l.qty - 1)} onInc={() => setQty(l.key, l.qty + 1)} />
            )}
          </View>
        ))}

        <View style={{ height: 12 }} />
        {t.hasFounder ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.greenL, borderWidth: 1, borderColor: c.green }}>
            <Icon name="shield" size={20} color={c.green} />
            <Text style={[type(12.5, 700), { color: c.green, flex: 1, lineHeight: 18 }]}>Your order includes a founding cook — their service fee is waived for 60 days.</Text>
          </View>
        ) : null}

        <Block title="Add a tip · goes 100% to the cook">
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {TIPS.map((v) => {
              const on = tip === v;
              return (
                <Press key={v} scale={0.95} onPress={() => setTip(v)} style={{ flex: 1 }}>
                  <View style={{ height: 44, borderRadius: radius.sm, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={[type(14, 800), { color: on ? c.primaryD : c.soft }]}>{v === 0 ? 'None' : money(v)}</Text>
                  </View>
                </Press>
              );
            })}
          </View>
        </Block>

        <Summary t={t} mode={mode} />
      </ScrollView>

      <Dock>
        <DockTotal label="Total" value={money(t.total)} />
        <Btn label="Checkout" iconRight="arrow" flex={1} onPress={() => router.push('/checkout')} />
      </Dock>
    </Screen>
  );
}
