// Options on the shared sign-in forms (SIGNIN-DESIGN.md, Loop 2 task 2.1, part B2a).
//
// The web sheet configures `Auth` and `Code` with props; native onboarding passes none, so every
// default must reproduce today's behaviour (tests/authForms.characterization.test.ts pins that).
// This file proves each option does what it says. The harness is a trimmed copy of the one in the
// characterization test (read its header): modules are transpiled with TypeScript and run against
// a hook shim, a fake clock and recorded Supabase calls; tests read props off the element tree.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { WEB_PASSWORD_MIN, WEB_RESEND_COOLDOWN_SEC, webAuthError, webAuthNotice } from '../src/lib/webAuth';

const AUTH = 'src/components/auth/AuthForm.tsx';
const CODE = 'src/components/auth/CodeForm.tsx';
const ROOT = join(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const TIMEOUT = /export const AUTH_TIMEOUT_MESSAGE = '([^']*)'/.exec(read('src/lib/supabase.ts'))![1];
const CONSENT_TEXT = 'By continuing you agree to the Terms and Privacy Policy.';
const CONSENT_REQUIRED = 'Please agree to the Terms and Privacy Policy to continue.';
const NOTICE = 'If this email is new, we have sent next steps.';
const CODE_MISMATCH = "That code didn't match or has expired. Request a new one.";

/* ---------------- harness (trimmed copy) ---------------- */

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
const input = (tree: any, label: string) => {
  const found = all(tree).filter((e) => e.type === 'TextInput' && e.props.accessibilityLabel === label);
  return found.length === 1 ? found[0] : undefined;
};
const pressable = (tree: any, label: string) => all(tree).find((e) => e.type === 'Pressable' && textOf(e).includes(label));
// The colour of the Text showing exactly this copy: c.green is the info row, c.red the error row.
const colorOf = (tree: any, copy: string) => {
  const t = all(tree).find((e) => e.type === 'Text' && textOf(e) === copy);
  return t ? [t.props.style].flat(2).find((s: any) => s && 'color' in s)?.color : undefined;
};
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
const proxy = (prefix: string): any => new Proxy({}, { get: (_t, k) => `${prefix}.${String(k)}` });

function makeEnv() {
  const env: any = { calls: [] as [string, any[]][], impl: {} as Record<string, (...a: any[]) => any>, started: [] as any[], clock: new Clock(), cache: new Map<string, any>(), current: null as any };
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
    Animated: { Value, View: 'Animated.View', timing: (value: any, cfg: any) => anim('timing', { value, cfg }), sequence: (items: any[]) => anim('sequence', { items }), loop: (item: any) => anim('loop', { items: [item] }) },
    Easing: { linear: 'linear' },
    Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View',
    Linking: { openURL: (url: string) => { env.calls.push(['openURL', [url]]); return Promise.resolve(); } },
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
    'src/ui/Icon': { Icon: 'Icon' },
    'src/ui/primitives': { Btn: 'Btn' },
    'src/ui/useReducedMotion': { useReducedMotion: () => false },
    'src/theme/ThemeContext': { useC: () => proxy('c') },
    'src/theme/theme': { type: (size: number, weight: number) => ({ fontSize: size, fontWeight: weight, fontFamily: `font-${weight}` }), radius: proxy('radius'), FILL: { FILL: true } },
  };
  const jsx = (type: any, props: any, key?: any) => ({ type, props, key });
  const bare: Record<string, any> = { react: React, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': RN };
  const load = (abs: string): any => {
    if (env.cache.has(abs)) return env.cache.get(abs);
    const js = ts.transpileModule(readFileSync(abs, 'utf8'), {
      fileName: abs,
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    }).outputText;
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
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', js)(req, module, module.exports, env.clock.setTimeout, env.clock.clearTimeout);
    env.cache.set(abs, module.exports);
    return module.exports;
  };
  env.get = (file: string, name: string) => { const f = load(join(ROOT, file))[name]; assert.equal(typeof f, 'function', `${name} not exported from ${file}`); return f; };
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
  async settle() { for (let k = 0; k < 8; k++) { await new Promise((r) => setImmediate(r)); this.flush(); } return this.tree; }
  advance(ms: number) {
    const clock = this.env.clock as Clock;
    const end = clock.now + ms;
    for (let t = clock.next(end); t; t = clock.next(end)) { clock.timers.delete(t[0]); clock.now = t[1].at; t[1].fn(); this.flush(); }
    clock.now = end;
    return this.tree;
  }
}

