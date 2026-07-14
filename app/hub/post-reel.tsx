import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Screen, TopBar, Dock } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { Icon, Press } from '../../src/ui';
import { KField, KInput, KChoice, KBtn } from '../(tabs)/my-hub';
import { uploadPostCover } from '../../src/lib/supabase';
import { createPost, fetchMyMenuMeals } from '../../src/lib/feed';

const TAGS = ['Reel', 'Sunday reset', 'Gym bulk', 'New drop', 'Behind the scenes'];

export default function PostReelFlow() {
  const c = useC();
  const router = useRouter();
  const { toast } = useStore();
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState('');
  const [tag, setTag] = useState('Reel');
  const [mealId, setMealId] = useState<string>('');
  const [meals, setMeals] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { fetchMyMenuMeals().then(setMeals).catch(() => {}); }, []);

  const valid = !!coverUrl && !!caption.trim();

  const pickPhoto = () => {
    if (Platform.OS !== 'web') { toast('Posting is available on the web app for now.', 'info'); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const url = await uploadPostCover(file, ext);
        setCoverUrl(url);
      } catch { toast('Could not upload that photo. Try another.', 'info'); }
      finally { setUploading(false); }
    };
    input.click();
  };

  const submit = async () => {
    if (busy) return;
    if (!valid) { toast('Add a photo and a caption', 'info'); return; }
    setBusy(true);
    try {
      await createPost(coverUrl!, caption.trim(), tag, mealId || undefined);
      setDone(true);
    } catch (e: any) {
      toast(e?.message || 'Could not publish your post.', 'info');
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Posted"
          body="Your post is live in the feed — people browsing will see it at the top."
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
      <TopBar title="Post to the feed" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        {/* photo */}
        <Press scale={0.99} onPress={pickPhoto} disabled={uploading} label="Add a photo" style={{ marginTop: 20 }}>
          <View style={{ height: 220, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: c.bg2 ?? c.bg, borderWidth: 1, borderColor: c.border2, alignItems: 'center', justifyContent: 'center' }}>
            {coverUrl ? (
              <Image source={{ uri: coverUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            ) : uploading ? (
              <ActivityIndicator color={c.primary} />
            ) : (
              <View style={{ alignItems: 'center', gap: 8 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="camera" size={24} color={c.primary} />
                </View>
                <Text style={[type(14, 800), { color: c.ink }]}>Add a photo</Text>
                <Text style={[type(12, 500), { color: c.muted }]}>Show off tonight's tray or your kitchen</Text>
              </View>
            )}
          </View>
        </Press>
        {coverUrl ? (
          <Press scale={0.98} onPress={pickPhoto} label="Change photo" style={{ alignSelf: 'center', marginTop: 10 }}>
            <Text style={[type(13, 800), { color: c.primary }]}>Change photo</Text>
          </Press>
        ) : null}
        <Text style={[type(12, 600), { color: c.muted, marginTop: 10 }]}>Short video is coming soon — for now share a photo.</Text>

        <KField label="Caption"><KInput value={caption} onChange={setCaption} placeholder="Layering tonight's trays 🔥 fresh out at 5:30" multiline /></KField>
        <KField label="Tag">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {TAGS.map((t) => <KChoice key={t} label={t} on={tag === t} onPress={() => setTag(t)} />)}
          </View>
        </KField>
        {meals.length > 0 ? (
          <KField label="Feature a dish (optional)">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
              <KChoice label="None" on={!mealId} onPress={() => setMealId('')} />
              {meals.map((m) => <KChoice key={m.id} label={m.name} on={mealId === m.id} onPress={() => setMealId(m.id)} />)}
            </View>
          </KField>
        ) : null}
      </ScrollView>
      <Dock>
        <KBtn label={busy ? 'Posting…' : 'Post'} variant="pri" block onPress={submit} style={{ opacity: valid && !busy ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}
