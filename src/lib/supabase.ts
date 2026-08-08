import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { geocodeAddress } from './geo';

/**
 * Supabase + Stripe connection for real card payments (LIVE mode).
 * URL + anon key + Stripe publishable key are all PUBLIC by design.
 * The Stripe SECRET key lives only as a Supabase Edge Function secret — never here.
 */
export const SUPABASE_URL = 'https://fwidhpzwldneeaphrxgg.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3aWRocHp3bGRuZWVhcGhyeGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTk2ODMsImV4cCI6MjA5ODc5NTY4M30.KH8x-bMEq__ADEv47lqeqDM12B4hu6CkVhZQzbqsh2E';

export const STRIPE_PK =
  'pk_live_51TbwCHJP8OvIS2L35vHSgDpR4OmVA4SzZflR0Mf3j6NBZDDlylNpLGVHrGeHdZhuowi0LFGg17KFKWWnrvqa1Hwg00Mu4qxbQ0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  // detectSessionInUrl is OFF: login is email-OTP only, which never uses URL tokens.
  // (It was briefly enabled for Google OAuth, but that flow broke on the Expo-web SPA
  // — "OAuth state parameter missing" — so it's disabled until OAuth is done correctly.)
  auth: { storage: AsyncStorage as any, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

/**
 * Ensure there's a signed-in Supabase user before a payment/account action. Real
 * users always hold a session from onboarding (OTP/Google) — the onboarding gate
 * can't complete without one. If a session was lost/expired, require a real
 * re-auth rather than falling back to any shared account (no credentials ship in
 * the bundle). Callers catch `AUTH_REQUIRED` and route back to sign-in.
 */
export async function ensureAuth() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session;
  throw new Error('AUTH_REQUIRED');
}

/** User-facing message when an auth call times out (also used by the code screen to
 * distinguish a network stall from a wrong code). */
export const AUTH_TIMEOUT_MESSAGE = 'Couldn’t reach sign-in — check your connection and try again.';

/**
 * Race a promise against a timeout so an auth call can never hang the UI forever
 * (a stalled network request would otherwise leave the sign-in spinner spinning
 * with no recovery). On timeout we reject with a friendly, user-facing message.
 */
function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(AUTH_TIMEOUT_MESSAGE)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ---- Real email-OTP auth (Phase 1) --------------------------------------
// Passwordless: request a 6-digit code, then verify it. `shouldCreateUser`
// unifies sign-in and sign-up (the `handle_new_user` trigger auto-creates the
// profile on first sign-in). NB: the Supabase project's email template must
// include `{{ .Token }}` so the user actually receives the numeric code.

/**
 * Send a 6-digit login code to the email. Throws on failure (e.g. rate limit).
 * `meta` (display_name / first_name) is stashed as user_metadata on signup and
 * copied into `profiles` by the `handle_new_user` trigger at account creation.
 */
export async function sendEmailOtp(email: string, meta?: { display_name?: string; first_name?: string }) {
  const { error } = await withTimeout(
    supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: meta } }),
  );
  if (error) throw error;
}

/** Verify the emailed 6-digit code; establishes a real session on success. */
export async function verifyEmailOtp(email: string, token: string) {
  const { data, error } = await withTimeout(
    supabase.auth.verifyOtp({ email, token, type: 'email' }),
  );
  if (error) throw error;
  return data.session;
}

// ---- Password auth (fast, browser-rememberable — no code to copy) ---------------
/** Sign up with a password so future logins skip the emailed code. Returns the session,
 *  or null when the Supabase project still requires email confirmation (one-time link). */
export async function signUpWithPassword(email: string, password: string, meta?: { display_name?: string; first_name?: string }) {
  const { data, error } = await withTimeout(
    supabase.auth.signUp({ email, password, options: { data: meta } }),
  );
  if (error) throw error;
  return data.session;
}

/** Sign in with email + password — the fast returning-user path (browser can autofill). */
export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await withTimeout(
    supabase.auth.signInWithPassword({ email, password }),
  );
  if (error) throw error;
  return data.session;
}

/** Sign the current user out of Supabase (clears the persisted session). */
export async function signOutUser() {
  try {
    await supabase.auth.signOut();
  } catch {
    // best-effort; local state is cleared by the caller regardless
  }
}