const callsOf = (env: any, name: string) => env.calls.filter((c: any) => c[0] === name).map((c: any) => c[1]);
const shakeCount = (env: any) => env.started.filter((a: any) => a.kind === 'sequence').length;

function mountAuth(mode: 'signin' | 'signup', extra: Record<string, any> = {}) {
  const env = makeEnv();
  const props = {
    mode,
    onNext: (email: string, authed: boolean) => env.calls.push(['onNext', [email, authed]]),
    onRecovery: (email: string, pw: string) => env.calls.push(['onRecovery', [email, pw]]),
    ...extra,
  };
  return { env, m: new Mounted(env, env.get(AUTH, 'Auth'), props) };
}
function type(m: Mounted, label: string, value: string) { const el = input(m.tree, label); assert.ok(el, `input ${label}`); el!.props.onChangeText(value); return m.flush(); }
async function submit(m: Mounted) { const p = btn(m.tree).props.onPress(); m.flush(); await p; return m.settle(); }
async function emailCode(m: Mounted) { const p = pressable(m.tree, 'Email me a sign-in code instead')!.props.onPress(); m.flush(); await p; return m.settle(); }
function fillSignup(m: Mounted, pw = 'password1') { type(m, 'Your name', 'Ada'); type(m, 'Email address', ' Ada@Example.COM '); type(m, 'Password', pw); }
function consentProp(mode: 'none' | 'notice' | 'checkbox', checked = false) {
  const c: any = { mode, checked, changes: [] as boolean[] };
  c.onChange = (v: boolean) => { c.changes.push(v); };
  return c;
}

/* ---------------- passwordMin ---------------- */

test('passwordMin 10: a 9-character password is rejected with the 10 copy, 10 characters is accepted', async () => {
  const { env, m } = mountAuth('signup', { passwordMin: WEB_PASSWORD_MIN });
  assert.equal(input(m.tree, 'Password')!.props.placeholder, 'At least 10 characters');
  fillSignup(m, '123456789');
  await submit(m);
  assert.ok(texts(m.tree).includes('Use a password of at least 10 characters.'));
  assert.deepEqual(callsOf(env, 'signUpWithPassword'), []);
  type(m, 'Password', '1234567890');
  await submit(m);
  assert.deepEqual(callsOf(env, 'signUpWithPassword'), [['Ada@Example.COM', '1234567890', { display_name: 'Ada', first_name: 'Ada' }]]);
});

test('passwordMin 10 also applies to the recovery password', async () => {
  const { env, m } = mountAuth('signin', { passwordMin: 10 });
  pressable(m.tree, 'Forgot password?')!.props.onPress();
  m.flush();
  assert.equal(input(m.tree, 'New password')!.props.placeholder, 'At least 10 characters');
  type(m, 'Email address', 'ada@example.com');
  type(m, 'New password', '123456789');
  await submit(m);
  assert.ok(texts(m.tree).includes('Use a password of at least 10 characters.'));
  assert.deepEqual(callsOf(env, 'sendPasswordResetOtp'), []);
});

test('defaults: 8-character minimum, 8 accepted, no consent row', async () => {
  const { env, m } = mountAuth('signup');
  assert.equal(input(m.tree, 'Password')!.props.placeholder, 'At least 8 characters');
  assert.ok(!texts(m.tree).includes(CONSENT_TEXT));
  assert.equal(all(m.tree).filter((e) => e.props?.accessibilityRole === 'checkbox').length, 0);
  fillSignup(m, '1234567');
  await submit(m);
  assert.ok(texts(m.tree).includes('Use a password of at least 8 characters.'));
  type(m, 'Password', '12345678');
  await submit(m);
  assert.equal(callsOf(env, 'signUpWithPassword').length, 1);
});

/* ---------------- onAccountEmail ---------------- */

test('onAccountEmail: trimmed lowercase email on a valid submit and on a code request, not on an invalid one', async () => {
  const seen: string[] = [];
  const { m } = mountAuth('signup', { onAccountEmail: (e: string) => seen.push(e) });
  type(m, 'Email address', 'nope');
  await submit(m);
  assert.deepEqual(seen, []);
  fillSignup(m);
  await submit(m);
  assert.deepEqual(seen, ['ada@example.com']);
  const seenCode: string[] = [];
  const other = mountAuth('signin', { onAccountEmail: (e: string) => seenCode.push(e) });
  type(other.m, 'Email address', ' Bob@Example.com ');
  await emailCode(other.m);
  assert.deepEqual(seenCode, ['bob@example.com']);
});

