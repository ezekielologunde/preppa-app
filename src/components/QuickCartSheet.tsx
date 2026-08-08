import React from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { useStore } from '../store/store';
import { money, thumb, lineKey } from '../data/data';
import { Icon, Press, Btn, Sheet, GradBox, Stepper } from '../ui';

/**
 * Quick cart — a bottom sheet to peek at / edit the cart and jump to checkout
 * without leaving the current screen. The full `/cart` screen still handles
 * per-cook grouping and multi-kitchen checkout.
 */
export function QuickCartSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useC();
  const router = useRouter();
  const { cart, setQty, removeLine } = useStore();
  const cooks = Array.from(new Set(cart.map(lineKey)));
  const total = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const single = cooks.length === 1;
  const go = () => {
    onClose();
    router.push(single ? `/checkout?cook=${cooks[0]}` : '/cart');
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Your cart" scroll>
      {cart.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 26 }}>
          <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="cart" size={26} color={c.muted} />
          </View>
          <Text style={[type(15, 800), { color: c.ink, marginTop: 12 }]}>Your cart is empty</Text>
          <Text style={[type(13, 500), { color: c.soft, marginTop: 3, textAlign: 'center' }]}>Add a meal to get started.</Text>
        </View>
      ) : (
        <>
          {cart.map((l) => (
            <View key={l.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
              <GradBox grad={l.grad} img={thumb(l.img)} fallbackIcon="utensils" fallbackSize={20} style={{ width: 48, height: 48, borderRadius: radius.md }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink }]}>{l.name}</Text>
                <Text style={[type(13, 700), { color: c.soft, marginTop: 2 }]}>{money(l.price * l.qty)}</Text>
              </View>
              {l.qty <= 1 ? (
                <Press scale={0.9} onPress={() => removeLine(l.key)} label="Remove item" hitSlop={8}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="x" size={16} color={c.muted} />
                  </View>
                </Press>
              ) : (
                <Stepper sm value={l.qty} onDec={() => setQty(l.key, l.qty - 1)} onInc={() => setQty(l.key, l.qty + 1)} />
              )}
            </View>
          ))}
          <View style={{ height: 1, backgroundColor: c.border, marginVertical: 10 }} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[type(14, 700), { color: c.soft }]}>Subtotal</Text>
            <Text style={[type(17, 900), { color: c.ink }]}>{money(total)}</Text>
          </View>
          <Btn label={single ? `Checkout · ${money(total)}` : 'View cart'} icon={single ? 'arrow' : 'cart'} block onPress={go} />
          {!single ? <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'center', marginTop: 8 }]}>Multiple kitchens — review and check out each in your cart.</Text> : null}
        </>
      )}
    </Sheet>
  );
}