/**
 * Real, server-side account deletion (App Store 5.1.1(v) / Google Play requirement).
 * Anonymizes profile PII and soft-deletes the auth user (disables sign-in; the row/id stay
 * so real order/ledger history referencing it via a RESTRICT foreign key stays valid).
 * Throws with the specific reason when a cook's kitchen has in-flight orders, an uncashed
 * balance, or active subscribers — the caller should surface that message directly rather
 * than treating it as a generic failure.
 */
export async function deleteAccountServerSide(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (!error && !data?.error) return;
  let payload: any = data;
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { payload = await ctx.json(); } catch { /* keep data */ }
  }
  throw new Error(payload?.error || (error as any)?.message || 'Could not delete your account. Please try again.');
}

/** Currently signed-in Supabase user, or null. */
export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// ---- Server-authoritative account state (Phase 1 admin/approval) ---------
// The client role is derived from the DB, never from a local flag. `role` is
// read from `profiles` (RLS: a user may read their own row); prepper status is
// reconciled from the server so approval is honest (admin-driven), not faked.

export type PrepperStatusValue = 'none' | 'pending' | 'approved';
export interface AccountState {
  signedIn: boolean;
  isAdmin: boolean;
  prepperStatus: PrepperStatusValue;
  displayName: string | null;
  firstName: string | null;
  avatarUrl: string | null;
  isPrepPlus: boolean;
  prepplusUntil: string | null;
  /** Real (Stripe Connect) payout readiness — a kitchen can't publish/accept paid orders without it. */
  payoutsEnabled: boolean;
  /** True exactly once: approved, and the one-time "you're approved" welcome hasn't been acknowledged yet. */
  approvalNoticePending: boolean;
}

/**
 * Resolve the signed-in user's real role/status from the backend. Returns a
 * signed-out default when there is no session (the app browses anonymously).
 * `isAdmin` here is cosmetic gating only — every admin action is independently
 * enforced server-side by `is_admin()` RLS/RPC checks.
 */
export async function fetchAccountState(): Promise<AccountState> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return { signedIn: false, isAdmin: false, prepperStatus: 'none', displayName: null, firstName: null, avatarUrl: null, isPrepPlus: false, prepplusUntil: null, payoutsEnabled: false, approvalNoticePending: false };

  const { data: prof } = await supabase.from('profiles').select('role, display_name, first_name, avatar_url').eq('id', uid).maybeSingle();
  const role = (prof?.role as string) ?? 'customer';
  const displayName = (prof?.display_name as string) ?? null;
  const firstName = (prof?.first_name as string) ?? null;
  const avatarUrl = (prof?.avatar_url as string) ?? null;
  const isAdmin = role === 'admin';

  // Hub access (prepperStatus) reflects actually OWNING A KITCHEN, not the `role`
  // flag alone. This guards orphaned 'prepper' roles — e.g. a kitchen that was later
  // removed would otherwise leave the account showing My Hub with nothing to manage.
  const { data: k } = await supabase
    .from('kitchens')
    .select('id, verification_status, approval_notice_seen_at')
    .eq('owner_id', uid)
    .order('created_at', { ascending: false })
    .limit(1);
  const kitchenRow = k?.[0] as { id: string; verification_status: string; approval_notice_seen_at: string | null } | undefined;
  const kv = kitchenRow?.verification_status;
  const prepperStatus: PrepperStatusValue = kv === 'verified' ? 'approved' : kv === 'pending' ? 'pending' : 'none';

  // Real Stripe Connect payout readiness — a kitchen can't publish/accept paid orders
  // without it (server-enforced by a DB trigger + create-order; this is read-only UX).
  let payoutsEnabled = false;
  if (prepperStatus === 'approved' && kitchenRow) {
    const { data: acct } = await supabase.from('stripe_accounts').select('payouts_enabled').eq('kitchen_id', kitchenRow.id).maybeSingle();
    payoutsEnabled = !!acct?.payouts_enabled;
  }
  const approvalNoticePending = prepperStatus === 'approved' && !kitchenRow?.approval_notice_seen_at;

  // PrepPlus entitlement — cosmetic here (fee waivers are enforced server-side by
  // is_prepplus_member()). Mirrors that predicate: active/trialing (unexpired) or a 3-day
  // past_due grace. Read via the memberships RLS (select-own); never cached (see store).
  const { data: mem } = await supabase
    .from('memberships')
    .select('status, current_period_end, updated_at')
    .eq('customer_id', uid)
    .maybeSingle();
  let isPrepPlus = false;
  const prepplusUntil = (mem?.current_period_end as string) ?? null;
  if (mem) {
    const now = Date.now();
    const periodOk = !mem.current_period_end || new Date(mem.current_period_end as string).getTime() > now;
    const graceOk = mem.status === 'past_due' && mem.updated_at
      && new Date(mem.updated_at as string).getTime() > now - 3 * 24 * 3600 * 1000;
    isPrepPlus = ((mem.status === 'active' || mem.status === 'trialing') && periodOk) || !!graceOk;
  }

  return { signedIn: true, isAdmin, prepperStatus, displayName, firstName, avatarUrl, isPrepPlus, prepplusUntil, payoutsEnabled, approvalNoticePending };
}

