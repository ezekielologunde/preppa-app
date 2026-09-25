import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Btn } from '../../src/ui';
import { Screen, TopBar, Dock, Block, Empty } from '../../src/ui/layout';
import { listMyBookings, type BookingView } from '../../src/lib/services';
import { reviewExperience } from '../../src/lib/experiences';
import { NotFound } from '../../src/components/NotFound';

export default function RateExperience() {
  const c = useC();
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { toast } = useStore();
  const [b, setB] = useState<BookingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const reviewInFlight = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    listMyBookings()
      .then((list) => { if (alive) setB(list.find((x) => x.id === bookingId) ?? null); })
      .catch(() => { if (alive) setLoadError('Couldn’t load this booking. Check your connection and try again.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [bookingId, retryNonce]);

  const submit = async () => {
    if (stars === 0 || reviewInFlight.current) return;
    reviewInFlight.current = true;
    setBusy(true);
    try { await reviewExperience(bookingId!, stars, text); toast('Thanks for your review!', 'star', true); router.replace('/orders'); }
    catch (e: any) { toast(e?.message || 'Could not submit your review', 'info'); }
    finally { reviewInFlight.current = false; setBusy(false); }
  };

  if (loading) return <Screen><TopBar title="Rate experience" onBack={() => router.back()} /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
  if (loadError) return (
    <Screen>
      <TopBar title="Rate experience" onBack={() => router.back()} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
        <Icon name="info" size={38} color={c.red} />
        <Text style={[type(18, 900), { color: c.ink, marginTop: 14 }]}>Couldn’t load this booking</Text>
        <Text style={[type(13.5, 500), { color: c.soft, textAlign: 'center', marginTop: 7, marginBottom: 18 }]}>{loadError}</Text>
        <Btn label="Try again" icon="repeat" onPress={() => setRetryNonce((n) => n + 1)} />
      </View>
    </Screen>
  );
  if (!b) return <NotFound title="Booking" />;
  const reviewAvailable = b.status === 'confirmed' && b.eventDate < new Date().toISOString().slice(0, 10);
  if (b.reviewed || !reviewAvailable) return (
    <Screen>
      <TopBar title="Rate experience" onBack={() => router.back()} />
      <Empty
        icon="star"
        title={b.reviewed ? 'Review already submitted' : 'Review not available yet'}
        body={b.reviewed ? 'You already reviewed this experience.' : 'You can leave a review after you attend the experience.'}
        action={<Btn label="Your orders" onPress={() => router.replace('/orders')} />}
      />
    </Screen>
  );

  return (
    <Screen>
      <TopBar title="Rate experience" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ alignItems: 'center', paddingVertical: 22, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <View style={{ width: 60, height: 60, borderRadius: 18, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="spark" size={28} color={c.primary} /></View>
          <Text style={[type(18, 900), { color: c.ink, marginTop: 12 }]}>{b?.title ?? 'Your experience'}</Text>
          <Text style={[type(13, 600), { color: c.soft, marginTop: 2 }]}>{b?.kitchenName ? `${b.kitchenName} · ` : ''}How was it?</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Press key={n} scale={0.85} onPress={() => setStars(n)} hitSlop={6} label={`Rate ${n} star${n > 1 ? 's' : ''}`} selected={n <= stars}>
                <Icon name="star" size={40} color={n <= stars ? c.star : c.border} />
              </Press>
            ))}
          </View>
        </View>

        {stars > 0 ? (
          <Block title="Add a note (optional)">
            <TextInput value={text} onChangeText={setText} maxLength={2000} placeholder="Tell others what you loved…" placeholderTextColor={c.muted} multiline accessibilityLabel="Experience review, 2,000 characters maximum"
              style={[type(14.5, 500), { color: c.ink, backgroundColor: c.bg2, borderRadius: radius.md, padding: 14, minHeight: 96, textAlignVertical: 'top' }]} />
            <Text style={[type(11.5, 600), { color: c.muted, textAlign: 'right', marginTop: 6 }]}>{text.length}/2000</Text>
          </Block>
        ) : (
          <Text style={[type(13.5, 600), { color: c.muted, textAlign: 'center', marginTop: 28 }]}>Tap the stars to rate.</Text>
        )}
      </ScrollView>
      <Dock>
        <Btn label={busy ? 'Submitting…' : stars > 0 ? 'Submit review' : 'Rate to continue'} block flex={1} disabled={stars === 0 || busy} onPress={submit} />
      </Dock>
    </Screen>
  );
}