test('onAccountEmail: not called when the password is too short or consent is missing', async () => {
  const seen: string[] = [];
  const short = mountAuth('signup', { onAccountEmail: (e: string) => seen.push(e) });
  fillSignup(short.m, '1234567');
  await submit(short.m);
  assert.ok(texts(short.m.tree).includes('Use a password of at least 8 characters.'));
  assert.equal(seen.length, 0);
  const noConsent = mountAuth('signup', { consent: consentProp('checkbox'), onAccountEmail: (e: string) => seen.push(e) });
  fillSignup(noConsent.m);
  await submit(noConsent.m);
  assert.deepEqual(seen, [], 'submit');
  await emailCode(noConsent.m);
  assert.deepEqual(seen, [], 'email-code path');
  assert.ok(texts(noConsent.m.tree).includes(CONSENT_REQUIRED));
});

test('onAccountEmail: a throwing or rejecting callback never blocks submit or the code request', async () => {
  const boom = mountAuth('signup', { onAccountEmail: () => { throw new Error('storage full'); } });
  fillSignup(boom.m);
  await submit(boom.m);
  assert.deepEqual(callsOf(boom.env, 'onNext'), [['Ada@Example.COM', true]]);
  await emailCode(boom.m);
  assert.equal(callsOf(boom.env, 'sendEmailOtp').length, 1);
  const handlers: unknown[] = [];
  const rejecting: any = { then(_ok: unknown, fail: unknown) { handlers.push(fail); return rejecting; } };
  const later = mountAuth('signin', { onAccountEmail: () => rejecting });
  type(later.m, 'Email address', 'ada@example.com');
  type(later.m, 'Password', 'password1');
  await submit(later.m);
  await emailCode(later.m);
  assert.equal(callsOf(later.env, 'signInWithPassword').length, 1);
  assert.equal(callsOf(later.env, 'sendEmailOtp').length, 1);
  assert.equal(handlers.length, 2);
  assert.ok(handlers.every((h) => typeof h === 'function'), 'a rejection handler is attached');
  const real = mountAuth('signin', { onAccountEmail: () => Promise.reject(new Error('later')) });
  type(real.m, 'Email address', 'ada@example.com');
  type(real.m, 'Password', 'password1');
  await submit(real.m);
  assert.equal(callsOf(real.env, 'signInWithPassword').length, 1);
});

/* ---------------- mapError ---------------- */

test('mapError: overrides the sign-in, sign-up and code-request messages, timeout included', async () => {
  const got: unknown[] = [];
  const mapError = (e: unknown) => { got.push(e); return 'mapped copy'; };
  const signin = mountAuth('signin', { mapError });
  const wrong = new Error('Invalid login credentials');
  signin.env.impl.signInWithPassword = async () => { throw wrong; };
  type(signin.m, 'Email address', 'ada@example.com');
  type(signin.m, 'Password', 'password1');
  await submit(signin.m);
  assert.ok(texts(signin.m.tree).includes('mapped copy'));
  assert.ok(!texts(signin.m.tree).some((s) => s.startsWith('Wrong email or password. Try again')));
  assert.equal(got[0], wrong, 'receives the error itself');
  signin.env.impl.signInWithPassword = async () => { throw new Error(TIMEOUT); };
  await submit(signin.m);
  assert.ok(!texts(signin.m.tree).includes(TIMEOUT));
  signin.env.impl.sendEmailOtp = async () => { throw new Error('Email rate limit exceeded'); };
  await emailCode(signin.m);
  assert.ok(texts(signin.m.tree).includes('mapped copy'));
  assert.ok(!texts(signin.m.tree).includes('Email rate limit exceeded'), 'raw message not shown');

  const signup = mountAuth('signup', { mapError: webAuthError, mapNotice: webAuthNotice });
  signup.env.impl.signUpWithPassword = async () => { throw new Error('User already registered'); };
  fillSignup(signup.m);
  await submit(signup.m);
  assert.equal(colorOf(signup.m.tree, NOTICE), 'c.green', 'a duplicate sign-up is the neutral info notice');
  assert.equal(shakeCount(signup.env), 0, 'and does not shake');
});

