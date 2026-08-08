import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, TopBar, Block, Icon, Switch, Press } from '../../src/ui';
import { useStore } from '../../src/store/store';
import { getMyKitchen, setKitchenFulfillment } from '../../src/lib/connect';

/** What this kitchen supports, feeding the customer-facing Home delivery/pickup toggle's
 *  real filter (kitchens.supports_delivery / supports_pickup — audit: previously the toggle
 *  had no effect on browsing because no kitchen had ever declared this). */
export default function HubFulfillment() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [delivery, setDelivery] = useState(true);
  const [pickup, setPickup] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<'delivery' | 'pickup' | null>(null);

  useEffect(() => {
    let alive = true;
    getMyKitchen().then((k) => {
      if (!alive || !k) return;
      setKitchenId(k.id);
      setDelivery(k.supports_delivery);
      setPickup(k.supports_pickup);
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const update = async (nextDelivery: boolean, nextPickup: boolean, which: 'delivery' | 'pickup') => {
    if (!kitchenId) return;
    if (!nextDelivery && !nextPickup) {
      toast('You need at least one fulfillment method on.', 'info');
      return;
    }
    const prevDelivery = delivery, prevPickup = pickup;
    setDelivery(nextDelivery); setPickup(nextPickup); setSaving(which);
    try {
      await setKitchenFulfillment(kitchenId, nextDelivery, nextPickup);
    } catch (e: any) {
      setDelivery(prevDelivery); setPickup(prevPickup);
      toast(e?.message || 'Could not save. Please try again.', 'info');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Screen>
      <TopBar title="Delivery & pickup" sub="What your kitchen offers customers" onBack={() => router.push('/my-hub')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : !kitchenId ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>We couldn’t find your kitchen.</Text></Block>
        ) : (
          <Block>
            <Row
              icon="truck" label="Delivery" body="Customers can have orders brought to them."
              on={delivery} busy={saving === 'delivery'}
              onToggle={() => update(!delivery, pickup, 'delivery')}
            />
            <View style={{ height: 1, backgroundColor: c.border2, marginVertical: 14 }} />
            <Row
              icon="bag" label="Pickup" body="Customers can pick up their order from you."
              on={pickup} busy={saving === 'pickup'}
              onToggle={() => update(delivery, !pickup, 'pickup')}
            />
            <Text style={[type(12, 600), { color: c.muted, marginTop: 16, lineHeight: 18 }]}>
              Turning a method off hides your meals from customers browsing that way — you always need at least one on.
            </Text>
          </Block>
        )}
      </ScrollView>
    </Screen>
  );
}

function Row({ icon, label, body, on, busy, onToggle }: { icon: string; label: string; body: string; on: boolean; busy: boolean; onToggle: () => void }) {
  const c = useC();
  return (
    <Press scale={0.99} onPress={busy ? undefined : onToggle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
        <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={19} color={c.ink2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type(15, 800), { color: c.ink }]}>{label}</Text>
          <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>{body}</Text>
        </View>
        {busy ? <ActivityIndicator size="small" color={c.primary} /> : <Switch on={on} />}
      </View>
    </Press>
  );
}
