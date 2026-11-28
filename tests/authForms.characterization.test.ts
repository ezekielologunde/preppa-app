// Characterization tests for the native sign-in UI (SIGNIN-DESIGN.md, work breakdown B).
//
// These pin what the `Auth` and `Code` steps of onboarding do TODAY, so the B extraction
// (Auth, Code, Spinner, useShake, Title, Lead moving out of Onboarding.tsx) can be shown to
// change nothing. They were written and run green against the unmodified Onboarding.tsx
// first; after the extraction only the LOC table below may change.
//
// Nothing here is a React Native renderer. Each module is transpiled with TypeScript and run
// against small stand-ins: a hook shim (useState, useRef, useEffect with dependency
// comparison and cleanups), a fake clock, recorded Animated calls, and recorded Supabase
// auth calls. A component call returns its element tree; the tests read props off that tree
// and call the handlers on it, the way a tap would. Child components are not rendered, so a
// tree holds e.g. a `Btn` element with its label and onPress, which is what is pinned.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';

// Where each piece lives. The extraction changes this table and nothing else.
const LOC = {
  auth: 'src/components/auth/AuthForm.tsx',
  code: 'src/components/auth/CodeForm.tsx',
  ui: 'src/components/auth/authUi.tsx',
  flow: 'src/components/Onboarding.tsx',
};

const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const TIMEOUT = /export const AUTH_TIMEOUT_MESSAGE = '([^']*)'/.exec(read('src/lib/supabase.ts'))![1];

/* ---------------- harness ---------------- */

type El = { type: any; props: any; key?: any };
const isEl = (n: any): n is El => !!n && typeof n === 'object' && 'type' in n && 'props' in n;
function all(node: any, out: El[] = []): El[] {
  if (Array.isArray(node)) for (const n of node) all(n, out);
  else if (isEl(node)) { out.push(node); all(node.props.children, out); }
  return out;
}
function textOf(node: any): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isEl(node)) return textOf(node.props.children);
  return '';
}
const texts = (tree: any) => all(tree).filter((e) => e.type === 'Text').map((e) => textOf(e));
const named = (tree: any, name: string) => all(tree).filter((e) => typeof e.type === 'function' && e.type.name === name);
const input = (tree: any, label: string) => {
  const found = all(tree).filter((e) => e.type === 'TextInput' && e.props.accessibilityLabel === label);
  return found.length === 1 ? found[0] : undefined;
};
const pressable = (tree: any, label: string) => all(tree).find((e) => e.type === 'Pressable' && textOf(e).includes(label));
const btn = (tree: any) => { const b = all(tree).filter((e) => e.type === 'Btn'); assert.equal(b.length, 1); return b[0]; };

class Clock {
  now = 0;
  private id = 0;
  timers = new Map<number, { at: number; fn: () => void }>();
  setTimeout = (fn: () => void, ms = 0) => { const id = ++this.id; this.timers.set(id, { at: this.now + ms, fn }); return id; };
  clearTimeout = (id: number) => { this.timers.delete(id); };
  next(until: number) {
    let best: [number, { at: number; fn: () => void }] | undefined;
    for (const e of this.timers) if (e[1].at <= until && (!best || e[1].at < best[1].at)) best = e;
    return best;
  }
}