/* ---------------- mapNotice, neutralRecovery ---------------- */

test('mapNotice: a duplicate sign-up shows the notice as info, no red error, no shake, same step', async () => {
  const { env, m } = mountAuth('signup', { mapError: webAuthError, mapNotice: webAuthNotice });
  env.impl.signUpWithPassword = async () => { throw { code: 'user_already_exists', message: 'User already registered' }; };
  fillSignup(m);
  await submit(m);
  assert.equal(colorOf(m.tree, NOTICE), 'c.green');
  assert.equal(all(m.tree).filter((e) => e.type === 'Icon' && e.props.color === 'c.red').length, 0, 'no red error row');
  assert.equal(shakeCount(env), 0);
  assert.deepEqual(callsOf(env, 'onNext'), []);
  assert.equal(btn(m.tree).props.label, 'Create account', 'same step');
});

test('mapNotice: null falls back to mapError, and the code request uses the notice too', async () => {
  const { env, m } = mountAuth('signin', { mapError: webAuthError, mapNotice: webAuthNotice });
  env.impl.signInWithPassword = async () => { throw new Error('Invalid login credentials'); };
  type(m, 'Email address', 'ada@example.com');
  type(m, 'Password', 'password1');
  await submit(m);
  assert.equal(colorOf(m.tree, 'Wrong email or password'), 'c.red');
  assert.equal(shakeCount(env), 1);
  env.impl.sendEmailOtp = async () => { throw { code: 'email_exists' }; };
  await emailCode(m);
  assert.equal(colorOf(m.tree, NOTICE), 'c.green');
  assert.equal(colorOf(m.tree, 'Wrong email or password'), undefined, 'the earlier error is cleared');
  assert.equal(shakeCount(env), 1, 'no second shake');
  assert.deepEqual(callsOf(env, 'onNext'), []);
});

test('mapNotice absent: a duplicate sign-up is still the red, shaking mapError copy', async () => {
  const { env, m } = mountAuth('signup', { mapError: webAuthError });
  env.impl.signUpWithPassword = async () => { throw new Error('User already registered'); };
  fillSignup(m);
  await submit(m);
  assert.equal(colorOf(m.tree, NOTICE), 'c.red');
  assert.equal(shakeCount(env), 1);
});

async function recover(extra: Record<string, any>, impl?: () => Promise<unknown>) {
  const r = mountAuth('signin', extra);
  pressable(r.m.tree, 'Forgot password?')!.props.onPress();
  r.m.flush();
  type(r.m, 'Email address', 'ada@example.com');
  type(r.m, 'New password', 'newpassword1');
  if (impl) r.env.impl.sendPasswordResetOtp = impl;
  await submit(r.m);
  return r;
}

test('neutralRecovery: an unknown email advances to the code step exactly like a known one', async () => {
  const opts = { neutralRecovery: true, mapError: webAuthError };
  const known = await recover(opts);
  assert.deepEqual(callsOf(known.env, 'onRecovery'), [['ada@example.com', 'newpassword1']]);
  for (const e of [{ code: 'otp_disabled', message: 'Signups not allowed for otp' }, new Error('Signups not allowed for otp'), { code: 'user_not_found', message: 'User not found' }]) {
    const unknown = await recover(opts, async () => { throw e; });
    assert.deepEqual(callsOf(unknown.env, 'onRecovery'), callsOf(known.env, 'onRecovery'));
    assert.deepEqual(texts(unknown.m.tree), texts(known.m.tree), 'same screen');
    assert.equal(shakeCount(unknown.env), 0);
  }
});

test('neutralRecovery: other errors still show mapError copy, and it is off by default', async () => {
  const limited = await recover({ neutralRecovery: true, mapError: webAuthError }, async () => { throw { status: 429, message: 'x' }; });
  assert.equal(colorOf(limited.m.tree, 'Too many tries. Wait a minute.'), 'c.red');
  assert.deepEqual(callsOf(limited.env, 'onRecovery'), []);
  assert.equal(shakeCount(limited.env), 1);
  const off = await recover({ mapError: webAuthError }, async () => { throw { code: 'otp_disabled', message: 'Signups not allowed for otp' }; });
  assert.deepEqual(callsOf(off.env, 'onRecovery'), []);
  assert.equal(colorOf(off.m.tree, 'Something went wrong. Try again.'), 'c.red');
});

