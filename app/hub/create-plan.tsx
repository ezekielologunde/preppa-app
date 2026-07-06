import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, GradKey } from '../../src/theme/theme';
import { Icon, Stepper } from '../../src/ui';
import { Screen, TopBar, Dock, DockTotal } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { money } from '../../src/data/data';
import { PhotoPick, KField, KInput, MoneyInput, KSeg, KBtn } from '../(tabs)/my-hub';

export default function CreatePlanFlow() {
  const c = useC();
  const router = useRouter();
  const [grad, setGrad] = useState<GradKey | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [count, setCount] = useState(3);
  const [cadence, setCadence] = useState('week');
  const [done, setDone] = useState(false);
  const valid = !!name.trim() && !!price;

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst title="Plan created" body={`${name} is live. Customers can subscribe and you’ll earn ${money(Number(price) || 0)} per ${cadence}, automatically.`} actionLabel="Back to plans" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title="Create a meal plan" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 20 }}><PhotoPick grad={grad} setGrad={setGrad} /></View>
        <KField label="Plan name"><KInput value={name} onChange={setName} placeholder="e.g. Weeknight Italian Box" /></KField>
        <KField label="What subscribers get"><KInput value={desc} onChange={setDesc} placeholder="Three chef-cooked dinners delivered every week, rotating menu…" multiline /></KField>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <KField label="Price"><MoneyInput value={price} onChange={setPrice} /></KField>
          </View>
          <View style={{ flex: 1 }}>
            <KField label="Meals included">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50, paddingLeft: 14, paddingRight: 6, backgroundColor: c.bg2, borderRadius: 13 }}>
                <Text style={[type(15, 800), { color: c.ink }]}>{count}</Text>
                <Stepper sm value={count} onDec={() => setCount(Math.max(1, count - 1))} onInc={() => setCount(count + 1)} />
              </View>
            </KField>
          </View>
        </View>
        <KField label="Billing cadence">
          <KSeg options={[{ key: 'week', label: 'Per week' }, { key: '2 weeks', label: 'Per 2 weeks' }, { key: 'month', label: 'Per month' }]} value={cadence} onChange={setCadence} />
        </KField>
        <View style={{ marginTop: 22, backgroundColor: c.primaryL, borderRadius: 20, padding: 16, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <Icon name="spark" size={20} color={c.primary} />
          <Text style={[type(13, 600), { color: c.primaryD, lineHeight: 20, flex: 1 }]}>Subscriptions create steady, recurring income. Plans with 3+ meals see the highest sign-up rates.</Text>
        </View>
      </ScrollView>
      <Dock>
        <DockTotal label={`Per ${cadence}`} value={money(Number(price) || 0)} />
        <KBtn label="Publish plan" variant="pri" flex={1} height={48} onPress={() => valid && setDone(true)} style={{ opacity: valid ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}