/** Acknowledge the one-time "you're approved" welcome overlay (never shows again after this). */
export async function ackApprovalNotice(): Promise<void> {
  const { error } = await supabase.rpc('ack_approval_notice');
  if (error) throw error;
}

/**
 * Update the signed-in user's own display name (and derived first name).
 * Allowed by the `profiles_update_self` RLS policy; the privileged-columns
 * guard only blocks role/verification_status, so a name change is fine.
 */
export async function updateDisplayName(fullName: string): Promise<{ displayName: string; firstName: string }> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error('You need to be signed in to change your name.');
  const display = fullName.trim();
  const first = display.split(/\s+/)[0] || display;
  const { error } = await supabase.from('profiles').update({ display_name: display, first_name: first }).eq('id', uid);
  if (error) throw error;
  return { displayName: display, firstName: first };
}

// ---- Profile editing (self-writable fields under profiles_update_self) --------
export interface EditableProfile {
  displayName: string;
  bio: string;
  location: string;
  dietary: string[];
  avatarUrl: string | null;
}

/** Load the signed-in user's editable profile fields. */
export async function getMyProfile(): Promise<EditableProfile | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase.from('profiles').select('display_name, bio, location, dietary, avatar_url').eq('id', uid).maybeSingle();
  return {
    displayName: (data?.display_name as string) ?? '',
    bio: (data?.bio as string) ?? '',
    location: (data?.location as string) ?? '',
    dietary: (data?.dietary as string[]) ?? [],
    avatarUrl: (data?.avatar_url as string) ?? null,
  };
}

/** Update the signed-in user's own profile. `display_name`/`first_name` stay in sync. */
export async function updateProfile(patch: Partial<EditableProfile>): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error('You need to be signed in.');
  const row: Record<string, unknown> = {};
  if (patch.displayName !== undefined) {
    const dn = patch.displayName.trim();
    row.display_name = dn;
    row.first_name = dn.split(/\s+/)[0] || dn;
  }
  if (patch.bio !== undefined) row.bio = patch.bio.trim();
  if (patch.location !== undefined) row.location = patch.location.trim();
  if (patch.dietary !== undefined) row.dietary = patch.dietary;
  if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
  const { error } = await supabase.from('profiles').update(row).eq('id', uid);
  if (error) throw error;
}

/**
 * All media uploads route through the `upload-media` edge function, which sniffs real file
 * bytes (magic numbers) server-side before accepting anything — direct-to-Storage client
 * uploads only validated the client-DECLARED Content-Type header, which a malicious client
 * can freely lie about (proven live in a 2026-08-08 audit: raw HTML uploaded as "image/png"
 * was accepted and served back with that content-type). The matching Storage RLS INSERT/
 * UPDATE policies for these 4 buckets have been dropped so this is the only write path.
 */
async function uploadViaProxy(bucket: string, prefix: string, file: Blob, extra?: Record<string, string>): Promise<{ url?: string; path?: string }> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error('You need to be signed in.');
  const form = new FormData();
  form.append('bucket', bucket);
  form.append('prefix', prefix);
  if (extra) for (const [k, v] of Object.entries(extra)) form.append(k, v);
  form.append('file', file, `upload.${(file as any).name?.split('.').pop() || 'bin'}`);
  const { data, error } = await supabase.functions.invoke('upload-media', { body: form });
  if (!error && !data?.error) return data;
  let payload: any = data;
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try { payload = await ctx.json(); } catch { /* keep data */ }
  }
  throw new Error(payload?.error || (error as any)?.message || 'Upload failed. Please try again.');
}

