import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COOKS, CookId, money } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, Dock, DockTotal, Block, MiniTag, Empty } from '../src/ui/layout';
import { useTotals, Summary } from '../src/components/shared';
import { ModeToggle } from '../src/components/ModeToggle';

const TIPS = [0, 2, 3, 5];

export default function Checkout() {
  const c = useC();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook?: string }>();
  const ck = (cook || undefined) as CookId | undefined;
  const { cart, tip, setTip, mode, placeOrder, address, card } = useStore();
  const lines = ck ? cart.filter((l) => l.cook === ck) : cart;
  const t = useTotals(lines, tip, mode);
  const [pay, setPay] = useState<'online' | 'cod'>('online');
  const [busy, setBusy] = useState(false);
  const theCook = COOKS[ck ?? lines[0]?.cook ?? 'maria'];

  if (lines.length === 0) {
    return (
      <Screen>
        <TopBar title="Checkout" />
        <Empty icon="cart" title="Nothing to check out" body="This kitchen’s items are no longer in your cart." action={<Btn label="Back to cart" onPress={() => router.replace('/cart')} />} />
      </Screen>
    );
  }

  const place = () => {
    if (busy) return; // guard against double-fire / double-order
    setBusy(true);
    if (pay === 'cod') router.push(`/cod?cook=${ck ?? ''}`);
    else { placeOrder('paid', ck); router.replace(`/track?flow=paid&cook=${ck ?? ''}`); }
  };

  return (
    <Screen>
      <TopBar title="Checkout" sub={`From ${theCook.name}`} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <Block title={mode === 'pickup' ? 'Pick up from' : 'Deliver to'}>
          <View style={{ marginBottom: 14 }}><ModeToggle sm /></View>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="pin" size={20} color={c.primary} /></View>
            <View style={{ flex: 1 }}>
              {mode === 'pickup' ? (
                <><Text style={[type(14.5, 800), { color: c.ink }]}>{theCook.kitchen}</Text><Text style={[type(13, 500), { color: c.soft, marginTop: 2 }]}>Pick up · {theCook.dist} away · ready ~25 min</Text></>
              ) : address ? (
                <><Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink }]}>{address.label} · {address.line1}</Text>{address.line2 ? <Text numberOfLines={1} style={[type(13, 500), { color: c.soft, marginTop: 2 }]}>{address.line2}</Text> : null}</>
              ) : (
                <Text style={[type(14, 700), { color: c.primary }]}>Add a delivery address</Text>
              )}
            </View>
            {mode === 'pickup' ? null : (
              <Press scale={0.9} onPress={() => router.push('/addresses?select=1')} label="Change delivery address"><View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}><Icon name="chevRight" size={16} color={c.muted} /></View></Press>
            )}
          </View>
        </Block>

        <Block title="Payment">
          <PayOption on={pay === 'online'} onPress={() => setPay('online')} icon="card" title="Pay online" tag="Stripe" tagTone="green" body={card ? `${card.brand} •••• ${card.last4} · secure checkout` : 'Add a card to pay online'} />
          {pay === 'online' ? (
            <Press scale={0.98} onPress={() => router.push('/payments?select=1')} label="Change payment card">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, marginLeft: 2 }}>
                <Text style={[type(13, 800), { color: c.primary }]}>{card ? 'Change card' : 'Add a card'}</Text>
                <Icon name="chevRight" size={14} color={c.primary} />
              </View>
            </Press>
          ) : null}
          <View style={{ height: 10 }} />
          <PayOption on={pay === 'cod'} onPress={() => setPay('cod')} icon="cash" title="Cash on delivery" tag="QR verified" tagTone="purple" body="Confirm exact amount with a QR + 6-digit code" />
        </Block>

        {pay === 'cod' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 14, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: c.purpleL, borderWidth: 1, borderColor: c.purple }}>
            <Icon name="qr" size={20} color={c.purple} />
            <Text style={[type(12.5, 700), { color: c.purple, flex: 1, lineHeight: 18 }]}>At handoff, you and your cook scan a QR and match a 6-digit code so the cash amount is confirmed by both sides.</Text>
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
        <Btn label={pay === 'cod' ? 'Place order' : `Pay ${money(t.total)}`} flex={1} loading={busy && pay !== 'cod'} onPress={place} />
      </Dock>
    </Screen>
  );
}

function PayOption({ on, onPress, icon, title, tag, tagTone, body }: { on: boolean; onPress: () => void; icon: string; title: string; tag: string; tagTone: 'green' | 'purple'; body: string }) {
  const c = useC();
  return (
    <Press scale={0.99} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, borderRadius: radius.md }}>
        <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: on ? c.surface : c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={on ? c.primary : c.ink} /></View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Text style={[type(14.5, 800), { color: c.ink }]}>{title}</Text><MiniTag label={tag} tone={tagTone} /></View>
          <Text style={[type(12, 500), { color: c.soft, marginTop: 3 }]}>{body}</Text>
        </View>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>{on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : null}</View>
      </View>
    </Press>
  );
}
