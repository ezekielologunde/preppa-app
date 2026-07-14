import { supabase, ensureAuth } from './supabase';
import type { GradKey } from '../data/data';

// Real, DB-backed creator feed (photo-first). Preppers publish posts from their verified
// kitchen; everyone browses + likes. Replaces the in-memory FEED/reels mock. Video is a
// later slice (posts.media_type / video_url reserved).

export interface FeedPost {
  id: string;
  kitchenId: string;
  kitchenName: string;
  kitchenAvatarUrl: string | null;
  caption: string | null;
  tag: string | null;
  coverUrl: string;
  grad: GradKey;
  likeCount: number;
  liked: boolean;
  saved: boolean;
  mealId: string | null;
  mealName: string | null;
  mealImageUrl: string | null;
  mealPriceCents: number | null;
  /** True only when the pinned meal is currently orderable (live + kitchen open).
   *  When a post pins a meal that has since sold out / paused / been unlisted, the RLS
   *  meal join returns null → this is false and the card shows an "unavailable" state
   *  instead of a dead "Order" button. `mealId` can be set while this is false. */
  mealOrderable: boolean;
  mediaType: 'photo' | 'video';
  videoUrl: string | null;
  /** Whether the current viewer follows this post's kitchen (best-effort; anon → false). */
  following: boolean;
  createdAt: string;
}

// Deterministic gradient per kitchen so avatars/backgrounds are stable across renders.
function gradFor(id: string): GradKey {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (`g${(h % 8) + 1}`) as GradKey;
}
export function initialOf(name: string): string {
  return (name || '?').trim()[0]?.toUpperCase() ?? '?';
}

const POST_SELECT = 'id, kitchen_id, caption, tag, cover_url, media_type, video_url, like_count, created_at, meal_id, kitchens!inner(name, avatar_url, verification_status), meals(id, name, image_url, price_cents)';

function mapRow(r: any): FeedPost {
  return {
    id: r.id,
    kitchenId: r.kitchen_id,
    kitchenName: r.kitchens?.name ?? 'Kitchen',
    kitchenAvatarUrl: r.kitchens?.avatar_url ?? null,
    caption: r.caption ?? null,
    tag: r.tag ?? null,
    coverUrl: r.cover_url,
    grad: gradFor(r.kitchen_id),
    likeCount: r.like_count ?? 0,
    liked: false,
    saved: false,
    mealId: r.meal_id ?? null,
    mealName: r.meals?.name ?? null,
    mealImageUrl: r.meals?.image_url ?? null,
    mealPriceCents: r.meals?.price_cents ?? null,
    // The meal join is RLS-gated to live + orderable rows; its presence IS the orderable signal.
    mealOrderable: !!r.meals?.id,
    mediaType: r.media_type === 'video' ? 'video' : 'photo',
    videoUrl: r.video_url ?? null,
    following: false,
    createdAt: r.created_at,
  };
}

/** The kitchen ids the current user follows (empty for anonymous). */
async function fetchFollowedKitchenIds(): Promise<string[]> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data } = await supabase.from('follows').select('kitchen_id').eq('follower_id', uid);
  return (data ?? []).map((r: any) => r.kitchen_id);
}

/** Overlay the viewer's follow state onto a batch of posts (best-effort). */
async function overlayFollows(posts: FeedPost[], preloaded?: string[]): Promise<FeedPost[]> {
  try {
    const ids = preloaded ?? (await fetchFollowedKitchenIds());
    if (ids.length && posts.length) {
      const set = new Set(ids);
      for (const p of posts) p.following = set.has(p.kitchenId);
    }
  } catch { /* keep following=false */ }
  return posts;
}

/** Overlay the current user's likes onto a batch of posts (best-effort; anonymous → none). */
async function overlayLikes(posts: FeedPost[]): Promise<FeedPost[]> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (uid && posts.length) {
      const { data: likes } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', uid)
        .in('post_id', posts.map((p) => p.id));
      const set = new Set((likes ?? []).map((l: any) => l.post_id));
      for (const p of posts) p.liked = set.has(p.id);
    }
  } catch { /* keep liked=false */ }
  return posts;
}

/** Overlay the current user's saves onto a batch of posts (best-effort; anonymous → none). */
async function overlaySaves(posts: FeedPost[]): Promise<FeedPost[]> {
  try {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id;
    if (uid && posts.length) {
      const { data: saves } = await supabase
        .from('post_saves')
        .select('post_id')
        .eq('user_id', uid)
        .in('post_id', posts.map((p) => p.id));
      const set = new Set((saves ?? []).map((s: any) => s.post_id));
      for (const p of posts) p.saved = set.has(p.id);
    }
  } catch { /* keep saved=false */ }
  return posts;
}

async function queryPosts(kitchenId: string | undefined, cursor: string | undefined, limit: number, following?: boolean): Promise<FeedPost[]> {
  // The "Following" filter restricts to the viewer's followed kitchens; empty → no posts.
  let followedIds: string[] | undefined;
  if (following) {
    followedIds = await fetchFollowedKitchenIds();
    if (!followedIds.length) return [];
  }

  let q = supabase
    .from('posts')
    .select(POST_SELECT)
    .eq('status', 'published')
    .eq('kitchens.verification_status', 'verified')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (kitchenId) q = q.eq('kitchen_id', kitchenId);
  else if (followedIds) q = q.in('kitchen_id', followedIds);
  if (cursor) q = q.lt('created_at', cursor);
  const { data, error } = await q;
  if (error || !data) return [];
  const mapped = (data as any[]).map(mapRow);
  return overlayFollows(await overlaySaves(await overlayLikes(mapped)), followedIds);
}

