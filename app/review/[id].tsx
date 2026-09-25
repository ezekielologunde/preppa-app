import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { cookOfLine } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Avatar, Btn } from '../../src/ui';
import { Screen, TopBar, Dock, Block, Empty } from '../../src/ui/layout';
import { submitReview } from '../../src/lib/orders';

const TAGS = ['Delicious 😋', 'On time', 'Great packaging', 'Generous portion', 'Would reorder', 'Friendly cook'];

export default function Review() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, ordersLoading, ordersError, refreshOrders, toast } = useStore();
  const o = orders.find((x) => x.id === id);
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const reviewInFlight = useRef(false);
  const toggle = (t: string) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  if (!o && ordersLoading) {
    return <Screen><TopBar title="Rate your cook" /><ActivityIndicator style={{ marginTop: 60 }} color={c.primary} /></Screen>;
  }
  if (!o || o.status !== 'completed' || o.reviewed) {
    const loadFailed = !o && !!ordersError;
    return (
      <Screen>
        <TopBar title="Rate your cook" />
        <Empty
          icon="star"
          title={loadFailed ? 'Could not load order' : o?.reviewed ? 'Review already submitted' : o ? 'Review not available yet' : 'Order not found'}
          body={loadFailed ? ordersError : o?.reviewed ? 'You already reviewed this order.' : o ? 'You can leave a review after the order is completed.' : 'We couldn’t find that order.'}
          action={loadFailed ? <Btn label="Try again" icon="repeat" onPress={() => void refreshOrders()} /> : <Btn label="Your orders" onPress={() => router.replace('/orders')} />}
        />
      </Screen>
    );
  }
  const cook = cookOfLine({ cook: o.cook, kitchenName: o.kitchenName, grad: o.lines[0]?.grad ?? 'g1' });

  // Real DB write (audit Critical: this used to be a fake toast with no DB write at all).
  // `o.dbId` is the real Supabase orders.id — a review is only ever left against that, never
  // against the local mock order id, since reviews.order_id is a real FK.
  const submit = async () => {
    if (reviewInFlight.current) return;
    const orderDbId = o?.dbId;
    if (!orderDbId) {
      toast('This order can’t be reviewed yet.', 'info');
      return;
    }
    reviewInFlight.current = true;
    setBusy(true);
    try {
      const note = [text.trim(), tags.length ? tags.join(', ') : null].filter(Boolean).join(' — ');
      await submitReview(orderDbId, stars, note);
      toast('Thanks for your review!', 'star', true);
      router.back();
    } catch (e: any) {
      toast(e?.message || 'Could not submit your review.', 'info');
    } finally {
      reviewInFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Screen>
      <TopBar title="Rate your cook" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ alignItems: 'center', paddingVertical: 22, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <Avatar initial={cook.initial} grad={cook.grad} size={64} rad={20} />
          <Text style={[type(18, 900), { color: c.ink, marginTop: 12 }]}>{cook.name}</Text>
          <Text style={[type(13, 600), { color: c.soft, marginTop: 2 }]}>How was your order?</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Press key={n} scale={0.85} onPress={() => setStars(n)} hitSlop={6} label={`Rate ${n} star${n > 1 ? 's' : ''}`} selected={n <= stars}>
                <Icon name="star" size={40} color={n <= stars ? c.star : c.border} />
              </Press>
            ))}
          </View>
        </View>

        {stars > 0 ? (
          <>
            <Block title="What stood out?">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TAGS.map((t) => {
                  const on = tags.includes(t);
                  return (
                    <Press key={t} scale={0.95} onPress={() => toggle(t)} label={t} selected={on}>
                      <View style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={[type(13, 700), { color: on ? c.primaryD : c.soft }]}>{t}</Text>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </Block>
            <Block title="Add a note (optional)">
              <TextInput
                value={text}
                onChangeText={setText}
                maxLength={1800}
                placeholder="Tell others what you loved…"
                placeholderTextColor={c.muted}
                multiline
                accessibilityLabel="Review note, 1,800 characters maximum"
                style={[type(14.5, 500), { color: c.ink, backgroundColor: c.bg2, borderRadius: radius.md, padding: 14, minHeight: 96, textAlignVertical: 'top' }]}
              />
              <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'right', marginTop: 6 }]}>{text.length}/1800</Text>
            </Block>
          </>
        ) : (
          <Text style={[type(13.5, 600), { color: c.muted, textAlign: 'center', marginTop: 28 }]}>Tap the stars to rate.</Text>
        )}
      </ScrollView>
      <Dock>
        <Btn label={stars > 0 ? 'Submit review' : 'Rate to continue'} block flex={1} disabled={stars === 0 || busy} loading={busy} onPress={submit} />
      </Dock>
    </Screen>
  );
}