/* ---------------- consent ---------------- */

test('consent checkbox: unchecked accessible row blocks submit and the code request until checked', async () => {
  const consent = consentProp('checkbox');
  const { env, m } = mountAuth('signup', { consent });
  const box = pressable(m.tree, CONSENT_TEXT)!;
  assert.ok(box);
  assert.equal(box.props.accessibilityRole, 'checkbox');
  assert.deepEqual(box.props.accessibilityState, { checked: false });
  assert.equal(box.props.accessibilityLabel, CONSENT_TEXT);
  fillSignup(m);
  await submit(m);
  assert.ok(texts(m.tree).includes(CONSENT_REQUIRED));
  assert.equal(shakeCount(env), 1);
  await emailCode(m);
  assert.ok(texts(m.tree).includes(CONSENT_REQUIRED));
  assert.deepEqual(callsOf(env, 'signUpWithPassword'), []);
  assert.deepEqual(callsOf(env, 'sendEmailOtp'), []);
  pressable(m.tree, CONSENT_TEXT)!.props.onPress();
  m.flush();
  assert.deepEqual(consent.changes, [true]);
  assert.ok(!texts(m.tree).includes(CONSENT_REQUIRED), 'toggling clears the error');
  consent.checked = true;
  m.render();
  assert.deepEqual(pressable(m.tree, CONSENT_TEXT)!.props.accessibilityState, { checked: true });
  await submit(m);
  assert.equal(callsOf(env, 'signUpWithPassword').length, 1);
});

test('consent checkbox: also blocks sign-in, its code request and the Enter key', async () => {
  const { env, m } = mountAuth('signin', { consent: consentProp('checkbox') });
  type(m, 'Email address', 'ada@example.com');
  type(m, 'Password', 'password1');
  await submit(m);
  assert.ok(texts(m.tree).includes(CONSENT_REQUIRED));
  await emailCode(m);
  const enter = input(m.tree, 'Password')!.props.onSubmitEditing();
  m.flush();
  await enter;
  await m.settle();
  assert.ok(texts(m.tree).includes(CONSENT_REQUIRED));
  assert.deepEqual(callsOf(env, 'signInWithPassword'), []);
  assert.deepEqual(callsOf(env, 'sendEmailOtp'), []);
  assert.equal(shakeCount(env), 3);
  const up = mountAuth('signup', { consent: consentProp('checkbox') });
  fillSignup(up.m);
  const upEnter = input(up.m.tree, 'Password')!.props.onSubmitEditing();
  up.m.flush();
  await upEnter;
  await up.m.settle();
  assert.ok(texts(up.m.tree).includes(CONSENT_REQUIRED), 'Enter on sign-up');
  assert.deepEqual(callsOf(up.env, 'signUpWithPassword'), []);
});

test('consent notice: one line of text, no checkbox, submit is not blocked', async () => {
  const { env, m } = mountAuth('signup', { consent: consentProp('notice') });
  assert.ok(texts(m.tree).includes(CONSENT_TEXT));
  assert.equal(all(m.tree).filter((e) => e.props?.accessibilityRole === 'checkbox').length, 0);
  fillSignup(m);
  await submit(m);
  assert.equal(callsOf(env, 'signUpWithPassword').length, 1);
  assert.ok(!texts(m.tree).includes(CONSENT_REQUIRED));
});

test('consent checkbox: hidden and not required during password recovery', async () => {
  const { env, m } = mountAuth('signin', { consent: consentProp('checkbox') });
  assert.ok(pressable(m.tree, CONSENT_TEXT));
  pressable(m.tree, 'Forgot password?')!.props.onPress();
  m.flush();
  assert.equal(pressable(m.tree, CONSENT_TEXT), undefined);
  type(m, 'Email address', 'ada@example.com');
  type(m, 'New password', 'newpassword1');
  await submit(m);
  assert.deepEqual(callsOf(env, 'sendPasswordResetOtp'), [['ada@example.com']]);
});

/* ---------------- Code: resendCooldownSec, mapError ---------------- */

function mountCode(extra: Record<string, any> = {}) {
  const env = makeEnv();
  const props = { email: 'ada@example.com', onNext: () => env.calls.push(['onNext', []]), ...extra };
  return { env, m: new Mounted(env, env.get(CODE, 'Code'), props) };
}

