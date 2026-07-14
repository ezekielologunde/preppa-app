import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { money } from '../data/data';
import { type, radius } from '../theme/theme';
import { useStore } from '../store/store';
import { Icon, Press, GradBox } from '../ui';
import { shareAndNotify, SITE } from '../lib/share';
import { togglePostLike, togglePostSave, toggleFollow, recordFeedEvent, initialOf, FeedPost } from '../lib/feed';

/** One full-screen reel — shared by the main feed, a kitchen's feed, and the post-detail screen.
 * `isActive` gates video playback (pass the paging list's currently-visible item; defaults to
 * true for single-item contexts like the post-detail screen). */
export const FeedReel = React.memo(function FeedReel({ f, height, isActive = true }: { f: FeedPost; height: number; isActive?: boolean }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { toast } = useStore();
  const [liked, setLiked] = useState(f.liked);
  const [likes, setLikes] = useState(f.likeCount);
  const [saved, setSaved] = useState(f.saved);
  const [following, setFollowing] = useState(f.following);
  const [muted, setMuted] = useState(true);
  const isVideo = f.mediaType === 'video' && !!f.videoUrl;
  const player = useVideoPlayer(isVideo ? f.videoUrl! : null, (p) => { p.loop = true; p.muted = true; });

  // Funnel: count an impression when a reel enters the render window (fire-and-forget).
  useEffect(() => { recordFeedEvent(f.id, 'impression'); }, [f.id]);

  // Re-sync from the server-derived prop when it changes under an already-mounted reel (e.g.
  // the user followed this kitchen elsewhere and swiped back to a reel that never unmounted —
  // FlatList reuses the instance by key, so the initial useState() seed alone would go stale).
  useEffect(() => { setLiked(f.liked); setLikes(f.likeCount); }, [f.liked, f.likeCount]);
  useEffect(() => { setSaved(f.saved); }, [f.saved]);
  useEffect(() => { setFollowing(f.following); }, [f.following]);

  useEffect(() => { if (isVideo) player.muted = muted; }, [muted, isVideo, player]);
  useEffect(() => {
    if (!isVideo) return;
    if (isActive) player.play(); else player.pause();
  }, [isActive, isVideo, player]);

  const onLike = async () => {
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1)); // optimistic
    try { const real = await togglePostLike(f.id); if (real !== next) { setLiked(real); setLikes((n) => n + (real ? 1 : -1) - (next ? 1 : -1)); } }
    catch { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); toast('Sign in to like posts', 'info'); }
  };

  const onSave = async () => {
    const next = !saved;
    setSaved(next); // optimistic
    try {
      const real = await togglePostSave(f.id);
      setSaved(real);
      toast(real ? 'Saved to your list' : 'Removed from saved', 'bookmark', real);
      if (real) recordFeedEvent(f.id, 'save');
    } catch { setSaved(!next); toast('Sign in to save posts', 'info'); }
  };

  const onFollow = async () => {
    const next = !following;
    setFollowing(next); // optimistic
    try {
      const real = await toggleFollow(f.kitchenId);
      setFollowing(real);
      toast(real ? `Following ${f.kitchenName}` : `Unfollowed ${f.kitchenName}`, real ? 'check' : 'info', real);
    } catch { setFollowing(!next); toast('Sign in to follow kitchens', 'info'); }
  };

  return (
    <View style={{ height, width: '100%' }}>
      {/* Cover always renders first (poster/placeholder); video layers on top once mounted. */}
      <GradBox grad={f.grad} img={f.coverUrl} style={{ ...StyleAbs }} />
      {isVideo ? <VideoView player={player} style={StyleAbs} contentFit="cover" nativeControls={false} /> : null}
      <LinearGradient colors={['rgba(0,0,0,.35)', 'transparent', 'rgba(0,0,0,.72)']} locations={[0, 0.4, 1]} style={StyleAbs} />

      {/* top */}
      <View style={{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,.4)' }}>
          <Text style={[type(11, 900), { color: '#fff' }]}>{f.tag ? f.tag.toUpperCase() : 'REEL'}</Text>
        </View>
        <Text style={[type(17, 900), { color: '#fff' }]}>Feed</Text>
      </View>

      {isVideo ? (
        <Press scale={0.9} onPress={() => setMuted((m) => !m)} label={muted ? 'Unmute' : 'Mute'} style={{ position: 'absolute', top: insets.top + 46, right: 16 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.4)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={muted ? 'volumeOff' : 'volume'} size={16} color="#fff" />
          </View>
        </Press>
      ) : null}

      {/* right rail */}
      <View style={{ position: 'absolute', right: 12, bottom: 40, alignItems: 'center', gap: 20 }}>
        <RailBtn icon={liked ? 'heartFill' : 'heart'} label={likes > 0 ? String(likes) : 'Like'} active={liked} onPress={onLike} />
        <RailBtn icon="share" label="Share" onPress={() => { recordFeedEvent(f.id, 'share'); shareAndNotify(toast, f.mealOrderable && f.mealId ? { title: f.mealName ?? 'A dish on Preppa', url: `${SITE}/meal/${f.mealId}` } : { title: `${f.kitchenName} on Preppa`, url: `${SITE}/post/${f.id}` }); }} />
        <RailBtn icon={saved ? 'bookmarkFill' : 'bookmark'} label={saved ? 'Saved' : 'Save'} active={saved} onPress={onSave} />
      </View>

      {/* bottom */}
      <View style={{ position: 'absolute', left: 16, right: 74, bottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
          <Press scale={0.9} onPress={() => { recordFeedEvent(f.id, 'open_store'); router.push(`/store/${f.kitchenId}`); }}>
            <GradBox grad={f.grad} img={f.kitchenAvatarUrl ?? undefined} style={{ width: 40, height: 40, borderRadius: 13, borderWidth: 1.5, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
              {f.kitchenAvatarUrl ? null : <Text style={[type(15, 900), { color: '#fff' }]}>{initialOf(f.kitchenName)}</Text>}
            </GradBox>
          </Press>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={[type(15, 900), { color: '#fff' }]}>{f.kitchenName}</Text>
            <Icon name="shield" size={14} color="#fff" />
          </View>
          <Press scale={0.9} onPress={onFollow} label={following ? 'Following' : 'Follow'}>
            <View style={{ height: 28, paddingHorizontal: 13, borderRadius: 14, backgroundColor: following ? 'rgba(255,255,255,.16)' : '#E24A38', borderWidth: following ? 1 : 0, borderColor: 'rgba(255,255,255,.45)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={[type(12, 800), { color: '#fff' }]}>{following ? 'Following' : 'Follow'}</Text>
            </View>
          </Press>
        </View>
        {f.caption ? <Text style={[type(13.5, 500), { color: '#fff', marginTop: 11, lineHeight: 19 }]}>{f.caption}</Text> : null}
        {/* Commerce card — only truly orderable when the RLS-gated meal join is present
            (live meal + open kitchen). A pinned-but-now-unavailable dish shows a muted,
            non-orderable state instead of a dead "Order" button. */}
        {f.mealOrderable && f.mealId ? (
          <Press scale={0.98} onPress={() => { recordFeedEvent(f.id, 'open_meal'); router.push(`/meal/${f.mealId}`); }} style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, padding: 8, paddingLeft: 12, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,.22)' }}>
              <GradBox grad={f.grad} img={f.mealImageUrl ?? undefined} style={{ width: 42, height: 42, borderRadius: 11 }} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[type(13, 800), { color: '#fff' }]}>{f.mealName}</Text>
                <Text style={[type(12, 700), { color: 'rgba(255,255,255,.85)' }]}>by {f.kitchenName}{f.mealPriceCents != null ? ` · ${money(f.mealPriceCents / 100)}` : ''}</Text>
              </View>
              <View style={{ height: 38, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: '#E24A38', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="cart" size={15} color="#fff" />
                <Text style={[type(13.5, 800), { color: '#fff' }]}>Order</Text>
              </View>
            </View>
          </Press>
        ) : f.mealId ? (
          <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 8, paddingLeft: 12, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,.14)' }}>
            <View style={{ width: 42, height: 42, borderRadius: 11, backgroundColor: 'rgba(255,255,255,.12)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="clock" size={18} color="rgba(255,255,255,.7)" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type(13, 800), { color: 'rgba(255,255,255,.92)' }]}>Currently unavailable</Text>
              <Text numberOfLines={1} style={[type(12, 600), { color: 'rgba(255,255,255,.6)' }]}>This dish isn’t taking orders right now</Text>
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
});

function RailBtn({ icon, label, active, onPress }: { icon: string; label: string; active?: boolean; onPress: () => void }) {
  return (
    <Press scale={0.85} onPress={onPress}>
      <View style={{ alignItems: 'center', gap: 5 }}>
        <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: active ? '#E24A38' : 'rgba(0,0,0,.32)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={24} color="#fff" />
        </View>
        <Text style={[type(11, 800), { color: '#fff' }]}>{label}</Text>
      </View>
    </Press>
  );
}

const StyleAbs = { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 };