function deferred<T = any>() {
  let resolve!: (v: T) => void, reject!: (e: any) => void;
  const promise = new Promise<T>((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const proxy = (prefix: string): any => new Proxy({}, { get: (_t, k) => `${prefix}.${String(k)}` });

function makeEnv(opts: { reduced?: boolean } = {}) {
  const env: any = {
    reduced: !!opts.reduced,
    calls: [] as [string, any[]][],
    impl: {} as Record<string, (...a: any[]) => any>,
    started: [] as any[],
    clock: new Clock(),
    cache: new Map<string, any>(),
    current: null as any,
    store: { setOnboarded: (v: boolean) => env.calls.push(['setOnboarded', [v]]), coords: { lat: 1, lng: 1 }, setLocation() {}, setCoords() {}, setCountry() {} },
  };
  const slot = () => { const h = env.current; assert.ok(h, 'hook called outside a render'); return [h, h.i++] as [any, number]; };
  const React: any = {
    useState(init: any) {
      const [h, i] = slot();
      if (!(i in h.slots)) h.slots[i] = { v: typeof init === 'function' ? init() : init };
      const s = h.slots[i];
      return [s.v, (n: any) => { s.v = typeof n === 'function' ? n(s.v) : n; h.dirty = true; }];
    },
    useRef(init: any) { const [h, i] = slot(); if (!(i in h.slots)) h.slots[i] = { current: init }; return h.slots[i]; },
    useEffect(fn: () => any, deps?: any[]) {
      const [h, i] = slot();
      const prev = h.slots[i];
      if (!prev) h.slots[i] = { deps: undefined, cleanup: undefined };
      const changed = !prev || !deps || !prev.deps || deps.some((d, k) => !Object.is(d, prev.deps[k]));
      if (changed) h.pending.push({ i, fn, deps });
    },
  };
  const anim = (kind: string, extra: any) => ({ kind, ...extra, start() { env.started.push(this); } });
  class Value { v: any; constructor(v: any) { this.v = v; } setValue(v: any) { this.v = v; } interpolate(c: any) { return { interpolate: c }; } }
  const RN = {
    Animated: {
      Value, View: 'Animated.View',
      timing: (value: any, cfg: any) => anim('timing', { value, cfg }),
      sequence: (items: any[]) => anim('sequence', { items }),
      parallel: (items: any[]) => anim('parallel', { items }),
      loop: (item: any) => anim('loop', { items: [item] }),
      delay: (ms: number) => anim('delay', { ms }),
    },
    Easing: { linear: 'linear', cubic: 'cubic', quad: 'quad', out: (e: any) => `out(${e})`, inOut: (e: any) => `inOut(${e})` },
    Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View', ScrollView: 'ScrollView',
    StyleSheet: { create: (s: any) => s },
  };
  const supa = (name: string) => (...args: any[]) => {
    env.calls.push([name, args]);
    const f = env.impl[name];
    return f ? f(...args) : Promise.resolve(name === 'signUpWithPassword' ? { access_token: 'x' } : undefined);
  };
  const stubs: Record<string, any> = {
    'src/lib/supabase': {
      sendEmailOtp: supa('sendEmailOtp'), verifyEmailOtp: supa('verifyEmailOtp'), signUpWithPassword: supa('signUpWithPassword'),
      signInWithPassword: supa('signInWithPassword'), sendPasswordResetOtp: supa('sendPasswordResetOtp'), updatePassword: supa('updatePassword'),
      AUTH_TIMEOUT_MESSAGE: TIMEOUT,
    },
    'src/lib/geo': { captureCurrentLocation: () => new Promise(() => {}) },
    'src/store/store': { useStore: () => env.store },
    'src/ui/Icon': { Icon: 'Icon' },
    'src/ui/primitives': { Press: 'Press', GradBox: 'GradBox', Btn: 'Btn' },
    'src/ui/useReducedMotion': { useReducedMotion: () => env.reduced },
    'src/theme/ThemeContext': { useC: () => proxy('c') },
    'src/theme/theme': { type: (size: number, weight: number) => ({ fontSize: size, fontWeight: weight, fontFamily: `font-${weight}` }), GRAD: proxy('GRAD'), shadow: new Proxy({}, { get: () => ({}) }), radius: proxy('radius'), FILL: { FILL: true } },
  };
  const jsx = (type: any, props: any, key?: any) => ({ type, props, key });
  const bare: Record<string, any> = {
    react: React,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': RN,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
  };
  const load = (abs: string): any => {
    if (env.cache.has(abs)) return env.cache.get(abs);
    const src = readFileSync(abs, 'utf8');
    const js = ts.transpileModule(src, {
      fileName: abs,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
    // Probe: the components are module-private in Onboarding.tsx, so read them from module scope.
    const probe = '\n;module.exports.__probe = {' + ['Auth', 'Code', 'Spinner', 'useShake', 'Title', 'Lead', 'OnboardingFlow']
      .map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(', ') + '};\n';
    const module: any = { exports: {} };
    env.cache.set(abs, module.exports);
    const req = (spec: string) => {
      if (spec in bare) return bare[spec];
      if (!spec.startsWith('.')) throw new Error(`unexpected import ${spec} in ${abs}`);
      const target = resolve(dirname(abs), spec);
      const key = relative(ROOT, target).replace(/\\/g, '/');
      if (key in stubs) return stubs[key];
      for (const ext of ['.tsx', '.ts']) if (existsSync(target + ext)) return load(target + ext);
      throw new Error(`cannot resolve ${spec} from ${abs}`);
    };
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', js + probe)(req, module, module.exports, env.clock.setTimeout, env.clock.clearTimeout);
    env.cache.set(abs, module.exports);
    return module.exports;
  };
  env.get = (file: string, name: string) => {
    const f = load(join(ROOT, file)).__probe[name];
    assert.equal(typeof f, 'function', `${name} not found in ${file}`);
    return f;
  };
  return env;
}

class Mounted {
  slots: any[] = [];
  i = 0;
  dirty = false;
  pending: any[] = [];
  tree: any;
  constructor(public env: any, public comp: (p: any) => any, public props: any) { this.render(); }
  render() {
    let n = 0;
    do {
      this.dirty = false; this.i = 0; this.pending = [];
      this.env.current = this;
      try { this.tree = this.comp(this.props); } finally { this.env.current = null; }
      for (const e of this.pending) {
        const s = this.slots[e.i];
        if (typeof s.cleanup === 'function') s.cleanup();
        s.deps = e.deps;
        const c = e.fn();
        s.cleanup = typeof c === 'function' ? c : undefined;
      }
      assert.ok(++n < 50, 'render loop');
    } while (this.dirty);
    return this.tree;
  }
  flush() { if (this.dirty) this.render(); return this.tree; }
  /** Let promises settle, re-rendering on any state change. */
  async settle() { for (let k = 0; k < 8; k++) { await new Promise((r) => setImmediate(r)); this.flush(); } return this.tree; }
  /** Advance the fake clock, firing timers in order and re-rendering between them. */
  advance(ms: number) {
    const clock = this.env.clock as Clock;
    const end = clock.now + ms;
    for (let t = clock.next(end); t; t = clock.next(end)) { clock.timers.delete(t[0]); clock.now = t[1].at; t[1].fn(); this.flush(); }
    clock.now = end;
    return this.tree;
  }
}

const shakes = (env: any) => env.started.filter((a: any) => a.kind === 'sequence' && a.items.length === 5 && a.items.every((t: any) => t.kind === 'timing' && t.cfg.duration === 60));
const callsOf = (env: any, name: string) => env.calls.filter((c: any) => c[0] === name).map((c: any) => c[1]);
const supaCalls = (env: any) => env.calls.filter((c: any) => c[0] !== 'onNext' && c[0] !== 'onRecovery' && c[0] !== 'setOnboarded');

function mountAuth(mode: 'signin' | 'signup', env = makeEnv()) {
  const props = {
    mode,
    onNext: (email: string, authed: boolean) => env.calls.push(['onNext', [email, authed]]),
    onRecovery: (email: string, pw: string) => env.calls.push(['onRecovery', [email, pw]]),
  };
  return { env, m: new Mounted(env, env.get(LOC.auth, 'Auth'), props) };
}
function type(m: Mounted, label: string, value: string) {
  const el = input(m.tree, label);
  assert.ok(el, `input ${label}`);
  el!.props.onChangeText(value);
  return m.flush();
}
async function submit(m: Mounted) { const p = btn(m.tree).props.onPress(); m.flush(); await p; return m.settle(); }
async function emailCode(m: Mounted) {
  const p = pressable(m.tree, 'Email me a sign-in code instead')!.props.onPress();
  m.flush(); await p; return m.settle();
}

/* ---------------- Auth: sign-up ---------------- */

test('sign-up: copy on the create-account step', () => {
  const { m } = mountAuth('signup');
  const t = m.tree;
  assert.deepEqual(named(t, 'Title')[0].props.parts, ['Create your account.']);
  assert.equal(textOf(named(t, 'Lead')[0]), 'A couple details and you’re in — your password lets you skip codes next time.');
  assert.deepEqual(texts(t).filter((s) => ['Full name', 'Email address', 'Password'].includes(s)), ['Full name', 'Email address', 'Password']);
  assert.equal(btn(t).props.label, 'Create account');
  assert.equal(btn(t).props.iconRight, 'arrow');
  assert.equal(btn(t).props.loading, false);
  assert.ok(pressable(t, 'Email me a sign-in code instead'));
  assert.equal(pressable(t, 'Forgot password?'), undefined);
  const name = input(t, 'Your name')!, email = input(t, 'Email address')!, pw = input(t, 'Password')!;
  assert.equal(name.props.placeholder, 'Your name');
  assert.equal(name.props.autoComplete, 'name');
  assert.equal(email.props.placeholder, 'you@example.com');
  assert.equal(email.props.keyboardType, 'email-address');
  assert.equal(pw.props.placeholder, 'At least 8 characters');
  assert.equal(pw.props.autoComplete, 'password-new');
  assert.equal(pw.props.textContentType, 'newPassword');
  assert.equal(pw.props.secureTextEntry, true);
});

test('sign-up: field styles are unchanged', () => {
  const { m } = mountAuth('signup');
  const email = input(m.tree, 'Email address')!;
  assert.deepEqual(email.props.style, [
    { height: 56, borderRadius: 'radius.card', paddingHorizontal: 18, borderWidth: 1, fontSize: 16 },
    { backgroundColor: 'c.surface', borderColor: 'c.border', color: 'c.ink' },
  ]);
});

test('sign-up: validates name, then email, then password length, shaking each time', async () => {
  const { env, m } = mountAuth('signup');
  await submit(m);
  assert.ok(texts(m.tree).includes('Please enter your name.'));
  type(m, 'Your name', ' A ');
  await submit(m);
  assert.ok(texts(m.tree).includes('Please enter your name.'), 'a one-letter trimmed name is rejected');
  type(m, 'Your name', 'Ada Lovelace');
  type(m, 'Email address', 'ada@example');
  await submit(m);
  assert.ok(texts(m.tree).includes('That doesn’t look like an email — check for typos.'));
  assert.equal(input(m.tree, 'Email address')!.props.style[1].borderColor, 'c.red');
  type(m, 'Email address', 'ada@example.com');
  type(m, 'Password', '1234567');
  await submit(m);
  assert.ok(texts(m.tree).includes('Use a password of at least 8 characters.'));
  assert.equal(shakes(env).length, 4);
  assert.deepEqual(shakes(env)[0].items.map((t: any) => t.cfg.toValue), [-8, 8, -6, 6, 0]);
  assert.deepEqual(supaCalls(env), [], 'nothing is sent while the form is invalid');
});

test('sign-in: email validation accepts and rejects the same addresses', async () => {
  const cases: [string, boolean][] = [
    ['a@b.co', true], ['  ada@example.com  ', true], ['first.last+tag@sub.domain.org', true],
    ['ada@example', false], ['ada.example.com', false], ['a b@c.d', false], ['@b.co', false], ['', false],
  ];
  for (const [addr, ok] of cases) {
    const { env, m } = mountAuth('signin');
    type(m, 'Email address', addr);
    type(m, 'Password', 'password1');
    await submit(m);
    assert.equal(callsOf(env, 'signInWithPassword').length, ok ? 1 : 0, addr);
  }
});

test('sign-up: creates the account with trimmed email and name, then continues signed in', async () => {
  const { env, m } = mountAuth('signup');
  type(m, 'Your name', '  Ada   Lovelace ');
  type(m, 'Email address', ' ada@example.com ');
  type(m, 'Password', 'password1');
  const d = deferred();
  env.impl.signUpWithPassword = () => d.promise;
  const p = btn(m.tree).props.onPress();
  m.flush();
  assert.equal(btn(m.tree).props.label, 'Creating…');
  assert.equal(btn(m.tree).props.loading, true);
  assert.equal(btn(m.tree).props.iconRight, undefined);
  d.resolve({ access_token: 't' });
  await p; await m.settle();
  assert.deepEqual(callsOf(env, 'signUpWithPassword'), [['ada@example.com', 'password1', { display_name: 'Ada   Lovelace', first_name: 'Ada' }]]);
  assert.deepEqual(callsOf(env, 'onNext'), [['ada@example.com', true]]);
  assert.equal(btn(m.tree).props.label, 'Create account');
});

test('sign-up: no session back means a confirmation link was sent; it does not continue', async () => {
  const { env, m } = mountAuth('signup');
  env.impl.signUpWithPassword = async () => null;
  type(m, 'Your name', 'Ada');
  type(m, 'Email address', 'ada@example.com');
  type(m, 'Password', 'password1');
  await submit(m);
  assert.ok(texts(m.tree).includes('We sent a confirmation link to ada@example.com. Tap it, then sign in.'));
  assert.deepEqual(callsOf(env, 'onNext'), []);
  type(m, 'Password', 'password12');
  assert.ok(!texts(m.tree).some((s) => s.startsWith('We sent a confirmation link')), 'typing clears the info line');
});

test('sign-up: error copy for existing account, generic failure and timeout', async () => {
  const run = async (err: any) => {
    const { env, m } = mountAuth('signup');
    env.impl.signUpWithPassword = async () => { throw err; };
    type(m, 'Your name', 'Ada');
    type(m, 'Email address', 'ada@example.com');
    type(m, 'Password', 'password1');
    await submit(m);
    assert.equal(shakes(env).length, 1);
    assert.equal(btn(m.tree).props.loading, false);
    return texts(m.tree);
  };
  assert.ok((await run(new Error('User already registered'))).includes('That email already has an account — sign in instead.'));
  assert.ok((await run(new Error('ALREADY exists'))).includes('That email already has an account — sign in instead.'));
  assert.ok((await run(new Error('boom'))).includes('Couldn’t create your account — please try again.'));
  assert.ok((await run({})).includes('Couldn’t create your account — please try again.'));
  assert.ok((await run(new Error(TIMEOUT))).includes(TIMEOUT));
});

/* ---------------- Auth: sign-in ---------------- */

test('sign-in: copy, no name field, forgot-password link', () => {
  const { m } = mountAuth('signin');
  const t = m.tree;
  assert.deepEqual(named(t, 'Title')[0].props.parts, ['Welcome back.']);
  assert.equal(textOf(named(t, 'Lead')[0]), 'Sign in with your email and password.');
  assert.equal(input(t, 'Your name'), undefined);
  assert.equal(btn(t).props.label, 'Sign in');
  assert.ok(pressable(t, 'Forgot password?'));
  const pw = input(t, 'Password')!;
  assert.equal(pw.props.placeholder, 'Your password');
  assert.equal(pw.props.autoComplete, 'password');
  assert.equal(pw.props.textContentType, 'password');
});

test('sign-in: signs in with trimmed email and continues signed in; Return submits too', async () => {
  const { env, m } = mountAuth('signin');
  type(m, 'Email address', ' ada@example.com ');
  type(m, 'Password', ' secret12 ');
  const d = deferred();
  env.impl.signInWithPassword = () => d.promise;
  const p = input(m.tree, 'Password')!.props.onSubmitEditing();
  m.flush();
  assert.equal(btn(m.tree).props.label, 'Signing in…');
  d.resolve(undefined);
  await p; await m.settle();
  assert.deepEqual(callsOf(env, 'signInWithPassword'), [['ada@example.com', ' secret12 ']], 'password is not trimmed');
  assert.deepEqual(callsOf(env, 'onNext'), [['ada@example.com', true]]);
});

test('sign-in: a second tap while busy sends nothing', async () => {
  const { env, m } = mountAuth('signin');
  type(m, 'Email address', 'ada@example.com');
  type(m, 'Password', 'password1');
  const d = deferred();
  env.impl.signInWithPassword = () => d.promise;
  const p = btn(m.tree).props.onPress();
  m.flush();
  await btn(m.tree).props.onPress();
  await pressable(m.tree, 'Email me a sign-in code instead')!.props.onPress();
  d.resolve(undefined);
  await p; await m.settle();
  assert.equal(callsOf(env, 'signInWithPassword').length, 1);
  assert.equal(callsOf(env, 'sendEmailOtp').length, 0);
});

test('sign-in: wrong password copy, timeout passthrough, typing clears the error', async () => {
  const { env, m } = mountAuth('signin');
  env.impl.signInWithPassword = async () => { throw new Error('Invalid login credentials'); };
  type(m, 'Email address', 'ada@example.com');
  type(m, 'Password', 'password1');
  await submit(m);
  assert.ok(texts(m.tree).includes('Wrong email or password. Try again, or email yourself a code.'));
  assert.equal(shakes(env).length, 1);
  type(m, 'Password', 'password12');
  assert.ok(!texts(m.tree).includes('Wrong email or password. Try again, or email yourself a code.'));
  env.impl.signInWithPassword = async () => { throw new Error(TIMEOUT); };
  await submit(m);
  assert.ok(texts(m.tree).includes(TIMEOUT));
});

/* ---------------- Auth: password recovery ---------------- */

test('recovery: forgot password switches copy, clears the password, hides the code link', () => {
  const { m } = mountAuth('signin');
  type(m, 'Password', 'oldpassword');
  pressable(m.tree, 'Forgot password?')!.props.onPress();
  const t = m.flush();
  assert.deepEqual(named(t, 'Title')[0].props.parts, ['Reset your password.']);
  assert.equal(textOf(named(t, 'Lead')[0]), 'Choose a new password. We’ll email a code to confirm it’s you.');
  assert.ok(texts(t).includes('New password'));
  const pw = input(t, 'New password')!;
  assert.equal(pw.props.value, '');
  assert.equal(pw.props.placeholder, 'At least 8 characters');
  assert.equal(pw.props.autoComplete, 'password-new');
  assert.equal(btn(t).props.label, 'Send recovery code');
  assert.equal(pressable(t, 'Email me a sign-in code instead'), undefined);
  assert.ok(pressable(t, 'Back to sign in'));
  pressable(t, 'Back to sign in')!.props.onPress();
  assert.deepEqual(named(m.flush(), 'Title')[0].props.parts, ['Welcome back.']);
});

test('recovery: sends a reset code and hands over email and new password', async () => {
  const { env, m } = mountAuth('signin');
  pressable(m.tree, 'Forgot password?')!.props.onPress();
  m.flush();
  type(m, 'Email address', ' ada@example.com ');
  type(m, 'New password', 'newpassword1');
  const d = deferred();
  env.impl.sendPasswordResetOtp = () => d.promise;
  const p = btn(m.tree).props.onPress();
  m.flush();
  assert.equal(btn(m.tree).props.label, 'Sending code…');
  d.resolve(undefined);
  await p; await m.settle();
  assert.deepEqual(callsOf(env, 'sendPasswordResetOtp'), [['ada@example.com']]);
  assert.deepEqual(callsOf(env, 'onRecovery'), [['ada@example.com', 'newpassword1']]);
  assert.deepEqual(callsOf(env, 'onNext'), []);
  assert.deepEqual(callsOf(env, 'signInWithPassword'), []);
});

test('recovery: short password and send failure copy', async () => {
  const { env, m } = mountAuth('signin');
  pressable(m.tree, 'Forgot password?')!.props.onPress();
  m.flush();
  type(m, 'Email address', 'ada@example.com');
  type(m, 'New password', 'short');
  await submit(m);
  assert.ok(texts(m.tree).includes('Use a password of at least 8 characters.'));
  env.impl.sendPasswordResetOtp = async () => { throw new Error('rate limited'); };
  type(m, 'New password', 'newpassword1');
  await submit(m);
  assert.ok(texts(m.tree).includes('Couldn’t send a recovery code. Check the email and try again.'));
  env.impl.sendPasswordResetOtp = async () => { throw new Error(TIMEOUT); };
  await submit(m);
  assert.ok(texts(m.tree).includes(TIMEOUT));
});

/* ---------------- Auth: email me a code ---------------- */

test('email code: sign-up sends the name as metadata and continues to the code step', async () => {
  const { env, m } = mountAuth('signup');
  await emailCode(m);
  assert.ok(texts(m.tree).includes('Please enter your name.'));
  type(m, 'Your name', ' Ada Lovelace ');
  type(m, 'Email address', ' ada@example.com ');
  const d = deferred();
  env.impl.sendEmailOtp = () => d.promise;
  const p = pressable(m.tree, 'Email me a sign-in code instead')!.props.onPress();
  m.flush();
  assert.ok(pressable(m.tree, 'Sending code…'), 'link shows progress');
  d.resolve(undefined);
  await p; await m.settle();
  assert.deepEqual(callsOf(env, 'sendEmailOtp'), [['ada@example.com', { display_name: 'Ada Lovelace', first_name: 'Ada' }]]);
  assert.deepEqual(callsOf(env, 'onNext'), [['ada@example.com', false]]);
});

test('email code: sign-in sends no metadata and needs no password', async () => {
  const { env, m } = mountAuth('signin');
  type(m, 'Email address', 'nope');
  await emailCode(m);
  assert.ok(texts(m.tree).includes('That doesn’t look like an email — check for typos.'));
  type(m, 'Email address', 'ada@example.com');
  await emailCode(m);
  assert.deepEqual(callsOf(env, 'sendEmailOtp'), [['ada@example.com', undefined]]);
  assert.deepEqual(callsOf(env, 'onNext'), [['ada@example.com', false]]);
});

test('email code: failure shows the raw error message, or a fallback when there is none', async () => {
  const { env, m } = mountAuth('signin');
  type(m, 'Email address', 'ada@example.com');
  env.impl.sendEmailOtp = async () => { throw new Error('Email rate limit exceeded'); };
  await emailCode(m);
  assert.ok(texts(m.tree).includes('Email rate limit exceeded'));
  assert.equal(shakes(env).length, 1);
  env.impl.sendEmailOtp = async () => { throw {}; };
  await emailCode(m);
  assert.ok(texts(m.tree).includes('Couldn’t send your code just now — please try again.'));
  assert.deepEqual(callsOf(env, 'onNext'), []);
});

/* ---------------- Code step ---------------- */

function mountCode(newPassword?: string, env = makeEnv()) {
  const props = { email: 'ada@example.com', newPassword, onNext: () => env.calls.push(['onNext', []]) };
  return { env, m: new Mounted(env, env.get(LOC.code, 'Code'), props) };
}
const codeInput = (m: Mounted) => input(m.tree, 'Six digit verification code')!;
const otpBoxes = (tree: any) => all(tree).filter((e) => e.type === 'View' && Array.isArray(e.props.style) && e.props.style[0]?.height === 60);

test('code: copy, input settings, box styles', () => {
  const { m } = mountCode();
  const t = m.tree;
  assert.deepEqual(named(t, 'Title')[0].props.parts, ['Check your inbox.']);
  assert.equal(textOf(named(t, 'Lead')[0]), 'We sent a 6-digit code to ada@example.com.');
  assert.ok(texts(t).includes('Didn’t get it?'));
  assert.ok(pressable(t, 'Resend code'));
  const i = codeInput(m);
  assert.equal(i.props.keyboardType, 'number-pad');
  assert.equal(i.props.maxLength, 6);
  assert.equal(i.props.autoFocus, true);
  const boxes = otpBoxes(t);
  assert.equal(boxes.length, 6);
  assert.deepEqual(boxes[0].props.style[0], { flex: 1, height: 60, borderRadius: 'radius.card', borderWidth: 1, alignItems: 'center', justifyContent: 'center' });
  assert.equal(boxes[0].props.style[1].borderColor, 'c.primary', 'first box is live');
  assert.equal(boxes[1].props.style[1].borderColor, 'c.border');
});

test('code: focuses the hidden input after 300 ms', () => {
  const { m } = mountCode();
  let focused = 0;
  codeInput(m).props.ref.current = { focus: () => { focused++; } };
  m.advance(299);
  assert.equal(focused, 0);
  m.advance(1);
  assert.equal(focused, 1);
});

test('code: input keeps digits only, at most six', () => {
  const { env, m } = mountCode();
  env.impl.verifyEmailOtp = () => new Promise(() => {});
  codeInput(m).props.onChangeText('1a2-3 4');
  m.flush();
  assert.equal(codeInput(m).props.value, '1234');
  assert.deepEqual(callsOf(env, 'verifyEmailOtp'), []);
  codeInput(m).props.onChangeText('98765432');
  m.flush();
  assert.equal(codeInput(m).props.value, '987654');
  assert.deepEqual(callsOf(env, 'verifyEmailOtp'), [['ada@example.com', '987654']]);
});

test('code: six digits verify once, show progress, then continue', async () => {
  const { env, m } = mountCode();
  const d = deferred();
  env.impl.verifyEmailOtp = () => d.promise;
  codeInput(m).props.onChangeText('123456');
  m.flush();
  assert.ok(texts(m.tree).includes('Verifying…'));
  assert.equal(named(m.tree, 'Spinner').length, 1);
  assert.deepEqual(named(m.tree, 'Spinner')[0].props, { size: 15, color: 'c.primaryD', track: 'c.border' });
  d.resolve(undefined);
  await m.settle();
  assert.deepEqual(callsOf(env, 'verifyEmailOtp'), [['ada@example.com', '123456']]);
  assert.deepEqual(callsOf(env, 'updatePassword'), []);
  assert.equal(callsOf(env, 'onNext').length, 1);
});

test('code: recovery sets the new password after the code verifies, before continuing', async () => {
  const { env, m } = mountCode('newpassword1');
  codeInput(m).props.onChangeText('123456');
  await m.settle();
  assert.deepEqual(env.calls.map((c: any) => c[0]), ['verifyEmailOtp', 'updatePassword', 'onNext']);
  assert.deepEqual(callsOf(env, 'updatePassword'), [['newpassword1']]);
});

test('code: wrong code shows the mismatch copy, clears the field, shakes, does not continue', async () => {
  const { env, m } = mountCode();
  env.impl.verifyEmailOtp = async () => { throw new Error('Token has expired or is invalid'); };
  codeInput(m).props.onChangeText('123456');
  await m.settle();
  assert.ok(texts(m.tree).includes('That code didn’t match. Check the digits and try again.'));
  assert.equal(codeInput(m).props.value, '');
  assert.equal(shakes(env).length, 1);
  assert.ok(!texts(m.tree).includes('Verifying…'));
  assert.deepEqual(callsOf(env, 'onNext'), []);
  assert.ok(otpBoxes(m.tree).every((b) => b.props.style[1].borderColor === 'c.red'));
  codeInput(m).props.onChangeText('1');
  m.flush();
  assert.ok(!texts(m.tree).includes('That code didn’t match. Check the digits and try again.'), 'typing clears the error');
  env.impl.verifyEmailOtp = async () => { throw new Error(TIMEOUT); };
  codeInput(m).props.onChangeText('654321');
  await m.settle();
  assert.ok(texts(m.tree).includes(TIMEOUT));
  assert.equal(callsOf(env, 'verifyEmailOtp').length, 2, 'retyping six digits verifies again');
});

test('code: a failed password update after a good code is treated as a mismatch', async () => {
  const { env, m } = mountCode('newpassword1');
  env.impl.updatePassword = async () => { throw new Error('weak'); };
  codeInput(m).props.onChangeText('123456');
  await m.settle();
  assert.ok(texts(m.tree).includes('That code didn’t match. Check the digits and try again.'));
  assert.deepEqual(callsOf(env, 'onNext'), []);
});

test('code: resend sends a sign-in code, confirms, then cools down for 24 seconds', async () => {
  const { env, m } = mountCode();
  const d = deferred();
  env.impl.sendEmailOtp = () => d.promise;
  const p = pressable(m.tree, 'Resend code')!.props.onPress();
  m.flush();
  assert.ok(texts(m.tree).includes('Sending another code…'));
  assert.equal(pressable(m.tree, 'Resend'), undefined);
  d.resolve(undefined);
  await p; await m.settle();
  assert.deepEqual(callsOf(env, 'sendEmailOtp'), [['ada@example.com']]);
  assert.ok(texts(m.tree).includes('Code re-sent ✓'));
  m.advance(2399);
  assert.ok(texts(m.tree).includes('Code re-sent ✓'));
  m.advance(1);
  assert.ok(texts(m.tree).includes('Didn’t get it?'));
  const cooling = pressable(m.tree, 'Resend in 22s')!;
  assert.ok(cooling, 'countdown label');
  assert.equal(cooling.props.disabled, true);
  assert.deepEqual(cooling.props.accessibilityState, { disabled: true });
  await cooling.props.onPress();
  assert.equal(callsOf(env, 'sendEmailOtp').length, 1, 'no resend while cooling');
  m.advance(24000 - 2400 - 1);
  assert.ok(pressable(m.tree, 'Resend in 1s'));
  m.advance(1);
  const ready = pressable(m.tree, 'Resend code')!;
  assert.ok(ready);
  assert.equal(ready.props.disabled, false);
  await ready.props.onPress();
  await m.settle();
  assert.equal(callsOf(env, 'sendEmailOtp').length, 2);
});

test('code: resend during recovery sends a reset code; failures show resend copy', async () => {
  const { env, m } = mountCode('newpassword1');
  await pressable(m.tree, 'Resend code')!.props.onPress();
  await m.settle();
  assert.deepEqual(callsOf(env, 'sendPasswordResetOtp'), [['ada@example.com']]);
  assert.deepEqual(callsOf(env, 'sendEmailOtp'), []);

  const other = mountCode();
  other.env.impl.sendEmailOtp = async () => { throw new Error('rate limited'); };
  await pressable(other.m.tree, 'Resend code')!.props.onPress();
  await other.m.settle();
  assert.ok(texts(other.m.tree).includes('Couldn’t resend the code. Check your connection and try again.'));
  assert.ok(pressable(other.m.tree, 'Resend code'), 'no cooldown after a failed resend');
  other.env.impl.sendEmailOtp = async () => { throw new Error(TIMEOUT); };
  await pressable(other.m.tree, 'Resend code')!.props.onPress();
  await other.m.settle();
  assert.ok(texts(other.m.tree).includes(TIMEOUT));
});

/* ---------------- shared helpers ---------------- */

test('Title, Lead: styles and accent parts', () => {
  const env = makeEnv();
  const title = new Mounted(env, env.get(LOC.ui, 'Title'), { parts: ['What brings you to ', { g: 'Preppa' }, '?'] }).tree;
  assert.equal(title.type, 'Text');
  assert.deepEqual(title.props.style, [{ fontSize: 34, fontWeight: 900, fontFamily: 'font-900' }, { color: 'c.ink', letterSpacing: -1.5, lineHeight: 37, marginTop: 18 }]);
  assert.equal(title.props.children[0], 'What brings you to ');
  assert.equal(title.props.children[1].type, 'Text');
  assert.deepEqual(title.props.children[1].props, { style: { color: 'c.accentText' }, children: 'Preppa' });
  const lead = new Mounted(env, env.get(LOC.ui, 'Lead'), { children: 'Hello' }).tree;
  assert.deepEqual(lead.props.style, [{ fontSize: 15.5, fontWeight: 500, fontFamily: 'font-500' }, { color: 'c.soft', lineHeight: 24, marginTop: 14, maxWidth: 320 }]);
  assert.equal(lead.props.children, 'Hello');
});

test('Spinner: 700 ms linear loop, still under reduced motion', () => {
  const env = makeEnv();
  const t = new Mounted(env, env.get(LOC.ui, 'Spinner'), {}).tree;
  assert.equal(t.type, 'Animated.View');
  const { transform, ...rest } = t.props.style;
  assert.deepEqual(rest, { width: 19, height: 19, borderRadius: 9.5, borderWidth: 2.5, borderColor: '#fff', opacity: 0.3, borderTopColor: '#fff' });
  assert.deepEqual(transform, [{ rotate: { interpolate: { inputRange: [0, 1], outputRange: ['0deg', '360deg'] } } }]);
  assert.equal(env.started.length, 1);
  assert.equal(env.started[0].kind, 'loop');
  assert.deepEqual(env.started[0].items[0].cfg, { toValue: 1, duration: 700, easing: 'linear', useNativeDriver: true });
  const tracked = new Mounted(env, env.get(LOC.ui, 'Spinner'), { size: 15, color: 'red', track: 'grey' }).tree.props.style;
  assert.equal(tracked.borderColor, 'grey');
  assert.equal(tracked.opacity, 1);
  const still = makeEnv({ reduced: true });
  new Mounted(still, still.get(LOC.ui, 'Spinner'), {});
  assert.equal(still.started.length, 0);
});

test('useShake: five 60 ms steps, none under reduced motion', () => {
  for (const reduced of [false, true]) {
    const env = makeEnv({ reduced });
    const useShake = env.get(LOC.ui, 'useShake');
    const m = new Mounted(env, () => useShake(), {});
    m.tree.x.setValue(5);
    m.tree.fire();
    if (reduced) { assert.equal(env.started.length, 0); assert.equal(m.tree.x.v, 5); continue; }
    assert.equal(m.tree.x.v, 0, 'resets before shaking');
    assert.equal(shakes(env).length, 1);
    assert.deepEqual(shakes(env)[0].items.map((t: any) => [t.cfg.toValue, t.cfg.duration, t.cfg.useNativeDriver]), [[-8, 60, true], [8, 60, true], [-6, 60, true], [6, 60, true], [0, 60, true]]);
  }
});

test('auth step under reduced motion: same error, no shake', async () => {
  const env = makeEnv({ reduced: true });
  const { m } = mountAuth('signup', env);
  await submit(m);
  assert.ok(texts(m.tree).includes('Please enter your name.'));
  assert.equal(env.started.length, 0);
});

/* ---------------- onboarding wiring ---------------- */

function mountFlow() {
  const env = makeEnv();
  const m = new Mounted(env, env.get(LOC.flow, 'OnboardingFlow'), {});
  return { env, m };
}
function start(m: Mounted, mode: 'signin' | 'signup') { named(m.tree, 'Welcome')[0].props.go('auth', mode); return m.flush(); }

test('onboarding: welcome hands the chosen mode to the auth step', () => {
  for (const mode of ['signin', 'signup'] as const) {
    const { m } = mountFlow();
    start(m, mode);
    const auth = named(m.tree, 'Auth');
    assert.equal(auth.length, 1);
    assert.equal(auth[0].props.mode, mode);
  }
});

test('onboarding: signed in by password goes to finish (sign-in) or goal (sign-up)', () => {
  const expect = { signin: 'Finish', signup: 'Goal' } as const;
  for (const mode of ['signin', 'signup'] as const) {
    const { m } = mountFlow();
    start(m, mode);
    named(m.tree, 'Auth')[0].props.onNext('ada@example.com', true);
    m.flush();
    assert.equal(named(m.tree, expect[mode]).length, 1, mode);
    assert.equal(named(m.tree, 'Code').length, 0);
  }
});

test('onboarding: a code request goes to the code step, then finish (sign-in) or goal (sign-up)', () => {
  const expect = { signin: 'Finish', signup: 'Goal' } as const;
  for (const mode of ['signin', 'signup'] as const) {
    const { m } = mountFlow();
    start(m, mode);
    named(m.tree, 'Auth')[0].props.onNext('ada@example.com', false);
    m.flush();
    const code = named(m.tree, 'Code');
    assert.equal(code.length, 1);
    assert.equal(code[0].props.email, 'ada@example.com');
    assert.equal(code[0].props.newPassword, undefined);
    code[0].props.onNext();
    m.flush();
    assert.equal(named(m.tree, expect[mode]).length, 1, mode);
  }
});

test('onboarding: recovery passes the new password to the code step; back then a code request clears it', () => {
  const { m } = mountFlow();
  start(m, 'signin');
  named(m.tree, 'Auth')[0].props.onRecovery('ada@example.com', 'newpassword1');
  m.flush();
  let code = named(m.tree, 'Code')[0];
  assert.equal(code.props.email, 'ada@example.com');
  assert.equal(code.props.newPassword, 'newpassword1');
  all(m.tree).find((e) => e.type === 'Press' && e.props.label === 'Back')!.props.onPress();
  m.flush();
  named(m.tree, 'Auth')[0].props.onNext('ada@example.com', false);
  m.flush();
  code = named(m.tree, 'Code')[0];
  assert.equal(code.props.newPassword, undefined);
});