test('resendCooldownSec 60: the countdown runs for 60 seconds', async () => {
  const { env, m } = mountCode({ resendCooldownSec: WEB_RESEND_COOLDOWN_SEC });
  await pressable(m.tree, 'Resend code')!.props.onPress();
  await m.settle();
  m.advance(2400);
  assert.ok(pressable(m.tree, 'Resend in 58s'));
  m.advance(60000 - 2400 - 1);
  assert.ok(pressable(m.tree, 'Resend in 1s'));
  m.advance(1);
  assert.equal(pressable(m.tree, 'Resend code')!.props.disabled, false);
  assert.equal(callsOf(env, 'sendEmailOtp').length, 1);
});

test('resendCooldownSec default stays 24', async () => {
  const { m } = mountCode();
  await pressable(m.tree, 'Resend code')!.props.onPress();
  await m.settle();
  m.advance(2400);
  assert.ok(pressable(m.tree, 'Resend in 22s'));
});

test('Code mapError: overrides the wrong-code and resend messages, in the code context', async () => {
  const ctxs: unknown[] = [];
  const mapError = (e: unknown, ctx?: 'auth' | 'code') => { ctxs.push(ctx); return webAuthError(e, ctx); };
  const { env, m } = mountCode({ mapError });
  env.impl.verifyEmailOtp = async () => { throw { code: 'otp_expired', message: 'Token has expired or is invalid' }; };
  input(m.tree, 'Six digit verification code')!.props.onChangeText('123456');
  await m.settle();
  assert.ok(texts(m.tree).includes(CODE_MISMATCH), 'a wrong code is not a link that expired');
  assert.ok(!texts(m.tree).includes('That link expired. Send a new one.'));
  assert.equal(input(m.tree, 'Six digit verification code')!.props.value, '', 'field still cleared');
  assert.equal(shakeCount(env), 1, 'and still shakes');
  env.impl.sendEmailOtp = async () => { throw { status: 429, message: 'raw server text' }; };
  await pressable(m.tree, 'Resend code')!.props.onPress();
  await m.settle();
  assert.ok(texts(m.tree).includes('Too many tries. Wait a minute.'));
  assert.ok(!texts(m.tree).includes('raw server text'));
  assert.deepEqual(ctxs, ['code', 'code']);
});

/* ---------------- consent links ---------------- */

const TERMS_URL = 'https://help.preppa.live/legal/terms';
const PRIVACY_URL = 'https://help.preppa.live/legal/privacy';
const links = (tree: any) => all(tree).filter((e) => e.type === 'Text' && e.props.accessibilityRole === 'link');

test('consent links: Terms and Privacy Policy open the help-center legal pages, in the notice and the checkbox', () => {
  for (const mode of ['notice', 'checkbox'] as const) {
    const { env, m } = mountAuth('signup', { consent: consentProp(mode) });
    const l = links(m.tree);
    assert.deepEqual(l.map((e) => textOf(e)), ['Terms', 'Privacy Policy'], mode);
    // The sentence reads as before; only the two names became links.
    assert.ok(all(m.tree).some((e) => e.type === 'Text' && textOf(e) === CONSENT_TEXT && e.props.accessibilityRole === undefined), mode);
    l[0].props.onPress();
    l[1].props.onPress();
    assert.deepEqual(callsOf(env, 'openURL'), [[TERMS_URL], [PRIVACY_URL]], mode);
  }
});

test('consent links: the same URLs as the profile screen', () => {
  const profile = read('app/(tabs)/profile.tsx');
  assert.match(profile, new RegExp(`const TERMS_URL = '${TERMS_URL}';`));
  assert.match(profile, new RegExp(`const PRIVACY_URL = '${PRIVACY_URL}';`));
});

test('consent links: none by default (native) and none during password recovery', () => {
  assert.equal(links(mountAuth('signup').m.tree).length, 0);
  assert.equal(links(mountAuth('signin').m.tree).length, 0);
  const { m } = mountAuth('signin', { consent: consentProp('checkbox') });
  assert.equal(links(m.tree).length, 2);
  pressable(m.tree, 'Forgot password?')!.props.onPress();
  m.flush();
  assert.equal(links(m.tree).length, 0);
});
