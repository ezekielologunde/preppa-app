import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon } from '../../src/ui';
import { Screen, TopBar, Dock } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { money } from '../../src/data/data';
import { BALANCE } from '../../src/data/cook';
import { KField, MoneyInput, KBtn } from '../(tabs)/my-hub';

export default function PayoutFlow() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [amount, setAmount] = useState(BALANCE.available.toFixed(2));
  const [done, setDone] = useState(false);
  const valid = Number(amount) > 0 && Number(amount) <= BALANCE.available;
  const reason = Number(amount) <= 0 ? 'Enter an amount to pay out' : 'Amount exceeds your available balance';
  const submit = () => (valid ? setDone(true) : toast(reason, 'info'));

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Payout on the way"
          body={`${money(Number(amount))} is heading to your Chase account ending 4242. It usually lands in 1–2 business days.`}
          actionLabel="Done"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title="Request payout" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 18, padding: 18, borderRadius: 22, backgroundColor: c.feature, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -50, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(242,107,29,.28)' }} />
          <Text style={[type(12, 800), { color: 'rgba(255,255,255,.6)', letterSpacing: 0.5, textTransform: 'uppercase' }]}>Available to pay out</Text>
          <Text style={[type(34, 900), { color: '#fff', letterSpacing: -1.2, marginTop: 5 }]}>{money(BALANCE.available)}</Text>
        </View>

        <KField label="Amount">
          <MoneyInput value={amount} onChange={setAmount} big />
          <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
            <KBtn label="Pay out everything" variant="ghost" sm onPress={() => setAmount(BALANCE.available.toFixed(2))} />
          </View>
        </KField>

        <KField label="To">
          <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 13 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="bank" size={20} color={c.ink} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.2 }]}>Chase •••• 4242</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>1–2 business days · no fee</Text>
            </View>
            <Icon name="check" size={18} color={c.green} />
          </View>
        </KField>
      </ScrollView>
      <Dock>
        <KBtn label={`Request ${money(Number(amount) || 0)}`} variant="pri" block onPress={submit} style={{ opacity: valid ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}
