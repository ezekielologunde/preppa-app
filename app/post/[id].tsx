import React, { useCallback, useState } from 'react';
import { View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Press, Btn } from '../../src/ui';
import { fetchPost, FeedPost } from '../../src/lib/feed';
import { FeedReel } from '../../src/components/FeedReel';
import { NotFound } from '../../src/components/NotFound';

/** A single post — reached via a shared link or from a feed. Reuses FeedReel so it looks
 * identical to seeing the same post inline in any scrolling feed. */
export default function PostDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [post, setPost] = useState<FeedPost | null | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);

  useFocusEffect(useCallback(() => {
    let alive = true;
    if (!id) return;
    setPost(undefined);
    setLoadError('');
    fetchPost(id)
      .then((p) => { if (alive) setPost(p); })
      .catch((e: any) => { if (alive) { setLoadError(e?.message || 'Could not load this post.'); setPost(null); } });
    return () => { alive = false; };
  }, [id, retryNonce]));

  if (post === undefined) {
    return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View>;
  }
  if (loadError) return <View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 }}><Btn label="Try loading again" icon="repeat" onPress={() => setRetryNonce((n) => n + 1)} /></View>;
  if (!post) return <NotFound title="Post" />;

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <FeedReel f={post} height={height} />
      <View style={{ position: 'absolute', top: insets.top + 54, left: 16, zIndex: 2 }}>
        <Press scale={0.9} onPress={() => router.back()} label="Back">
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevLeft" size={20} color="#fff" />
          </View>
        </Press>
      </View>
    </View>
  );
}
