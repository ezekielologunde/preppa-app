import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, GradKey } from '../../src/theme/theme';
import { Stepper } from '../../src/ui';
import { Screen, TopBar, Dock } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { PhotoPick, KField, KInput, MoneyInput, KChoice, KBtn } from '../(tabs)/my-hub';

const CATS = ['Comfort', 'Pasta', 'Healthy', 'Soul food', 'Halal', 'Dessert', 'Seafood'];
const DIETS = ['Vegetarian', 'Gluten-free', 'Halal', 'Dairy-free', 'Nut-free'];

export default function CreateMealFlow() {
  const c = useC();
  const router = useRouter();
  const [grad, setGrad] = useState<GradKey | null>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [serves, setServes] = useState(2);
  const [cat, setCat] = useState('Comfort');
  const [diet, setDiet] = useState<string[]>([]);
  const [qty, setQty] = useState('');
  const [done, setDone] = useState(false);
  const toggleD = (d: string) => setDiet((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const valid = !!name.trim() && !!price;

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst title="Meal published" body={`${name} is now live on your menu — customers near you can order it right away.`} actionLabel="Done" onAction={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title="Add a meal" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 20 }}><PhotoPick grad={grad} setGrad={setGrad} /></View>
        <KField label="Dish name"><KInput value={name} onChange={setName} placeholder="e.g. Family Lasagna Tray" /></KField>
        <KField label="Description" hint="tell the story"><KInput value={desc} onChange={setDesc} placeholder="Layered fresh pasta, slow-simmered ragù, three cheeses…" multiline /></KField>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <KField label="Price"><MoneyInput value={price} onChange={setPrice} /></KField>
          </View>
          <View style={{ flex: 1 }}>
            <KField label="Serves">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50, paddingLeft: 14, paddingRight: 6, backgroundColor: c.bg2, borderRadius: 13 }}>
                <Text style={[type(15, 800), { color: c.ink }]}>{serves}</Text>
                <Stepper sm value={serves} onDec={() => setServes(Math.max(1, serves - 1))} onInc={() => setServes(serves + 1)} />
              </View>
            </KField>
          </View>
        </View>
        <KField label="Category">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {CATS.map((x) => <KChoice key={x} label={x} on={cat === x} onPress={() => setCat(x)} />)}
          </View>
        </KField>
        <KField label="Dietary" hint="optional">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {DIETS.map((x) => <KChoice key={x} label={x} on={diet.includes(x)} onPress={() => toggleD(x)} check />)}
          </View>
        </KField>
        <KField label="Daily quantity" hint="how many you can make"><KInput value={qty} onChange={setQty} placeholder="e.g. 12 trays per day" /></KField>
      </ScrollView>
      <Dock>
        <KBtn label="Publish meal" variant="pri" block onPress={() => valid && setDone(true)} style={{ opacity: valid ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}