export interface FeedPage { posts: FeedPost[]; nextCursor: string | null }

/** The public feed — newest published posts from verified kitchens, with the caller's like/save/follow state.
 *  `following: true` narrows to the kitchens the viewer follows (empty when they follow none). */
export async function fetchFeed(opts?: { cursor?: string; limit?: number; following?: boolean }): Promise<FeedPage> {
  const limit = opts?.limit ?? 20;
  const posts = await queryPosts(undefined, opts?.cursor, limit, opts?.following);
  return { posts, nextCursor: posts.length === limit ? posts[posts.length - 1].createdAt : null };
}

/** One kitchen's posts only (its storefront's post feed). */
export async function fetchKitchenFeed(kitchenId: string, opts?: { cursor?: string; limit?: number }): Promise<FeedPage> {
  const limit = opts?.limit ?? 20;
  const posts = await queryPosts(kitchenId, opts?.cursor, limit);
  return { posts, nextCursor: posts.length === limit ? posts[posts.length - 1].createdAt : null };
}

/** A single post, for the post-detail screen / shared links. */
export async function fetchPost(postId: string): Promise<FeedPost | null> {
  const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('id', postId).maybeSingle();
  if (error || !data) return null;
  const [post] = await overlayFollows(await overlaySaves(await overlayLikes([mapRow(data)])));
  return post;
}

/** Publish a post from the caller's verified kitchen. Returns the new post id. */
export async function createPost(coverUrl: string, caption?: string, tag?: string, mealId?: string, videoUrl?: string): Promise<string> {
  await ensureAuth();
  const { data, error } = await supabase.rpc('create_post', {
    p_cover_url: coverUrl, p_caption: caption ?? null, p_tag: tag ?? null, p_meal_id: mealId ?? null,
    p_video_url: videoUrl ?? null,
  });
  if (error) throw new Error(error.message || 'Could not publish your post.');
  return data as string;
}

/** Like/unlike a post; returns the new liked state. */
export async function togglePostLike(postId: string): Promise<boolean> {
  await ensureAuth();
  const { data, error } = await supabase.rpc('toggle_post_like', { p_post: postId });
  if (error) throw new Error(error.message || 'Could not update your like.');
  return !!data;
}

/** Save/unsave a post; returns the new saved state. Persisted (Profile → Saved). */
export async function togglePostSave(postId: string): Promise<boolean> {
  await ensureAuth();
  const { data, error } = await supabase.rpc('toggle_post_save', { p_post: postId });
  if (error) throw new Error(error.message || 'Could not update your saved posts.');
  return !!data;
}

/** Follow/unfollow a kitchen; returns the new following state. */
export async function toggleFollow(kitchenId: string): Promise<boolean> {
  await ensureAuth();
  const { data, error } = await supabase.rpc('toggle_follow', { p_kitchen: kitchenId });
  if (error) throw new Error(error.message || 'Could not update who you follow.');
  return !!data;
}

/** Whether the current viewer follows a given kitchen (false for anonymous). */
export async function fetchIsFollowing(kitchenId: string): Promise<boolean> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return false;
  const { data } = await supabase.from('follows').select('kitchen_id')
    .eq('follower_id', uid).eq('kitchen_id', kitchenId).maybeSingle();
  return !!data;
}

/** The caller's saved posts, newest-saved first (a re-order shortlist). */
export async function fetchSavedPosts(limit = 50): Promise<FeedPost[]> {
  await ensureAuth();
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data: saves } = await supabase
    .from('post_saves')
    .select('post_id, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);
  const ids = (saves ?? []).map((s: any) => s.post_id);
  if (!ids.length) return [];
  // Fetch the (still-public) posts, then re-order to match save recency.
  const { data, error } = await supabase.from('posts').select(POST_SELECT).in('id', ids);
  if (error || !data) return [];
  const byId = new Map((data as any[]).map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean).map(mapRow);
  return overlaySaves(await overlayLikes(ordered));
}

type FeedEventKind = 'impression' | 'card_tap' | 'save' | 'share' | 'open_store' | 'open_meal';

/** Fire-and-forget funnel telemetry (impression → tap → …). Never throws; never blocks the UI. */
export function recordFeedEvent(postId: string, kind: FeedEventKind): void {
  supabase.rpc('record_feed_event', { p_post: postId, p_kind: kind }).then(() => {}, () => {});
}

/** The caller's own live dishes (for optionally featuring one on a post). */
export async function fetchMyMenuMeals(): Promise<{ id: string; name: string }[]> {
  await ensureAuth();
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return [];
  const { data: k } = await supabase.from('kitchens').select('id')
    .eq('owner_id', uid).eq('verification_status', 'verified')
    .order('created_at', { ascending: false }).limit(1);
  const kid = k?.[0]?.id;
  if (!kid) return [];
  const { data } = await supabase.from('meals').select('id, name')
    .eq('kitchen_id', kid).eq('status', 'live').order('created_at', { ascending: false });
  return (data ?? []).map((m: any) => ({ id: m.id as string, name: m.name as string }));
}
