import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GradKey, CookId, Subscription, ServiceRequest, SEED_REQUESTS, genQuotes,
  CONVERSATIONS, Conversation, lineKey,
} from '../data/data';
import { ME } from '../data/cook';
import { computeTotals } from '../data/totals';
import {
  signOutUser, fetchAccountState, submitPrepperApplication, updateDisplayName,
  fetchNotifications, markNotificationRead, markAllNotificationsRead, setKitchenGeo,
  ackApprovalNotice as ackApprovalNoticeApi, deleteAccountServerSide,
  type ApplicationFields, type AppNotification,
} from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { threadUnreadCount, subscribeMyNotifications } from '../lib/messages';
import { fetchOrderStatus } from '../lib/orders';
import { getMyKitchen, getKitchenAvailability, setKitchenAvailability } from '../lib/connect';
import { registerForPushNotifications } from '../lib/push';
import { setViewerCoords } from '../data/supabaseRepository';
import { geocodeAddress, type LatLng } from '../lib/geo';
export type { ApplicationFields };

export type PrepperStatus = 'none' | 'pending' | 'approved';

const LS = 'preppa.v1';

export interface CartLine {
  key: string;
  name: string;
  cook: CookId;
  price: number;
  grad: GradKey;
  qty: number;
  img?: string; // public meal photo; GradBox falls back to `grad` when absent/errored
  mealUuid?: string; // real DB meals.id when the item came from the Supabase catalog
  kitchenUuid?: string; // real DB kitchens.id
  /** Real kitchen display name — set only for non-seed kitchens (see rowToMeal in
   *  supabaseRepository.ts). `cook` is a placeholder demo persona for these; wherever the
   *  cook's name/avatar is shown, prefer this field over COOKS[cook] when it's present. */
  kitchenName?: string;
}
export type OrderFlow = 'paid' | 'cod';

export interface CustomerOrder {
  id: string;
  dbId?: string; // real Supabase orders.id when the card charge succeeded (enables Report an issue)
  /** The grouping key (see `lineKey`) — a real kitchen's UUID, or a seed CookId. */
  cook: string;
  /** Real kitchen display name, carried through for non-seed kitchens (see CartLine). */
  kitchenName?: string;
  lines: CartLine[];
  subtotal: number;
  service: number;
  tax: number;
  delivery: number;
  tip: number;
  total: number;
  mode: 'delivery' | 'pickup';
  flow: OrderFlow;
  status: 'preparing' | 'ready' | 'completed';
  when: string;
}
const SEED_ORDERS: CustomerOrder[] = [
  { id: 'PR-2045', cook: 'denise', lines: [{ key: 'shortrib', name: 'Slow-Braised Short Rib', cook: 'denise', price: 16.5, grad: 'g6', qty: 1 }], subtotal: 16.5, service: 1.65, tax: 1.47, delivery: 0, tip: 3, total: 22.62, mode: 'delivery', flow: 'paid', status: 'completed', when: 'Yesterday' },
  { id: 'PR-2041', cook: 'amara', lines: [{ key: 'jollof', name: 'Smoky Jollof & Chicken', cook: 'amara', price: 12, grad: 'g1', qty: 2 }], subtotal: 24, service: 0, tax: 2.14, delivery: 0, tip: 2, total: 28.14, mode: 'pickup', flow: 'cod', status: 'completed', when: 'Mon' },
];

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string;
}
const SEED_ADDRESSES: Address[] = [
  { id: 'home', label: 'Home', line1: '88 Highland Ave NE, Apt 4', line2: 'Atlanta, GA 30312' },
  { id: 'work', label: 'Work', line1: '1100 Peachtree St NE', line2: 'Atlanta, GA 30309' },
];

export interface Toast {
  id: number;
  msg: string;
  icon: string;
  green: boolean;
}

interface Store {
  ready: boolean;
  onboarded: boolean;
  setOnboarded: (v: boolean) => void;
  resetOnboarding: () => void;

  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  logout: () => void;
  /** Throws (with a user-facing reason) if the server blocks deletion — see src/lib/supabase.ts. */
  deleteAccount: () => Promise<void>;

  cart: CartLine[];
  cartCount: number;
  addToCart: (line: Omit<CartLine, 'qty'>, qty?: number) => void;
  setQty: (key: string, q: number) => void;
  removeLine: (key: string) => void;