/** Upload an avatar image; returns its public URL. Web-first. */
export async function uploadAvatar(file: Blob, _ext: string): Promise<string> {
  const { url } = await uploadViaProxy('avatars', 'avatar', file);
  return url!;
}

/** Upload a plan cover image (public, customer-facing). */
export async function uploadPlanCover(file: Blob, _ext: string): Promise<string> {
  const { url } = await uploadViaProxy('avatars', 'plan-cover', file);
  return url!;
}

/** Upload a feed-post cover image (public). */
export async function uploadPostCover(file: Blob, _ext: string): Promise<string> {
  const { url } = await uploadViaProxy('avatars', 'post', file);
  return url!;
}

/** Upload a feed-post video (public), to the `post-videos` bucket. */
export async function uploadPostVideo(file: Blob, _ext: string): Promise<string> {
  const { url } = await uploadViaProxy('post-videos', 'post', file);
  return url!;
}

// ---- Social login (web) -------------------------------------------------------
/** Start Google OAuth (web). Requires the Google provider to be enabled in Supabase. */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

export type ServiceType = 'meals' | 'home_chef';
export interface ApplicationFields {
  serviceTypes: ServiceType[]; // sell homemade meals / cook at people's homes
  legalName: string;
  phone: string;
  kitchenName: string;
  cuisine: string;
  address: string; // private
  neighborhood: string; // public
  serviceArea?: string; // home-chef: how far they'll travel
  experience?: string; // home-chef: cooking experience
  foodSafety: {
    refrigeration: boolean; foodPrep: boolean; allergens: boolean; note?: string;
    // Kitchen verification photos in the private cook-docs bucket. (Identity/Gov-ID is
    // now handled by Stripe Connect Express onboarding, not raw photos.)
    docs?: { fridge: string[]; kitchen: string[] };
  };
  foodHandlerCert: string;
  story: string;
  agreementVersion: string;
}

/**
 * Submit a real prepper application: creates a pending kitchen + private details
 * (phone/address/food-safety/agreement) + verification rows for admin review.
 * Geocodes the typed address (free, key-less OpenStreetMap Nominatim — see src/lib/geo.ts)
 * before submitting so admin review sees whether it resolves to a real place instead of
 * trusting free text blindly. A failed geocode (formatting quirks) does NOT block
 * submission — it just leaves verified_lat/lng null so admin sees "not verified" and can
 * judge or ask the applicant to correct it.
 */
