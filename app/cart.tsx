import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { COOKS, CookId, money, thumb } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, GradBox, Avatar, Stepper, Btn } from '../src/ui';
import { Screen, TopBar, Empty } from '../src/ui/layout';
import { ModeToggle } from '../src/components/ModeToggle';

export default function Cart() {
  const c = useC();
  const router = useRouter();
  const { cart, cartCount, setQty, removeLine } = useStore();

  if (cart.length === 0) {
    return (
      <Screen>
        <TopBar title="Your cart" />
        <Empty icon="cart" title="Your cart is empty" body="Find something homemade from a cook near you." action={<Btn label="Browse meals" onPress={() => { router.back(); router.replace('/home'); }} />} />
      </Screen>
    );
  }

  const cooks = Array.from(new Set(cart.map((l) => l.cook))) as CookId[];

  return (
    <Screen>
      <TopBar title="Your cart" sub={`${cartCount} item${cartCount !== 1 ? 's' : ''} · ${cooks.length} kitchen${cooks.length !== 1 ? 's' : ''}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14 }}>
          <Text style={[type(13, 800), { color: c.soft }]}>How you’ll get it</Text>
          <ModeToggle sm />
        </View>

        {cooks.map((ck) => {
          const lines = cart.filter((l) => l.cook === ck);
          const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
          const cook = COOKS[ck];
          return (
            <View key={ck} style={{ marginHorizontal: 16, marginTop: 14, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, backgroundColor: c.surface, overflow: 'hidden' }}>
              <Press scale={0.99} onPress={() => router.push(`/store/${ck}`)} label={`${cook.name}'s kitchen`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                  <Avatar cook={ck} size={34} rad={11} />
                  <Text style={[type(14.5, 900), { color: c.ink, flex: 1, letterSpacing: -0.2 }]}>{cook.name}</Text>
                  <Text style={[type(13, 700), { color: c.soft }]}>{lines.length} item{lines.length !== 1 ? 's' : ''}</Text>
                </View>
              </Press>
              {lines.map((l) => (
                <View key={l.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                  <GradBox grad={l.grad} img={thumb(l.img)} style={{ width: 52, height: 52, borderRadius: radius.md }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[type(14, 800), { color: c.ink }]}>{l.name}</Text>
                    <Text style={[type(14, 900), { color: c.primary, marginTop: 4 }]}>{money(l.price * l.qty)}</Text>
                  </View>
                  {l.qty <= 1 ? (
                    <Press scale={0.9} onPress={() => removeLine(l.key)} label="Remove item" hitSlop={8}>
                      <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="x" size={16} color={c.muted} />
                      </View>
                    </Press>
                  ) : (
                    <Stepper sm value={l.qty} onDec={() => setQty(l.key, l.qty - 1)} onInc={() => setQty(l.key, l.qty + 1)} />
                  )}
                </View>
              ))}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type(11.5, 700), { color: c.muted }]}>Subtotal</Text>
                  <Text style={[type(16, 900), { color: c.ink }]}>{money(subtotal)}</Text>
                </View>
                <Btn label="Checkout" iconRight="arrow" onPress={() => router.push(`/checkout?cook=${ck}`)} />
              </View>
            </View>
          );
        })}

        {cooks.length > 1 ? (
          <Text style={[type(12, 600), { color: c.muted, textAlign: 'center', marginTop: 16, marginHorizontal: 32, lineHeight: 18 }]}>Ordering from more than one kitchen? Each checks out separately.</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