  tip: number;
  setTip: (n: number) => void;
  mode: 'delivery' | 'pickup';
  setMode: (m: 'delivery' | 'pickup') => void;
  location: string;
  setLocation: (l: string) => void;
  coords: LatLng | null;
  setCoords: (c: LatLng | null) => void;

  // signed-in user identity (Supabase profile; empty when signed out / before load)
  name: string; // profiles.display_name
  firstName: string; // profiles.first_name
  avatarUrl: string | null; // profiles.avatar_url — shown on the profile hero; null → initials fallback
  saveName: (fullName: string) => Promise<void>; // edit own name (RLS: profiles_update_self)
  setAvatarUrl: (url: string | null) => void; // reflect a just-saved photo without a full re-sync

  addresses: Address[];
  address: Address | null; // currently selected
  addressId: string;
  addAddress: (a: Omit<Address, 'id'>) => string; // returns the id (existing if a duplicate)
  updateAddress: (id: string, patch: Omit<Address, 'id'>) => void;
  selectAddress: (id: string) => void;
  removeAddress: (id: string) => void;

  // role / prepper lifecycle. Reconciled from the server for signed-in users;
  // approval is admin-driven (no client-side auto-approve).
  prepperStatus: PrepperStatus;
  role: 'customer' | 'prepper';
  isAdmin: boolean; // server-derived (profiles.role='admin'); cosmetic gating only
  isPrepPlus: boolean; // PrepPlus member — cosmetic; fee waivers enforced server-side. Never cached.
  prepplusUntil: string | null; // current membership period end (ISO), for display
  payoutsEnabled: boolean; // real Stripe Connect readiness; publish/paid-orders are server-gated on this
  approvalNoticePending: boolean; // one-time "you're approved" welcome not yet acknowledged
  ackApprovalNotice: () => Promise<void>;
  submitApplication: (f: ApplicationFields) => Promise<string>;
  isMine: (cook: CookId) => boolean; // true only for an approved prepper viewing their own listing

  fav: Set<string>;
  toggleFav: (id: string) => void;

  lastOrder: OrderFlow | null;
  placeOrder: (flow: OrderFlow, cook?: string, dbId?: string) => void;
  orders: CustomerOrder[];
  reorder: (id: string) => void;
  refreshOrderStatus: (id: string) => void;

  subscription: Subscription | null;
  subscribe: (s: Subscription) => void;
  updateSub: (patch: Partial<Subscription>) => void;
  cancelSub: () => void;

  requests: ServiceRequest[];
  addRequest: (r: ServiceRequest) => void;
  acceptQuote: (id: string, q: any) => void;

  // prepper "My Hub"
  avail: boolean;
  toggleAvail: () => void;
  acted: string[];
  acceptOrder: (id: string) => void;

  toasts: Toast[];
  toast: (msg: string, icon?: string, green?: boolean) => void;

  flash: { name: string; grad: GradKey } | null; // "added to cart" overlay
  showFlash: (item: { name: string; grad: GradKey }) => void;
  dismissFlash: () => void;

  notifs: AppNotification[];
  conversations: Conversation[];
  markNotifRead: (id: string) => void;
  markConvRead: (cook: CookId) => void;
  markAllRead: () => void;
  notifCount: number;

  // real 1:1 messaging: unread-thread count (drives the Messages badge, separate from alerts)
  threadUnread: number;
  refreshMessaging: () => void;
  // re-pull server account state (role/prepper/PrepPlus) — e.g. after a membership change
  reconcileAccount: () => Promise<void>;
}

const StoreContext = createContext<Store>(null as any);
export const useStore = () => useContext(StoreContext);

// Narrow contexts for hot components (meal cards) so they don't wake on unrelated store
// churn (toasts, the flash overlay, cart edits). `useStore()` stays the full compat API.
type Actions = Pick<Store, 'addToCart' | 'toggleFav' | 'showFlash' | 'isMine' | 'toast'>;
const ActionsContext = createContext<Actions>(null as any);
const FavContext = createContext<{ fav: Set<string>; toggleFav: (id: string) => void }>(null as any);
/** Stable action handlers only — identity changes rarely (≈ role change), never on toast/flash/cart. */
export const useActions = () => useContext(ActionsContext);
/** The favorites set + toggler. Re-renders on favorite changes only. */
export const useFav = () => useContext(FavContext);

