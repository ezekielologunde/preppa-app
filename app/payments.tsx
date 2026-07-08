import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, MiniTag, Empty } from '../src/ui/layout';

/** Infer a card brand from the leading digit (offline heuristic — no network). */
function brandOf(num: string): string {
  const d = num.replace(/\D/g, '')[0];
  if (d === '4') return 'Visa';
  if (d === '5' || d === '2') return 'Mastercard';
  if (d === '3') return 'Amex';
  if (d === '6') return 'Discover';
  return 'Card';
}

export default function Payments() {
  const c = useC();
  const router = useRouter();
  const { select } = useLocalSearchParams<{ select?: string }>();
  const selecting = select === '1';
  const { cards, cardId, selectCard, removeCard, addCard, toast } = useStore();

  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState('');
  const [exp, setExp] = useState('');

  const pick = (id: string) => {
    selectCard(id);
    if (selecting) {
      toast('Payment method updated', 'card', true);
      router.back();
    }
  };

  const save = () => {
    const digits = num.replace(/\D/g, '');
    if (digits.length < 4) { toast('Enter a valid card number', 'info'); return; }
    if (!/^\d{2}\/\d{2}$/.test(exp.trim())) { toast('Enter expiry as MM/YY', 'info'); return; }
    addCard({ brand: brandOf(digits), last4: digits.slice(-4), exp: exp.trim() });
    setNum(''); setExp(''); setAdding(false);
    toast('Card added', 'card', true);
  };

  return (
    <Screen>
      <TopBar title="Payment methods" sub={selecting ? 'Pick one' : undefined} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {cards.length === 0 && !adding ? (
          <Empty icon="card" title="No cards yet" body="Add a card, or pay cash on delivery." />
        ) : null}

        {cards.map((card) => {
          const on = card.id === cardId;
          return (
            <Press key={card.id} scale={0.99} onPress={() => pick(card.id)} label={`Use ${card.brand} ending ${card.last4}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, borderRadius: radius.card }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: on ? c.surface : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="card" size={20} color={on ? c.primary : c.ink} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                    <Text numberOfLines={1} style={[type(14.5, 800), { color: c.ink }]}>{card.brand} •••• {card.last4}</Text>
                    {on ? <MiniTag label="Default" tone="green" /> : null}
                  </View>
                  <Text style={[type(12.5, 500), { color: c.soft, marginTop: 3 }]}>Expires {card.exp}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                    {on ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: c.primary }} /> : null}
                  </View>
                  <Press scale={0.9} onPress={() => { removeCard(card.id); toast('Card removed', 'x'); }} label={`Remove ${card.brand} ending ${card.last4}`} hitSlop={8}>
                    <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="x" size={16} color={c.muted} />
                    </View>
                  </Press>
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
        {adding ? (
          <View style={{ padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: c.border2, backgroundColor: c.surface, gap: 10 }}>
            <Text style={[type(14, 900), { color: c.ink }]}>Add a card</Text>
            <Field c={c} value={num} onChange={setNum} placeholder="Card number" keyboardType="number-pad" />
            <Field c={c} value={exp} onChange={setExp} placeholder="Expiry · MM/YY" keyboardType="numbers-and-punctuation" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 2 }}>
              <Btn label="Cancel" variant="ghost" flex={1} onPress={() => { setAdding(false); setNum(''); setExp(''); }} />
              <Btn label="Save card" icon="check" flex={1} onPress={save} />
            </View>
          </View>
        ) : (
          <Btn label="Add card" icon="plus" variant="ghost" block onPress={() => setAdding(true)} />
        )}

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 6, paddingHorizontal: 4 }}>
          <Icon name="lock" size={14} color={c.muted} />
          <Text style={[type(12, 500), { color: c.muted, flex: 1, lineHeight: 18 }]}>Payments are processed securely by Stripe — Preppa never stores your full card number.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Field({ c, value, onChange, placeholder, keyboardType }: { c: any; value: string; onChange: (t: string) => void; placeholder: string; keyboardType?: any }) {
  const [f, setF] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      keyboardType={keyboardType}
      onFocus={() => setF(true)}
      onBlur={() => setF(false)}
      style={[type(15, 600), { color: c.ink, backgroundColor: f ? c.surface : c.bg2, borderWidth: 1.5, borderColor: f ? c.primary : 'transparent', borderRadius: 13, height: 50, paddingHorizontal: 15 }]}
    />
  );
}
