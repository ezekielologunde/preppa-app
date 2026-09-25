import React, { useEffect, useRef, useState } from 'react';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadSequence = useRef(0);
  const saveInFlight = useRef(false);

  const load = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(null);
    try {
      const k = await getMyKitchen();
      if (sequence !== loadSequence.current || !k) return;
      setKitchenId(k.id);
      setDelivery(k.supports_delivery);
      setPickup(k.supports_pickup);
    } catch {
      if (sequence === loadSequence.current) setLoadError('Check your connection and try loading fulfillment settings again.');
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
    // load is intentionally mount-only; toggles update local state directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = async (nextDelivery: boolean, nextPickup: boolean, which: 'delivery' | 'pickup') => {
    if (!kitchenId || saveInFlight.current) return;
    if (!nextDelivery && !nextPickup) {
      toast('You need at least one fulfillment method on.', 'info');
      return;
    }
    const prevDelivery = delivery, prevPickup = pickup;
    saveInFlight.current = true;
    setDelivery(nextDelivery); setPickup(nextPickup); setSaving(which);
    try {
      await setKitchenFulfillment(kitchenId, nextDelivery, nextPickup);
    } catch (e: any) {
      setDelivery(prevDelivery); setPickup(prevPickup);
      toast(e?.message || 'Could not save. Please try again.', 'info');
    } finally {
      saveInFlight.current = false;
      setSaving(null);
    }
  };

  return (
    <Screen>
      <TopBar title="Delivery & pickup" sub="What your kitchen offers customers" onBack={() => router.push('/my-hub')} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        {loading ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : loadError ? (
          <Block>
            <View accessibilityRole="alert" style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Icon name="info" size={24} color={c.red} />
              <Text style={[type(14, 700), { color: c.soft, textAlign: 'center', marginTop: 8, lineHeight: 20 }]}>{loadError}</Text>
              <Press scale={0.97} onPress={load} label="Try loading fulfillment settings again" style={{ marginTop: 14 }}>
                <View style={{ minHeight: 48, paddingHorizontal: 20, borderRadius: radius.md, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center' }}><Text style={[type(14, 800), { color: '#fff' }]}>Try again</Text></View>
              </Press>
            </View>
          </Block>
        ) : !kitchenId ? (
          <Block><Text style={[type(14, 600), { color: c.soft }]}>We couldn’t find your kitchen.</Text></Block>
        ) : (
          <Block>
            <Row
              icon="truck" label="Delivery" body="Customers can have orders brought to them."
              on={delivery} busy={saving === 'delivery'}
              disabled={saving !== null}
              onToggle={() => update(!delivery, pickup, 'delivery')}
            />
            <View style={{ height: 1, backgroundColor: c.border2, marginVertical: 14 }} />
            <Row
              icon="bag" label="Pickup" body="Customers can pick up their order from you."
              on={pickup} busy={saving === 'pickup'}
              disabled={saving !== null}
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

function Row({ icon, label, body, on, busy, disabled, onToggle }: { icon: string; label: string; body: string; on: boolean; busy: boolean; disabled: boolean; onToggle: () => void }) {
  const c = useC();
  return (
    <Press scale={0.99} onPress={disabled ? undefined : onToggle} disabled={disabled}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, opacity: disabled && !busy ? 0.65 : 1 }}>
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
