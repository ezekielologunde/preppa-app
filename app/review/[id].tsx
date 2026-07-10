import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COOKS } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Avatar, Btn } from '../../src/ui';
import { Screen, TopBar, Dock, Block } from '../../src/ui/layout';

const TAGS = ['Delicious 😋', 'On time', 'Great packaging', 'Generous portion', 'Would reorder', 'Friendly cook'];

export default function Review() {
  const c = useC();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { orders, toast } = useStore();
  const o = orders.find((x) => x.id === id);
  const cook = o ? COOKS[o.cook] : COOKS.maria;
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [text, setText] = useState('');
  const toggle = (t: string) => setTags((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const submit = () => {
    toast('Thanks for your review! +40 pts', 'star', true);
    router.back();
  };

  return (
    <Screen>
      <TopBar title="Rate your cook" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={{ alignItems: 'center', paddingVertical: 22, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
          <Avatar cook={o ? o.cook : 'maria'} size={64} rad={20} />
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
                    <Press key={t} scale={0.95} onPress={() => toggle(t)}>
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
                placeholder="Tell others what you loved…"
                placeholderTextColor={c.muted}
                multiline
                style={[type(14.5, 500), { color: c.ink, backgroundColor: c.bg2, borderRadius: radius.md, padding: 14, minHeight: 96, textAlignVertical: 'top' }]}
              />
            </Block>
          </>
        ) : (
          <Text style={[type(13.5, 600), { color: c.muted, textAlign: 'center', marginTop: 28 }]}>Tap the stars to rate.</Text>
        )}
      </ScrollView>
      <Dock>
        <Btn label={stars > 0 ? 'Submit review' : 'Rate to continue'} block flex={1} disabled={stars === 0} onPress={submit} />
      </Dock>
    </Screen>
  );
}
