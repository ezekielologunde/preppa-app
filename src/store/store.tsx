import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GradKey, CookId, Subscription, ServiceRequest, SEED_REQUESTS, genQuotes,
  NOTIFS, CONVERSATIONS, Notif, Conversation, FeedItem,
} from '../data/data';
import { ME } from '../data/cook';
import { computeTotals } from '../data/totals';

export type PrepperStatus = 'none' | 'pending' | 'approved';

const LS = 'preppa.v1';

export interface CartLine {
  key: string;
  name: string;
  cook: CookId;
  price: number;
  grad: GradKey;
  qty: number;
}
export type OrderFlow = 'paid' | 'cod';

export interface CustomerOrder {
  id: string;
  cook: CookId;
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

export interface Card {
  id: string;
  brand: string;
  last4: string;
  exp: string;
}
const SEED_CARDS: Card[] = [
  { id: 'visa4242', brand: 'Visa', last4: '4242', exp: '08/27' },
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
  deleteAccount: () => void;

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

  addresses: Address[];
  address: Address | null; // currently selected
  addressId: string;
  addAddress: (a: Omit<Address, 'id'>) => void;
  selectAddress: (id: string) => void;
  removeAddress: (id: string) => void;

  cards: Card[];
  card: Card | null; // currently selected
  cardId: string;
  addCard: (c: Omit<Card, 'id'>) => void;
  selectCard: (id: string) => void;
  removeCard: (id: string) => void;

  // role / prepper lifecycle (client-simulated for this UI round; real approval must be server-side)
  prepperStatus: PrepperStatus;
  role: 'customer' | 'prepper';
  applyToPrepper: () => void;
  approvePrepper: () => void; // dev/instant approve
  isMine: (cook: CookId) => boolean; // true only for an approved prepper viewing their own listing

  fav: Set<string>;
  toggleFav: (id: string) => void;

  lastOrder: OrderFlow | null;
  placeOrder: (flow: OrderFlow) => void;
  orders: CustomerOrder[];
  reorder: (id: string) => void;

  subscription: Subscription | null;
  subscribe: (s: Subscription) => void;
  updateSub: (patch: Partial<Subscription>) => void;
  cancelSub: () => void;

  requests: ServiceRequest[];
  addRequest: (r: ServiceRequest) => void;
  acceptQuote: (id: string, q: any) => void;

  reels: FeedItem[]; // prepper-posted reels, newest first (Phase 1: photo cover, no real video)
  postReel: (r: FeedItem) => void;

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

  notifs: Notif[];
  conversations: Conversation[];
  markNotifRead: (id: string) => void;
  markConvRead: (cook: CookId) => void;
  markAllRead: () => void;
  notifCount: number;
}

const StoreContext = createContext<Store>(null as any);
export const useStore = () => useContext(StoreContext);

let toastSeq = 1;

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboardedState] = useState(false);
  const [darkMode, setDarkModeState] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [tip, setTip] = useState(2);
  const [mode, setMode] = useState<'delivery' | 'pickup'>('delivery');
  const [location, setLocation] = useState('Atlanta, GA');
  const [fav, setFav] = useState<Set<string>>(new Set());
  const [prepperStatus, setPrepperStatus] = useState<PrepperStatus>('none');
  const [addresses, setAddresses] = useState<Address[]>(SEED_ADDRESSES);
  const [addressId, setAddressId] = useState('home');
  const [cards, setCards] = useState<Card[]>(SEED_CARDS);
  const [cardId, setCardId] = useState('visa4242');
  const [lastOrder, setLastOrder] = useState<OrderFlow | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>(SEED_ORDERS);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>(SEED_REQUESTS);
  const [reels, setReels] = useState<FeedItem[]>([]);
  const [avail, setAvail] = useState(true);
  const [acted, setActed] = useState<string[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>(NOTIFS);
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
          if (Array.isArray(s.fav)) setFav(new Set(s.fav));
          if (s.prepperStatus) setPrepperStatus(s.prepperStatus);
          if (Array.isArray(s.addresses)) setAddresses(s.addresses);
          if (typeof s.addressId === 'string') setAddressId(s.addressId);
          if (Array.isArray(s.cards)) setCards(s.cards);
          if (typeof s.cardId === 'string') setCardId(s.cardId);
          if (s.lastOrder) setLastOrder(s.lastOrder);
          if (Array.isArray(s.orders)) setOrders(s.orders);
          if (s.subscription) setSubscription(s.subscription);
          if (Array.isArray(s.requests)) setRequests(s.requests);
          if (Array.isArray(s.reels)) setReels(s.reels);
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
      JSON.stringify({ onboarded, darkMode, cart, tip, mode, location, fav: [...fav], prepperStatus, addresses, addressId, cards, cardId, lastOrder, orders, subscription, requests, avail, reels }),
    ).catch(() => {});
  }, [onboarded, darkMode, cart, tip, mode, location, fav, prepperStatus, addresses, addressId, cards, cardId, lastOrder, orders, subscription, requests, avail, reels]);

  const toast = useCallback((msg: string, icon = 'check', green = false) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, msg, icon, green }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // --- role / prepper lifecycle (client-simulated; real approval must be server-side) ---
  const role: 'customer' | 'prepper' = prepperStatus === 'approved' ? 'prepper' : 'customer';
  const isMine = useCallback((cook: CookId) => prepperStatus === 'approved' && cook === ME.id, [prepperStatus]);
  const applyToPrepper = useCallback(() => {
    setPrepperStatus((s) => (s === 'approved' ? s : 'pending'));
    toast('Application received — under review', 'chefhat');
    setTimeout(() => {
      setPrepperStatus('approved');
      toast('You’re approved to cook! My Hub unlocked 👩‍🍳', 'chefhat', true);
    }, 5000);
  }, [toast]);
  const approvePrepper = useCallback(() => {
    setPrepperStatus('approved');
    toast('My Hub unlocked 👩‍🍳', 'chefhat', true);
  }, [toast]);

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
  const addAddress = useCallback((a: Omit<Address, 'id'>) => {
    const id = 'addr-' + (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-5);
    setAddresses((xs) => [...xs, { ...a, id }]);
    setAddressId(id); // newly added becomes the selected one
  }, []);
  const selectAddress = useCallback((id: string) => setAddressId(id), []);
  const removeAddress = useCallback((id: string) => {
    setAddresses((xs) => {
      const n = xs.filter((a) => a.id !== id);
      setAddressId((cur) => (cur === id ? n[0]?.id ?? '' : cur));
      return n;
    });
  }, []);
  const address = addresses.find((a) => a.id === addressId) ?? addresses[0] ?? null;

  // --- payment cards ---
  const addCard = useCallback((cd: Omit<Card, 'id'>) => {
    const id = 'card-' + (Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36)).slice(-5);
    setCards((xs) => [...xs, { ...cd, id }]);
    setCardId(id);
  }, []);
  const selectCard = useCallback((id: string) => setCardId(id), []);
  const removeCard = useCallback((id: string) => {
    setCards((xs) => {
      const n = xs.filter((c) => c.id !== id);
      setCardId((cur) => (cur === id ? n[0]?.id ?? '' : cur));
      return n;
    });
  }, []);
  const card = cards.find((c) => c.id === cardId) ?? cards[0] ?? null;

  const placeOrder = useCallback((flow: OrderFlow) => {
    if (cart.length > 0) {
      const t = computeTotals(cart, tip, mode); // single source of truth — matches the cart UI
      const id = 'PR-' + (Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36)).slice(-6).toUpperCase();
      const order: CustomerOrder = {
        id,
        cook: cart[0].cook,
        lines: cart,
        subtotal: t.subtotal,
        service: t.service,
        tax: t.tax,
        delivery: t.delivery,
        tip: t.tip,
        total: t.total,
        mode,
        flow,
        status: flow === 'cod' ? 'completed' : 'preparing',
        when: 'Just now',
      };
      setOrders((os) => [order, ...os]);
    }
    setLastOrder(flow);
    setCart([]);
    setTip(2);
  }, [cart, tip, mode]);
  const reorder = useCallback((id: string) => {
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const lines = o.lines.filter((l) => !isMine(l.cook)); // never re-buy your own listing
    if (lines.length === 0) { toast('That order is from your own kitchen', 'info'); return; }
    lines.forEach((l) => addToCart({ key: l.key, name: l.name, cook: l.cook, price: l.price, grad: l.grad }, l.qty));
    toast(`Added to cart · ${lines.length} item${lines.length !== 1 ? 's' : ''}`, 'cart', true);
  }, [orders, addToCart, toast, isMine]);

  const resetOnboarding = useCallback(() => setOnboardedState(false), []);
  const logout = useCallback(() => { setPrepperStatus('none'); setOnboardedState(false); }, []);
  const deleteAccount = useCallback(() => {
    // Apple 5.1.1(v): account-deletion path. (On a real backend this also calls the server.)
    AsyncStorage.removeItem(LS).catch(() => {});
    setCart([]);
    setFav(new Set());
    setAddresses(SEED_ADDRESSES);
    setAddressId('home');
    setCards(SEED_CARDS);
    setCardId('visa4242');
    setSubscription(null);
    setOrders(SEED_ORDERS);
    setRequests(SEED_REQUESTS);
    setReels([]);
    setLastOrder(null);
    setTip(2);
    setMode('delivery');
    setLocation('Atlanta, GA');
    setDarkModeState(false);
    setAvail(true);
    setActed([]);
    setPrepperStatus('none');
    setOnboardedState(false);
  }, []);

  const subscribe = useCallback((s: Subscription) => {
    if (s.cook && isMine(s.cook)) { toast('You can’t subscribe to your own plan', 'info'); return; }
    setSubscription(s);
  }, [isMine, toast]);
  const updateSub = useCallback((patch: Partial<Subscription>) => setSubscription((s) => (s ? { ...s, ...patch } : s)), []);
  const cancelSub = useCallback(() => setSubscription(null), []);

  const postReel = useCallback((r: FeedItem) => setReels((rs) => [r, ...rs]), []);

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

  const toggleAvail = useCallback(() => {
    setAvail((a) => {
      toast(a ? 'Kitchen paused' : 'You’re open for orders', a ? 'pause' : 'check', !a);
      return !a;
    });
  }, [toast]);
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

  const markNotifRead = useCallback((id: string) => setNotifs((ns) => ns.map((n) => (n.id === id ? { ...n, unread: false } : n))), []);
  const markConvRead = useCallback((cook: CookId) => setConversations((cs) => cs.map((cv) => (cv.cook === cook ? { ...cv, unread: 0 } : cv))), []);
  const markAllRead = useCallback(() => {
    setNotifs((ns) => ns.map((n) => ({ ...n, unread: false })));
    setConversations((cs) => cs.map((cv) => ({ ...cv, unread: 0 })));
  }, []);
  const notifCount = notifs.filter((n) => n.unread).length + conversations.reduce((s, cv) => s + (cv.unread ? 1 : 0), 0);

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
    addresses,
    address,
    addressId,
    addAddress,
    selectAddress,
    removeAddress,
    cards,
    card,
    cardId,
    addCard,
    selectCard,
    removeCard,
    prepperStatus,
    role,
    applyToPrepper,
    approvePrepper,
    isMine,
    fav,
    toggleFav,
    lastOrder,
    placeOrder,
    orders,
    reorder,
    subscription,
    subscribe,
    updateSub,
    cancelSub,
    requests,
    addRequest,
    reels,
    postReel,
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
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
