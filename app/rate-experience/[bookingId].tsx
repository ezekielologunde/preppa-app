import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Btn } from '../../src/ui';
import { Screen, TopBar, Dock, Block } from '../../src/ui/layout';
import { listMyBookings, type BookingView } from '../../src/lib/services';
import { reviewExperience } from '../../src/lib/experiences';

export default function RateExperience() {
  const c = useC();
  const router = useRouter();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();
  const { toast } = useStore();
  const [b, setB] = useState<BookingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(0);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listMyBookings().then((list) => { setB(list.find((x) => x.id === bookingId) ?? null); setLoading(false); });
  }, [bookingId]);

  const submit = async () => {
    if (stars === 0 || busy) return;
    setBusy(true);
    try { await reviewExperience(bookingId!, stars, text); toast('Thanks for your review!', 'star', true); router.replace('/orders'); }
    catch (e: any) { toast(e?.message || 'Could not submit your review', 'info'); }
    finally { setBusy(false); }
  };

  if (loading) return <Screen><TopBar title="Rate experience" onBack={() => router.back()} /><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;

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
            <TextInput value={text} onChangeText={setText} placeholder="Tell others what you loved…" placeholderTextColor={c.muted} multiline
              style={[type(14.5, 500), { color: c.ink, backgroundColor: c.bg2, borderRadius: radius.md, padding: 14, minHeight: 96, textAlignVertical: 'top' }]} />
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
