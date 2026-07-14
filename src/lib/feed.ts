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
  mealId: string | null;
  mealName: string | null;
  mealImageUrl: string | null;
  mealPriceCents: number | null;
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

/** The public feed — newest published posts from verified kitchens, with the caller's like state. */
export async function fetchFeed(limit = 50): Promise<FeedPost[]> {
  const { data, error } = await supabase
    .from('posts')
    .select('id, kitchen_id, caption, tag, cover_url, like_count, created_at, meal_id, kitchens!inner(name, avatar_url, verification_status), meals(id, name, image_url, price_cents)')
    .eq('status', 'published')
    .eq('kitchens.verification_status', 'verified')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const posts: FeedPost[] = data.map((r: any) => ({
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
    mealId: r.meal_id ?? null,
    mealName: r.meals?.name ?? null,
    mealImageUrl: r.meals?.image_url ?? null,
    mealPriceCents: r.meals?.price_cents ?? null,
    createdAt: r.created_at,
  }));

  // Overlay the current user's likes (best-effort; anonymous → none).
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

/** Publish a post from the caller's verified kitchen. Returns the new post id. */
export async function createPost(coverUrl: string, caption?: string, tag?: string, mealId?: string): Promise<string> {
  await ensureAuth();
  const { data, error } = await supabase.rpc('create_post', {
    p_cover_url: coverUrl, p_caption: caption ?? null, p_tag: tag ?? null, p_meal_id: mealId ?? null,
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