let toastSeq = 1;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboardedState] = useState(false);
  const [darkMode, setDarkModeState] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tip, setTip] = useState(2);
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [location, setLocation] = useState('Atlanta, GA');
  const [coords, setCoordsState] = useState<LatLng | null>(null);
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fav, setFav] = useState<Set<string>>(new Set());
  const [prepperStatus, setPrepperStatus] = useState<PrepperStatus>('none');
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [approvalNoticePending, setApprovalNoticePending] = useState(false);
  const [isPrepPlus, setIsPrepPlus] = useState(false);
  const [prepplusUntil, setPrepplusUntil] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addresses, setAddresses] = useState<Address[]>(SEED_ADDRESSES);
  const [addressId, setAddressId] = useState('home');
  const [lastOrder, setLastOrder] = useState<OrderFlow | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>(SEED_ORDERS);
  // Stored as a list constrained to length 1 for MVP (one active plan). Modeling it
  // as an array means "add a second plan" later is a config flip, not a rewrite.
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>(SEED_REQUESTS);
  const [avail, setAvail] = useState(true);
  const [acted, setActed] = useState<string[]>([]);
  const [notifs, setNotifs] = useState<AppNotification[]>([]); // real notifications from the DB
  const [threadUnread, setThreadUnread] = useState(0); // unread DM threads (real messaging)
  const [uid, setUid] = useState<string | null>(null); // signed-in user id (drives Realtime subscriptions)
  const [conversations, setConversations] = useState<Conversation[]>(CONVERSATIONS);
  const [flash, setFlash] = useState<{ name: string; grad: GradKey } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const hydrated = useRef(false);

  // hydrate
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LS);
        if (raw) {
          const s = JSON.parse(raw);
          if (s.onboarded) setOnboardedState(true);
          if (s.darkMode) setDarkModeState(true);
          if (Array.isArray(s.cart)) setCart(s.cart);
          if (typeof s.tip === 'number') setTip(s.tip);
          if (s.mode) setMode(s.mode);
          if (typeof s.location === 'string') setLocation(s.location);
          if (s.coords && typeof s.coords.lat === 'number' && typeof s.coords.lng === 'number') { setCoordsState(s.coords); setViewerCoords(s.coords); }
          if (typeof s.name === 'string') setName(s.name);
          if (typeof s.firstName === 'string') setFirstName(s.firstName);
          if (Array.isArray(s.fav)) setFav(new Set(s.fav));
          // prepperStatus is deliberately NOT hydrated from storage — it's an access
          // gate (My Hub) and must reflect the live session, not a stale cached role.
          // reconcileAccount() sets it authoritatively from the server (see below).
          if (Array.isArray(s.addresses)) setAddresses(s.addresses);
          if (typeof s.addressId === 'string') setAddressId(s.addressId);
          if (s.lastOrder) setLastOrder(s.lastOrder);
          if (Array.isArray(s.orders)) setOrders(s.orders);
          if (Array.isArray(s.subs)) setSubs(s.subs);
          else if (s.subscription) setSubs([s.subscription]); // migrate old single-object shape
          if (Array.isArray(s.requests)) setRequests(s.requests);
          if (typeof s.avail === 'boolean') setAvail(s.avail);
        }
      } catch {}
      hydrated.current = true;
      setReady(true);
    })();
  }, []);

  // persist
  useEffect(() => {
    if (!hydrated.current) return;
    AsyncStorage.setItem(
      LS,
      JSON.stringify({ onboarded, darkMode, cart, tip, mode, location, coords, name, firstName, fav: [...fav], addresses, addressId, lastOrder, orders, subs, requests, avail }),
    ).catch(() => {});
  }, [onboarded, darkMode, cart, tip, mode, location, coords, name, firstName, fav, addresses, addressId, lastOrder, orders, subs, requests, avail]);

  const toast = useCallback((msg: string, icon = 'check', green = false) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, msg, icon, green }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // --- role / prepper lifecycle -------------------------------------------
  // Reconcile the user's real role/status from the backend so admin gating and
  // prepper approval reflect server truth (not a local flag). Runs after hydrate
  // and on every auth change. Signed out ⇒ 'none' (no elevated access retained).
  const reconcileAccount = useCallback(async () => {
    try {
      const s = await fetchAccountState();
      setIsAdmin(s.isAdmin);
      // Authoritative: prepperStatus always follows the live session. When signed
      // out, fetchAccountState returns 'none', so a stale cached role can never keep
      // My Hub visible to a guest/customer on a browser a prepper once used.
      setPrepperStatus(s.prepperStatus);
      setPayoutsEnabled(s.payoutsEnabled);
      setApprovalNoticePending(s.approvalNoticePending);
      // PrepPlus entitlement, same never-cached discipline as prepperStatus.
      setIsPrepPlus(s.isPrepPlus);
      setPrepplusUntil(s.prepplusUntil);
      const { data: sess } = await supabase.auth.getSession();
      setUid(sess.session?.user?.id ?? null);
      if (s.signedIn) {
        if (s.displayName) setName(s.displayName);
        if (s.firstName) setFirstName(s.firstName);
        setAvatarUrl(s.avatarUrl); // authoritative — set even when null so a removed photo clears
        try { setNotifs(await fetchNotifications()); } catch { /* keep last */ }
        try { setThreadUnread(await threadUnreadCount()); } catch { /* keep last */ }
        // Fire-and-forget: no-ops on web / before an EAS project is linked, and never
        // throws (see src/lib/push.ts) — safe to leave unawaited here.
        registerForPushNotifications();
      } else {
        setAvatarUrl(null);
        setNotifs([]); // signed out — no notifications
        setThreadUnread(0);
      }
    } catch {
      // transient network/permission issue — keep the last known state
    }
  }, []);

  // Refresh just the messaging unread count (called after opening/reading a thread).
  const refreshMessaging = useCallback(async () => {
    try { setThreadUnread(await threadUnreadCount()); } catch { /* keep last */ }
  }, []);

  const saveName = useCallback(async (fullName: string) => {
    const { displayName, firstName: fn } = await updateDisplayName(fullName);
    setName(displayName);
    setFirstName(fn);
  }, []);
  useEffect(() => {
    if (!ready) return;
    reconcileAccount();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Skip hourly TOKEN_REFRESHED and the INITIAL_SESSION echo — the reconcile on mount
      // (above) already covers boot. Reconciling on those re-ran 3 serial round trips + a
      // notifications refetch for the whole session. Only real sign-in/out/user changes matter.
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
      // Defer out of the callback: supabase-js v2 holds the auth lock while this runs, so
      // calling auth methods (getSession, inside reconcileAccount) synchronously can deadlock.
      setTimeout(() => { reconcileAccount(); }, 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [ready, reconcileAccount]);

  // Re-check approval/payout status when the app returns to the foreground — otherwise an
  // approval that happened while the app was merely backgrounded (not a fresh sign-in) would
  // never surface the welcome overlay until the next cold start.
  useEffect(() => {
    if (!ready) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') reconcileAccount();
    });
    return () => sub.remove();
  }, [ready, reconcileAccount]);

  const ackApprovalNotice = useCallback(async () => {
    setApprovalNoticePending(false); // optimistic — never re-shown even if the RPC is slow/offline
    try { await ackApprovalNoticeApi(); } catch { /* best-effort; harmless if it re-appears once */ }
  }, []);

  // Live in-app updates over Supabase Realtime, keyed on the signed-in user. New rows on the
  // per-user notifications channel light the bell AND refresh the messaging badge without a
  // poll (postgres_changes can't filter "my threads", so the notifications channel is the
  // list/badge signal — see src/lib/messages.ts). Re-subscribes when the user changes.
  useEffect(() => {
    if (!uid) return;
    const off = subscribeMyNotifications(uid, () => {
      fetchNotifications().then(setNotifs).catch(() => {});
      threadUnreadCount().then(setThreadUnread).catch(() => {});
    });
    return off;
  }, [uid]);

  const role: 'customer' | 'prepper' = prepperStatus === 'approved' ? 'prepper' : 'customer';
  const isMine = useCallback((cook: CookId) => prepperStatus === 'approved' && cook === ME.id, [prepperStatus]);
  // Full cook application (identity + kitchen + food-safety + agreement). Admin-driven
  // approval — no client-side auto-approve. Throws on failure so the form can show it.
  const submitApplication = useCallback(async (f: ApplicationFields) => {
    const kitchenId = await submitPrepperApplication(f);
    if (f.legalName && f.legalName !== name) { try { await saveName(f.legalName); } catch {} }
    setPrepperStatus('pending');
    // Best-effort: geocode the kitchen's location so buyers can sort it by proximity.
    try {
      const geo = await geocodeAddress(f.address || f.neighborhood);
      if (geo && kitchenId) await setKitchenGeo(kitchenId, geo.lat, geo.lng);
    } catch { /* non-blocking — proximity is a nice-to-have, not a gate */ }
    return kitchenId; // caller uses it to start Stripe Connect onboarding
  }, [name, saveName]);

  const addToCart = useCallback((line: Omit<CartLine, 'qty'>, qty = 1) => {
    if (isMine(line.cook)) { toast('You can’t order from your own kitchen', 'info'); return; }
    setCart((c) => {
      const i = c.findIndex((l) => l.key === line.key);
      if (i >= 0) {
        const n = [...c];
        n[i] = { ...n[i], qty: n[i].qty + qty };
        return n;
      }
      return [...c, { ...line, qty }];
    });
  }, [isMine, toast]);
  const setQtyFn = useCallback((key: string, q: number) => {
    setCart((c) => (q <= 0 ? c.filter((l) => l.key !== key) : c.map((l) => (l.key === key ? { ...l, qty: q } : l))));
  }, []);
  const removeLine = useCallback((key: string) => setCart((c) => c.filter((l) => l.key !== key)), []);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);

  const toggleFav = useCallback((id: string) => {
    setFav((f) => {
      const n = new Set(f);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  // --- addresses ---
  const norm = (a: Omit<Address, 'id'>) => `${a.label.trim().toLowerCase()}|${a.line1.trim().toLowerCase()}|${a.line2.trim().toLowerCase()}`;
  const addAddress = useCallback((a: Omit<Address, 'id'>): string => {
    // Dedup: an identical (label/line1/line2) address returns the existing id
    // instead of stacking a duplicate row.
    const dup = addresses.find((x) => norm(x) === norm(a));
    if (dup) {
      setAddressId(dup.id);
      return dup.id;
    }
    const id = 'addr-' + (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-5);
    setAddresses((xs) => [...xs, { ...a, id }]);
    setAddressId(id); // newly added becomes the selected one
    return id;
  }, [addresses]);
  const updateAddress = useCallback((id: string, patch: Omit<Address, 'id'>) => {
    setAddresses((xs) => xs.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }, []);
  const selectAddress = useCallback((id: string) => setAddressId(id), []);
  const removeAddress = useCallback((id: string) => {
    setAddresses((xs) => {
      const n = xs.filter((a) => a.id !== id);
      setAddressId((cur) => (cur === id ? n[0]?.id ?? '' : cur));
      return n;
    });
  }, []);
  // Keep `addressId` pointing at a real row so the picker highlight and the address
  // checkout actually uses can never diverge (fixes the "default didn't stick" drift).
  useEffect(() => {
    if (addresses.length && !addresses.some((a) => a.id === addressId)) {
      setAddressId(addresses[0].id);
    }
  }, [addresses, addressId]);
  const address = addresses.find((a) => a.id === addressId) ?? addresses[0] ?? null;
  const subscription = subs[0] ?? null; // MVP exposes the single active plan

  // Multi-cart: one order PER cook. `cook` scopes checkout to a single cook's lines
  // (and removes only those from the cart); without it, every cook in the cart becomes
  // its own order. Fixes the old bug where a mixed-cook cart collapsed into one order.
  const placeOrder = useCallback((flow: OrderFlow, cook?: string, dbId?: string) => {
    const targetKeys = cook ? [cook] : Array.from(new Set(cart.map(lineKey)));
    const stamp = Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36);
    const newOrders = targetKeys
      .map((key, idx): CustomerOrder | null => {
        const lines = cart.filter((l) => lineKey(l) === key);
        if (!lines.length) return null;
        const t = computeTotals(lines, tip, mode); // per-cook totals
        return {
          id: 'PR-' + (stamp + idx).slice(-6).toUpperCase(),
          // dbId only applies to the single-cook card path (checkout passes one key).
          dbId: targetKeys.length === 1 ? dbId : undefined,
          cook: key, kitchenName: lines[0]?.kitchenName, lines,
          subtotal: t.subtotal, service: t.service, tax: t.tax, delivery: t.delivery, tip: t.tip, total: t.total,
          mode, flow,
          status: flow === 'cod' ? 'completed' : 'preparing',
          when: 'Just now',
        };
      })
      .filter((o): o is CustomerOrder => o !== null);
    if (newOrders.length) setOrders((os) => [...newOrders, ...os]);
    setCart((cs) => (cook ? cs.filter((l) => lineKey(l) !== cook) : []));
    setLastOrder(flow);
    setTip(2);
  }, [cart, tip, mode]);
  const reorder = useCallback((id: string) => {
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const lines = o.lines.filter((l) => !isMine(l.cook)); // never re-buy your own listing
    if (lines.length === 0) { toast('That order is from your own kitchen', 'info'); return; }
    lines.forEach((l) => addToCart({ key: l.key, name: l.name, cook: l.cook, price: l.price, grad: l.grad, img: l.img, kitchenUuid: l.kitchenUuid, kitchenName: l.kitchenName }, l.qty));
    toast(`Added to cart · ${lines.length} item${lines.length !== 1 ? 's' : ''}`, 'cart', true);
  }, [orders, addToCart, toast, isMine]);
  // Pulls the real fulfillment status for a real (dbId-backed) order and patches it into local state.
  const refreshOrderStatus = useCallback((id: string) => {
    const o = orders.find((x) => x.id === id);
    if (!o?.dbId || o.status === 'completed') return;
    fetchOrderStatus(o.dbId).then((row) => {
      if (!row) return;
      const next: CustomerOrder['status'] | null =
        row.status === 'ready' ? 'ready' : row.status === 'completed' ? 'completed'
        : row.status === 'preparing' || row.status === 'confirmed' || row.status === 'pending' ? 'preparing'
        : null; // cancelled or unrecognized: leave display as-is
      if (next && next !== o.status) setOrders((os) => os.map((x) => (x.id === id ? { ...x, status: next } : x)));
    }).catch(() => {});
  }, [orders]);

  const resetOnboarding = useCallback(() => setOnboardedState(false), []);
  const logout = useCallback(() => { signOutUser(); setPrepperStatus('none'); setIsAdmin(false); setIsPrepPlus(false); setPrepplusUntil(null); setOnboardedState(false); }, []);
  const deleteAccount = useCallback(async () => {
    // Apple 5.1.1(v) / Google Play: account-deletion path. Calls the real delete-account edge
    // function FIRST (anonymizes the profile, soft-deletes the auth user so sign-in is
    // actually disabled) — local state is only cleared once that has genuinely succeeded.
    // Throws (with a specific, user-facing reason) if a cook's kitchen has in-flight orders,
    // an uncashed balance, or active subscribers — the caller must surface that, not swallow it.
    await deleteAccountServerSide();
    signOutUser();
    AsyncStorage.removeItem(LS).catch(() => {});
    setCart([]);
    setFav(new Set());
    setAddresses(SEED_ADDRESSES);
    setAddressId('home');
    setSubs([]);
    setOrders(SEED_ORDERS);
    setRequests(SEED_REQUESTS);
    setLastOrder(null);
    setTip(2);
    setMode('delivery');
    setLocation('Atlanta, GA');
    setCoordsState(null); setViewerCoords(null);
    setName('');
    setFirstName('');
    setAvatarUrl(null);
    setDarkModeState(false);
    setAvail(true);
    setActed([]);
    setPrepperStatus('none');
    setIsAdmin(false);
    setIsPrepPlus(false);
    setPrepplusUntil(null);
    setOnboardedState(false);
  }, []);

  const subscribe = useCallback((s: Subscription) => {
    if (s.cook && isMine(s.cook)) { toast('You can’t reserve your own plan', 'info'); return; }
    setSubs([s]);
  }, [isMine, toast]);
  const updateSub = useCallback((patch: Partial<Subscription>) => setSubs((a) => (a[0] ? [{ ...a[0], ...patch }] : a)), []);
  const cancelSub = useCallback(() => setSubs([]), []);


  const addRequest = useCallback(
    (req: ServiceRequest) => {
      setRequests((rs) => [req, ...rs]);
      setTimeout(() => {
        setRequests((rs) => rs.map((r) => (r.id === req.id && r.status === 'open' ? { ...r, status: 'quoted', quotes: genQuotes(r) } : r)));
        toast('New quotes on your request', 'tag', true);
      }, 8000);
    },
    [toast],
  );
  const acceptQuote = useCallback((id: string, q: any) => {
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status: 'booked', booked: q } : r)));
  }, []);

  // Persists to kitchens.availability (audit Critical: this used to be local-device-only
  // state, so a prepper's "paused" toggle never actually blocked orders server-side).
  // Optimistic update with rollback on failure.
  const toggleAvail = useCallback(() => {
    setAvail((prevAvail) => {
      const next = !prevAvail;
      (async () => {
        try {
          const kitchen = await getMyKitchen();
          if (!kitchen) throw new Error('No kitchen found for this account.');
          await setKitchenAvailability(kitchen.id, next);
          toast(next ? 'You’re open for orders' : 'Kitchen paused', next ? 'check' : 'pause', next);
        } catch (e: any) {
          setAvail(prevAvail); // rollback — the DB write failed, don't show a state that isn't real
          toast(e?.message || 'Could not update availability. Please try again.', 'info');
        }
      })();
      return next;
    });
  }, [toast]);

  // Sync `avail` from the real DB column on load — the AsyncStorage-persisted value above
  // is only a display cache now, never the source of truth for whether orders are blocked.
  useEffect(() => {
    let alive = true;
    getMyKitchen().then((k) => {
      if (!alive || !k) return;
      getKitchenAvailability(k.id).then((open) => { if (alive) setAvail(open); });
    });
    return () => { alive = false; };
  }, []);
  const acceptOrder = useCallback((id: string) => setActed((a) => [...a, id]), []);

  const showFlash = useCallback((item: { name: string; grad: GradKey }) => {
    setFlash(item);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3500);
  }, []);
  const dismissFlash = useCallback(() => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(null);
  }, []);

  const markNotifRead = useCallback((id: string) => {
    setNotifs((ns) => ns.map((n) => (n.id === id ? { ...n, unread: false } : n))); // optimistic
    markNotificationRead(id).catch(() => {});
  }, []);
  const markConvRead = useCallback((cook: CookId) => setConversations((cs) => cs.map((cv) => (cv.cook === cook ? { ...cv, unread: 0 } : cv))), []);
  const markAllRead = useCallback(() => {
    setNotifs((ns) => ns.map((n) => ({ ...n, unread: false }))); // optimistic
    markAllNotificationsRead().catch(() => {});
  }, []);
  // Keep the repository's viewer coords in sync so the catalog can sort nearest-first.
  const setCoords = useCallback((cc: LatLng | null) => { setCoordsState(cc); setViewerCoords(cc); }, []);
  // Bell/badge counts real unread notifications only (buyer↔cook DMs are deferred).
  const notifCount = notifs.filter((n) => n.unread).length;

  const value: Store = {
    ready,
    onboarded,
    setOnboarded: setOnboardedState,
    resetOnboarding,
    darkMode,
    setDarkMode: setDarkModeState,
    logout,
    deleteAccount,
    cart,
    cartCount,
    addToCart,
    setQty: setQtyFn,
    removeLine,
    tip,
    setTip,
    mode,
    setMode,
    location,
    setLocation,
    coords,
    setCoords,
    name,
    firstName,
    avatarUrl,
    saveName,
    setAvatarUrl,
    addresses,
    address,
    addressId,
    addAddress,
    updateAddress,
    selectAddress,
    removeAddress,
    prepperStatus,
    payoutsEnabled,
    approvalNoticePending,
    ackApprovalNotice,
    role,
    submitApplication,
    isAdmin,
    isPrepPlus,
    prepplusUntil,
    isMine,
    fav,
    toggleFav,
    lastOrder,
    placeOrder,
    orders,
    reorder,
    refreshOrderStatus,
    subscription,
    subscribe,
    updateSub,
    cancelSub,
    requests,
    addRequest,
    acceptQuote,
    avail,
    toggleAvail,
    acted,
    acceptOrder,
    toasts,
    toast,
    flash,
    showFlash,
    dismissFlash,
    notifs,
    conversations,
    markNotifRead,
    markConvRead,
    markAllRead,
    notifCount,
    threadUnread,
    refreshMessaging,
    reconcileAccount,
  };

  // Memoized narrow slices: `actions` changes only when a handler identity changes (≈ role);
  // `favValue` only when the favorites set changes — so meal cards ignore toast/flash/cart churn.
  const actions = useMemo<Actions>(() => ({ addToCart, toggleFav, showFlash, isMine, toast }), [addToCart, toggleFav, showFlash, isMine, toast]);
  const favValue = useMemo(() => ({ fav, toggleFav }), [fav, toggleFav]);

  return (
    <StoreContext.Provider value={value}>
      <ActionsContext.Provider value={actions}>
        <FavContext.Provider value={favValue}>{children}</FavContext.Provider>
      </ActionsContext.Provider>
    </StoreContext.Provider>
  );
}
