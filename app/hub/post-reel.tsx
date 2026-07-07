import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, GradKey } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { FeedItem, CookId } from '../../src/data/data';
import { ME, MY_MEALS } from '../../src/data/cook';
import { Screen, TopBar, Dock } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { PhotoPick, KField, KInput, KChoice, KBtn } from '../(tabs)/my-hub';

const TAGS = ['Reel', 'Sunday reset', 'Gym bulk', 'New drop', 'Behind the scenes'];

export default function PostReelFlow() {
  const c = useC();
  const router = useRouter();
  const { postReel, toast } = useStore();
  const [mealId, setMealId] = useState(MY_MEALS[0]?.id ?? '');
  const [caption, setCaption] = useState('');
  const [tag, setTag] = useState('Reel');
  const [grad, setGrad] = useState<GradKey | null>(null);
  const [done, setDone] = useState(false);
  const featured = MY_MEALS.find((m) => m.id === mealId);
  const valid = !!mealId && !!caption.trim();

  const submit = () => {
    if (!valid) { toast('Pick a dish and add a caption', 'info'); return; }
    const reel: FeedItem = {
      id: 'r' + (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-5),
      cook: ME.id as CookId,
      meal: mealId,
      grad: grad ?? featured?.grad ?? 'g4',
      live: false,
      caption: caption.trim(),
      likes: '0',
      comments: 0,
      tag,
    };
    postReel(reel);
    setDone(true);
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Reel posted"
          body="Your reel is live at the top of the feed — people scrolling nearby will see it first."
          actionLabel="View feed"
          onAction={() => router.replace('/(tabs)/feeds')}
          secondaryLabel="Done"
          onSecondary={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title="Post a reel" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 20 }}><PhotoPick grad={grad ?? featured?.grad ?? null} setGrad={setGrad} /></View>
        <Text style={[type(12, 600), { color: c.muted, marginTop: 8 }]}>Short video is coming soon — for now your cover is the dish photo.</Text>
        <KField label="Feature a dish">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {MY_MEALS.map((m) => <KChoice key={m.id} label={m.name} on={mealId === m.id} onPress={() => setMealId(m.id)} />)}
          </View>
        </KField>
        <KField label="Caption"><KInput value={caption} onChange={setCaption} placeholder="Layering tonight’s trays 🔥 fresh out at 5:30" multiline /></KField>
        <KField label="Tag">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {TAGS.map((t) => <KChoice key={t} label={t} on={tag === t} onPress={() => setTag(t)} />)}
          </View>
        </KField>
      </ScrollView>
      <Dock>
        <KBtn label="Post reel" variant="pri" block onPress={submit} style={{ opacity: valid ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}
