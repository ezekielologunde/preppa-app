import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase + Stripe connection for real (test-mode) card payments.
 * URL + anon key + Stripe publishable key are all PUBLIC by design.
 * The Stripe SECRET key lives only as a Supabase Edge Function secret — never here.
 */
export const SUPABASE_URL = 'https://fwidhpzwldneeaphrxgg.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3aWRocHp3bGRuZWVhcGhyeGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMyMTk2ODMsImV4cCI6MjA5ODc5NTY4M30.KH8x-bMEq__ADEv47lqeqDM12B4hu6CkVhZQzbqsh2E';

export const STRIPE_PK =
  'pk_test_51TbwCHJP8OvIS2L3l7DC5FGiyKJ4AdivhkShTMqO71jQ7r1DHYRGa2bEFvEnxAiufrnqSdrsMoB1QfPYs0bXqjHd00lw0UZ41x';

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
  if (!uid) return { signedIn: false, isAdmin: false, prepperStatus: 'none', displayName: null, firstName: null };

  const { data: prof } = await supabase.from('profiles').select('role, display_name, first_name').eq('id', uid).maybeSingle();
  const role = (prof?.role as string) ?? 'customer';
  const displayName = (prof?.display_name as string) ?? null;
  const firstName = (prof?.first_name as string) ?? null;
  const isAdmin = role === 'admin';

  // Hub access (prepperStatus) reflects actually OWNING A KITCHEN, not the `role`
  // flag alone. This guards orphaned 'prepper' roles — e.g. a kitchen that was later
  // removed would otherwise leave the account showing My Hub with nothing to manage.
  const { data: k } = await supabase
    .from('kitchens')
    .select('verification_status')
    .eq('owner_id', uid)
    .order('created_at', { ascending: false })
    .limit(1);
  const kv = k?.[0]?.verification_status as string | undefined;
  const prepperStatus: PrepperStatusValue = kv === 'verified' ? 'approved' : kv === 'pending' ? 'pending' : 'none';
  return { signedIn: true, isAdmin, prepperStatus, displayName, firstName };
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

/** Upload an avatar image to the owner-scoped `avatars` bucket; returns its public URL. Web-first. */
export async function uploadAvatar(file: Blob, ext: string): Promise<string> {
  return uploadPublicImage(file, ext, 'avatar');
}

/** Upload a plan cover image (public, customer-facing) to the owner-scoped `avatars` bucket. */
export async function uploadPlanCover(file: Blob, ext: string): Promise<string> {
  return uploadPublicImage(file, ext, 'plan-cover');
}

async function uploadPublicImage(file: Blob, ext: string, prefix: string): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error('You need to be signed in.');
  const path = `${uid}/${prefix}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: (file as any).type || `image/${ext}`,
  });
  if (error) throw error;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
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
  foodHandlerCert?: string;
  story: string;
  agreementVersion: string;
}

/**
 * Submit a real prepper application: creates a pending kitchen + private details
 * (phone/address/food-safety/agreement) + verification rows for admin review.
 * (Requires the extended `request_prepper_application` RPC — see the pending migration.)
 */
export async function submitPrepperApplication(f: ApplicationFields): Promise<string> {
  const { data, error } = await supabase.rpc('request_prepper_application', {
    p_kitchen_name: f.kitchenName,
    p_cuisine: f.cuisine,
    p_approx_area: f.neighborhood,
    p_bio: f.story,
    p_phone: f.phone,
    p_address: f.address,
    p_food_safety: f.foodSafety,
    p_food_handler_cert: f.foodHandlerCert ?? null,
    p_agreement_version: f.agreementVersion,
    p_service_types: f.serviceTypes,
    p_service_area: f.serviceArea ?? null,
    p_experience: f.experience ?? null,
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

/** Upload a verification photo/document to the private, owner-scoped `cook-docs`
 *  bucket, grouped by kind (`govid` | `selfie` | `fridge` | `kitchen`). Returns the
 *  stored path (kept in the application's food_safety.docs). */
export async function uploadCookPhoto(file: Blob, group: string): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error('You need to be signed in.');
  const ext = (((file as any).name?.split('.').pop()) || ((file as any).type?.split('/').pop()) || 'jpg').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${uid}/${group}-${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage.from('cook-docs').upload(path, file, {
    upsert: true,
    contentType: (file as any).type || undefined,
  });
  if (error) throw error;
  return path;
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
