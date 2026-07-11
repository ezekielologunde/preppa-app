import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { Icon, GradBox } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { money } from '../../src/data/data';
import { KSec, KBtn } from '../(tabs)/my-hub';
import { fetchMyPlans, type Plan } from '../../src/lib/subscriptions';

// What a subscriber is billed weekly (cook price + 10% service fee); the cook nets the
// cook price less the Stripe fee.
const weekly = (cents: number) => money((cents + Math.round(cents * 0.1)) / 100);

export default function PlansScreen() {
  const c = useC();
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setPlans(await fetchMyPlans());
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <TopBar title="Meal plans" sub={loading ? '' : `${plans.length} plan${plans.length !== 1 ? 's' : ''}`} onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <View style={{ marginHorizontal: 20, backgroundColor: c.primaryL, borderRadius: 18, padding: 16, flexDirection: 'row', gap: 11, alignItems: 'flex-start' }}>
          <Icon name="spark" size={19} color={c.primary} />
          <Text style={[type(12.5, 600), { color: c.primaryD, lineHeight: 19, flex: 1 }]}>Plans are a weekly box of your meals. Subscribers are billed automatically every week — your earnings land in Earnings, net of the Stripe fee.</Text>
        </View>

        <KSec title="Your plans" />
        {loading ? (
          <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : plans.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 30, paddingHorizontal: 24 }}>
            <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name="repeat" size={25} color={c.muted} /></View>
            <Text style={[type(16, 900), { color: c.ink, marginTop: 12 }]}>No plans yet</Text>
            <Text style={[type(13, 600), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 280, lineHeight: 19 }]}>Bundle a few of your meals into a weekly box customers can subscribe to.</Text>
          </View>
        ) : (
          plans.map((p) => {
            const totalMeals = p.items.reduce((n, i) => n + i.qty, 0);
            return (
              <View key={p.id} style={{ marginHorizontal: 20, marginBottom: 14, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: 20, padding: 16, ...shadow.card }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
                  <GradBox grad={['#A855F7', c.purple]} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="repeat" size={20} color="#fff" />
                  </GradBox>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[type(15, 900), { color: c.ink, letterSpacing: -0.2 }]}>{p.name}</Text>
                    <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{totalMeals} meal{totalMeals !== 1 ? 's' : ''}/wk · {p.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[type(16, 900), { color: c.ink, letterSpacing: -0.3 }]}>{weekly(p.priceCents)}</Text>
                    <Text style={[type(11, 700), { color: c.muted }]}>/week</Text>
                  </View>
                </View>
                {p.items.length > 0 ? (
                  <Text numberOfLines={2} style={[type(12.5, 600), { color: c.ink2, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: c.border2 }]}>{p.items.map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name)).join(' · ')}</Text>
                ) : null}
              </View>
            );
          })
        )}
        <View style={{ paddingHorizontal: 20, paddingTop: 2 }}>
          <KBtn label="New meal plan" variant="pri" block icon="plus" onPress={() => router.push('/hub/create-plan')} />
        </View>
      </ScrollView>
    </Screen>
  );
}
