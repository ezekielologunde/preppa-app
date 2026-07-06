import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, GradBox } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { MY_PLANS } from '../../src/data/cook';
import { KSec, KBtn } from '../(tabs)/my-hub';

export default function PlansScreen() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const totalSubs = MY_PLANS.reduce((s, p) => s + p.subs, 0);
  const mrr = MY_PLANS.reduce((s, p) => s + p.subs * p.price, 0);

  return (
    <Screen>
      <TopBar title="Meal plans" sub={`${totalSubs} subscribers`} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <View style={{ marginHorizontal: 20, padding: 18, borderRadius: 22, backgroundColor: c.ink, overflow: 'hidden' }}>
          <View style={{ position: 'absolute', right: -50, top: -50, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(242,107,29,.28)' }} />
          <Text style={[type(12, 800), { color: 'rgba(255,255,255,.6)', letterSpacing: 0.5, textTransform: 'uppercase' }]}>Recurring revenue · monthly</Text>
          <Text style={[type(34, 900), { color: '#fff', letterSpacing: -1.2, marginTop: 5 }]}>${Math.round(mrr * 4.3).toLocaleString()}</Text>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
            <View>
              <Text style={[type(15, 900), { color: '#fff', letterSpacing: -0.3 }]}>{totalSubs}</Text>
              <Text style={[type(11.5, 700), { color: 'rgba(255,255,255,.6)', marginTop: 2 }]}>Active subscribers</Text>
            </View>
            <View>
              <Text style={[type(15, 900), { color: '#fff', letterSpacing: -0.3 }]}>{MY_PLANS.length}</Text>
              <Text style={[type(11.5, 700), { color: 'rgba(255,255,255,.6)', marginTop: 2 }]}>Plans</Text>
            </View>
          </View>
        </View>

        <KSec title="Your plans" link="Subscribers & prep" onLink={() => router.push('/hub/subscribers')} />
        {MY_PLANS.map((p) => (
          <View key={p.id} style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <GradBox grad={p.grad} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="repeat" size={20} color="#fff" />
              </GradBox>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[type(15, 900), { color: c.ink, letterSpacing: -0.2 }]}>{p.name}</Text>
                <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{p.meals} delivered weekly</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{money(p.price)}</Text>
                <Text style={[type(11, 700), { color: c.muted }]}>/{p.per}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: c.border2 }}>
              <View>
                <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.5 }]}>{p.subs}</Text>
                <Text style={[type(11.5, 700), { color: c.muted, marginTop: 2 }]}>Subscribers</Text>
              </View>
              <View>
                <Text style={[type(18, 900), { color: c.ink, letterSpacing: -0.5 }]}>{money(p.subs * p.price)}</Text>
                <Text style={[type(11.5, 700), { color: c.muted, marginTop: 2 }]}>Per week</Text>
              </View>
              <View style={{ marginLeft: 'auto' }}>
                <KBtn label="Edit" variant="ghost" sm icon="edit" onPress={() => toast('Edit ' + p.name, 'edit')} />
              </View>
            </View>
          </View>
        ))}
        <View style={{ paddingHorizontal: 20, paddingTop: 2 }}>
          <KBtn label="New meal plan" variant="pri" block icon="plus" onPress={() => router.push('/hub/create-plan')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
