import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GradKey, CookId, Subscription, ServiceRequest, SEED_REQUESTS, genQuotes,
  NOTIFS, CONVERSATIONS,
} from '../data/data';
import { computeTotals } from '../data/totals';

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

  cart: CartLine[];
  cartCount: number;
  addToCart: (line: Omit<CartLine, 'qty'>, qty?: number) => void;
  setQty: (key: string, q: number) => void;
  removeLine: (key: string) => void;

  tip: number;
  setTip: (n: number) => void;
  mode: 'delivery' | 'pickup';
  setMode: (m: 'delivery' | 'pickup') => void;

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

  // prepper "My Hub"
  avail: boolean;
  toggleAvail: () => void;
  acted: string[];
  acceptOrder: (id: string) => void;

  toasts: Toast[];
  toast: (msg: string, icon?: string, green?: boolean) => void;

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
  const [fav, setFav] = useState<Set<string>>(new Set());
  const [lastOrder, setLastOrder] = useState<OrderFlow | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>(SEED_ORDERS);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[]>(SEED_REQUESTS);
  const [avail, setAvail] = useState(true);
  const [acted, setActed] = useState<string[]>([]);
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
          if (Array.isArray(s.fav)) setFav(new Set(s.fav));
          if (s.lastOrder) setLastOrder(s.lastOrder);
          if (Array.isArray(s.orders)) setOrders(s.orders);
          if (s.subscription) setSubscription(s.subscription);
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
      JSON.stringify({ onboarded, darkMode, cart, tip, mode, fav: [...fav], lastOrder, orders, subscription, requests, avail }),
    ).catch(() => {});
  }, [onboarded, darkMode, cart, tip, mode, fav, lastOrder, orders, subscription, requests, avail]);

  const toast = useCallback((msg: string, icon = 'check', green = false) => {
    const id = toastSeq++;
    setToasts((t) => [...t, { id, msg, icon, green }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  const addToCart = useCallback((line: Omit<CartLine, 'qty'>, qty = 1) => {
    setCart((c) => {
      const i = c.findIndex((l) => l.key === line.key);
      if (i >= 0) {
        const n = [...c];
        n[i] = { ...n[i], qty: n[i].qty + qty };
        return n;
      }
      return [...c, { ...line, qty }];
    });
  }, []);
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
    o.lines.forEach((l) => addToCart({ key: l.key, name: l.name, cook: l.cook, price: l.price, grad: l.grad }, l.qty));
    toast(`Added to cart · ${o.lines.length} item${o.lines.length !== 1 ? 's' : ''}`, 'cart', true);
  }, [orders, addToCart, toast]);

  const resetOnboarding = useCallback(() => setOnboardedState(false), []);

  const subscribe = useCallback((s: Subscription) => setSubscription(s), []);
  const updateSub = useCallback((patch: Partial<Subscription>) => setSubscription((s) => (s ? { ...s, ...patch } : s)), []);
  const cancelSub = useCallback(() => setSubscription(null), []);

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

  const notifCount = NOTIFS.filter((n) => n.unread).length + CONVERSATIONS.reduce((s, c) => s + (c.unread ? 1 : 0), 0);

  const value: Store = {
    ready,
    onboarded,
    setOnboarded: setOnboardedState,
    resetOnboarding,
    darkMode,
    setDarkMode: setDarkModeState,
    cart,
    cartCount,
    addToCart,
    setQty: setQtyFn,
    removeLine,
    tip,
    setTip,
    mode,
    setMode,
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
    acceptQuote,
    avail,
    toggleAvail,
    acted,
    acceptOrder,
    toasts,
    toast,
    notifCount,
  };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