export async function submitPrepperApplication(f: ApplicationFields): Promise<string> {
  const coords = await geocodeAddress(f.address).catch(() => null);
  const { data, error } = await supabase.rpc('request_prepper_application', {
    p_kitchen_name: f.kitchenName,
    p_cuisine: f.cuisine,
    p_approx_area: f.neighborhood,
    p_bio: f.story,
    p_phone: f.phone,
    p_address: f.address,
    p_food_safety: f.foodSafety,
    p_food_handler_cert: f.foodHandlerCert,
    p_agreement_version: f.agreementVersion,
    p_service_types: f.serviceTypes,
    p_service_area: f.serviceArea ?? null,
    p_experience: f.experience ?? null,
    p_verified_lat: coords?.lat ?? null,
    p_verified_lng: coords?.lng ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ---- Real meal creation (approved preppers) ----------------------------------
export interface NewMeal {
  name: string;
  description?: string;
  priceCents: number;
  serves: number;
  tags?: string[];
  grad?: string;
}
/**
 * Publish a real meal to the caller's own verified kitchen. The `create_meal` RPC
 * resolves the kitchen from auth.uid() server-side (the client never passes a
 * kitchen_id) and returns the new meal's id. Throws on failure (e.g. no approved
 * kitchen, bad price) so the form can surface it.
 */
export async function createMeal(m: NewMeal): Promise<string> {
  const { data, error } = await supabase.rpc('create_meal', {
    p_name: m.name,
    p_description: m.description ?? null,
    p_price_cents: m.priceCents,
    p_serves: m.serves,
    p_tags: m.tags && m.tags.length ? m.tags : null,
    p_grad: m.grad ?? 'g1',
  });
  if (error) throw error;
  return data as string;
}

/** The signed-in prepper's most-recent kitchen id (null if none). Mirrors create_meal's
 *  server-side resolution; used to build the owner-scoped meal-photo upload path. */
export async function getMyKitchenId(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return null;
  const { data } = await supabase.from('kitchens').select('id').eq('owner_id', uid).order('created_at', { ascending: false }).limit(1);
  return (data?.[0]?.id as string) ?? null;
}

/** Upload a public meal photo; returns its public URL. Server-side (upload-media) re-checks
 *  kitchen ownership. Web-first (native has no file picker). */
export async function uploadMealPhoto(file: Blob, _ext: string, kitchenId: string): Promise<string> {
  const { url } = await uploadViaProxy('meal-photos', 'meal', file, { kitchenId });
  return url!;
}

/** Set (or clear, with null) a meal's photo via the owner-gated set_meal_photo RPC. */
export async function setMealPhoto(mealId: string, imageUrl: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_meal_photo', { p_meal_id: mealId, p_image_url: imageUrl });
  if (error) throw error;
}

/** Upload a verification photo/document to the private, owner-scoped `cook-docs`
 *  bucket, grouped by kind (`govid` | `selfie` | `fridge` | `kitchen`). Returns the
 *  stored path (kept in the application's food_safety.docs). */
export async function uploadCookPhoto(file: Blob, group: string): Promise<string> {
  const { path } = await uploadViaProxy('cook-docs', group, file);
  return path!;
}

/** Signed URL (1h) for a private `cook-docs` object — used by admin review to view a
 *  cook's verification photos. Null on failure. */
export async function createCookDocSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('cook-docs').createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Store the caller's kitchen's approximate coordinates (owner-only, best-effort). */
export async function setKitchenGeo(kitchenId: string, lat: number, lng: number): Promise<void> {
  const { error } = await supabase.rpc('set_kitchen_geo', { p_kitchen: kitchenId, p_lat: lat, p_lng: lng });
  if (error) throw error;
}

// ---- Real notifications --------------------------------------------------------
// Read the signed-in user's real notifications (RLS: user_id = auth.uid()). Rows are
// generated server-side on real events (kitchen approval/rejection, order status).
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  unread: boolean;
  created_at: string;
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data: sess } = await supabase.auth.getSession();
  if (!sess.session?.user?.id) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id,kind,title,body,read_at,created_at')
    .neq('kind', 'message') // DM pings live in the Messages surface (threadUnread), not the Alerts feed
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, kind: r.kind, title: r.title, body: r.body ?? null,
    unread: !r.read_at, created_at: r.created_at,
  }));
}

/** Mark one notification read (RLS restricts to the caller's own rows). */
export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).is('read_at', null);
}

/** Mark all of the caller's unread notifications read. */
export async function markAllNotificationsRead(): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return;
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', uid).is('read_at', null);
}

/** mock cook id -> seeded kitchen UUID */
export const KITCHEN_ID: Record<string, string> = {
  maria: 'bbbbbbbb-0000-4000-8000-000000000001',
  david: 'bbbbbbbb-0000-4000-8000-000000000002',
  amara: 'bbbbbbbb-0000-4000-8000-000000000003',
  denise: 'bbbbbbbb-0000-4000-8000-000000000004',
  lucia: 'bbbbbbbb-0000-4000-8000-000000000005',
  sana: 'bbbbbbbb-0000-4000-8000-000000000006',
};

/** mock meal / add-on key -> seeded meal UUID */
export const MEAL_ID: Record<string, string> = {
  lasagna: 'cccccccc-0000-4000-8000-000000000001',
  salmon: 'cccccccc-0000-4000-8000-000000000002',
  jollof: 'cccccccc-0000-4000-8000-000000000003',
  shortrib: 'cccccccc-0000-4000-8000-000000000004',
  tacos: 'cccccccc-0000-4000-8000-000000000005',
  biryani: 'cccccccc-0000-4000-8000-000000000006',
  poke: 'cccccccc-0000-4000-8000-000000000007',
  cornbread: 'cccccccc-0000-4000-8000-000000000008',
  lemonade: 'cccccccc-0000-4000-8000-000000000009',
};
