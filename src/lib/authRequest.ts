// Sign in, then resume (docs/web-launch/SIGNIN-DESIGN.md, Loop 2 task 2.1, part A).
//
// Pure logic only: no React, no React Native, no direct reads of the page URL. The sheet host
// (part B) and the call sites (part C) build on these pieces:
// - isAuthFailure: does this error mean "sign in first"?
// - isSafePath and the intent codec: what may be stored to resume across a reload.
// - the controller: one pending sign-in request at a time, resolved exactly once.
// - the auth fragment helpers: read and scrub #access_token / #error from a landing URL
//   without ever handing token values back to the caller.

export type AuthReason =
  | 'checkout'
  | 'book'
  | 'follow'
  | 'save'
  | 'like'
  | 'openThread'
  | 'connect'
  | 'generic';

export const INTENT_KINDS = ['follow', 'save', 'like', 'openThread', 'book', 'checkout', 'connect'] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

export interface Intent {
  kind: IntentKind;
  ids: string[];
  path: string;
  t: number;
}

// ---------------------------------------------------------------------------------------------
// isAuthFailure

function readProp(obj: unknown, key: string): unknown {
  if (obj === null || (typeof obj !== 'object' && typeof obj !== 'function')) return undefined;
  try {
    // Own properties only: an inherited value (for example one planted on Object.prototype) is never read.
    if (!Object.prototype.hasOwnProperty.call(obj, key)) return undefined;
    return (obj as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function asText(v: unknown): string | null {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

function isStatus401(v: unknown): boolean {
  return v === 401 || v === '401';
}

/**
 * True when an error means the user has to sign in before the action can work.
 * 42501 (Postgres insufficient privilege) counts only when there is no session: with a session it
 * means "not allowed" (for example not a participant in a message thread), not "signed out".
 */
export function isAuthFailure(err: unknown, hasSession: boolean): boolean {
  try {
    if (err === null || err === undefined) return false;
    let code: string | null = null;
    let message: string | null = null;
    if (typeof err === 'string') {
      message = err;
    } else if (typeof err === 'object' || typeof err === 'function') {
      code = asText(readProp(err, 'code'));
      message = asText(readProp(err, 'message'));
      if (isStatus401(readProp(err, 'status'))) return true;
      if (isStatus401(readProp(readProp(err, 'context'), 'status'))) return true;
    } else {
      return false;
    }
    if (code === 'AUTH_REQUIRED' || message === 'AUTH_REQUIRED') return true;
    if (code === 'PGRST301') return true;
    if (message !== null && /jwt|not authenticated/i.test(message)) return true;
    if (code === '42501') return hasSession !== true;
    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Path allowlist

/**
 * Route prefixes an intent may return to, taken from the app/ directory. A path matches a prefix
 * when it equals it or continues with "/". "/" matches only itself. The admin console (/admin), the
 * cook hub (/hub) and account settings screens are left out on purpose: no guest action starts there.
 */
export const KNOWN_ROUTE_PREFIXES: readonly string[] = [
  '/',
  '/home',
  '/feeds',
  '/experiences',
  '/discover',
  '/my-hub',
  '/profile',
  '/orders',
  '/cart',
  '/checkout',
  '/store',
  '/meal',
  '/experience',
  '/post',
  '/plan',
  '/plans',
  '/prepplus',
  '/messages',
  '/chat',
  '/saved',
  '/favorites',
  '/notifications',
  '/order',
  '/track',
  '/service-request',
  '/request',
  '/rewards',
  '/tickets',
  '/rate-experience',
  '/review',
];

export const MAX_PATH_LENGTH = 120;
const PATH_CHARSET = /^\/[A-Za-z0-9/_-]*$/;

/** True for a same-site app path that is safe to navigate to after sign-in. */
export function isSafePath(p: string): boolean {
  if (typeof p !== 'string') return false;
  if (p.length === 0 || p.length > MAX_PATH_LENGTH) return false;
  if (!PATH_CHARSET.test(p)) return false;
  if (p.includes('//')) return false;
  if (p.includes('\\')) return false;
  if (p.includes(':')) return false;
  if (p.includes('%')) return false;
  return KNOWN_ROUTE_PREFIXES.some((prefix) =>
    prefix === '/' ? p === '/' : p === prefix || p.startsWith(prefix + '/'),
  );
}

// ---------------------------------------------------------------------------------------------
// Intent codec

export const INTENT_STORAGE_KEY = 'preppa.authIntent';
export const INTENT_TTL_MS = 15 * 60 * 1000;
/**
 * A stored timestamp this far in the future is still accepted (clock nudges); further is tampering.
 * Kept small so the longest lifetime stays about INTENT_TTL_MS + this.
 */
export const INTENT_CLOCK_SKEW_MS = 5 * 1000;
export const MAX_INTENT_IDS = 8;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ACCOUNT_KEY_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_STORED_LENGTH = 2048;

function isIntentKind(v: unknown): v is IntentKind {
  return typeof v === 'string' && (INTENT_KINDS as readonly string[]).includes(v);
}

function isAccountKey(v: unknown): v is string {
  return typeof v === 'string' && ACCOUNT_KEY_PATTERN.test(v);
}

/** Rebuilds an intent from known fields only, or null when any field is invalid. */
function sanitizeIntent(raw: unknown): Intent | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const kind = readProp(raw, 'kind');
  const ids = readProp(raw, 'ids');
  const path = readProp(raw, 'path');
  const t = readProp(raw, 't');
  if (!isIntentKind(kind)) return null;
  if (!Array.isArray(ids) || ids.length > MAX_INTENT_IDS) return null;
  const cleanIds: string[] = [];
  for (const id of ids) {
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
    cleanIds.push(id);
  }
  // Re-check on the cleaned copy: an array-like that misreports `length` cannot sneak extra ids in.
  if (cleanIds.length > MAX_INTENT_IDS) return null;
  if (typeof path !== 'string' || !isSafePath(path)) return null;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) return null;
  return { kind, ids: cleanIds, path, t };
}

/**
 * Serialises an intent bound to the account that is signing in (an email hash or a user id).
 * Returns null when the intent or the key is invalid, so nothing unsafe is ever written.
 */
export function encodeIntent(intent: Intent, accountKey: string): string | null {
  try {
    const clean = sanitizeIntent(intent);
    if (!clean || !isAccountKey(accountKey)) return null;
    return JSON.stringify({ kind: clean.kind, ids: clean.ids, path: clean.path, t: clean.t, k: accountKey });
  } catch {
    return null;
  }
}

/**
 * Parses a stored intent. Null on bad JSON, an invalid field, an expired or future timestamp, or
 * a stored account key that differs from `accountKey`. The path is re-checked here, not trusted.
 */
export function decodeIntent(raw: unknown, now: number, accountKey: string): Intent | null {
  try {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_STORED_LENGTH) return null;
    if (!isAccountKey(accountKey) || typeof now !== 'number' || !Number.isFinite(now)) return null;
    const parsed: unknown = JSON.parse(raw);
    const clean = sanitizeIntent(parsed);
    if (!clean) return null;
    if (readProp(parsed, 'k') !== accountKey) return null;
    const age = now - clean.t;
    if (age > INTENT_TTL_MS || age < -INTENT_CLOCK_SKEW_MS) return null;
    return clean;
  } catch {
    return null;
  }
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): KeyValueStorage | null {
  try {
    const s = (globalThis as { sessionStorage?: KeyValueStorage }).sessionStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

function pickStorage(storage: KeyValueStorage | null | undefined): KeyValueStorage | null {
  return storage === undefined ? defaultStorage() : storage;
}

/** Stores the intent for a resume across a reload. False when it is invalid or storage is blocked. */
export function saveIntent(intent: Intent, accountKey: string, storage?: KeyValueStorage | null): boolean {
  const encoded = encodeIntent(intent, accountKey);
  if (encoded === null) return false;
  const s = pickStorage(storage);
  if (!s) return false;
  try {
    s.setItem(INTENT_STORAGE_KEY, encoded);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the stored intent for `accountKey`. Anything that fails to decode (expired, tampered,
 * another account) is removed, so a stale intent never survives to a later sign-in.
 */
export function loadIntent(now: number, accountKey: string, storage?: KeyValueStorage | null): Intent | null {
  const s = pickStorage(storage);
  if (!s) return null;
  let raw: string | null;
  try {
    raw = s.getItem(INTENT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null || raw === undefined) return null;
  const intent = decodeIntent(raw, now, accountKey);
  if (intent === null) clearIntent(s);
  return intent;
}

/**
 * Single use: loads the intent for `accountKey` and clears the stored copy in the same step, whether
 * or not it decoded. A second call returns null.
 */
export function consumeIntent(accountKey: string, now: number, storage?: KeyValueStorage | null): Intent | null {
  const intent = loadIntent(now, accountKey, storage);
  clearIntent(storage);
  return intent;
}

export function clearIntent(storage?: KeyValueStorage | null): void {
  const s = pickStorage(storage);
  if (!s) return;
  try {
    s.removeItem(INTENT_STORAGE_KEY);
  } catch {
    // Blocked storage: nothing was stored, nothing to clear.
  }
}

// ---------------------------------------------------------------------------------------------
// Controller

export interface SignInState {
  open: boolean;
  reason: AuthReason | null;
}

type Listener = (state: SignInState) => void;

const CLOSED: SignInState = Object.freeze({ open: false, reason: null });

let state: SignInState = CLOSED;
let pending: { promise: Promise<boolean>; resolve: (ok: boolean) => void } | null = null;
let pendingIntent: Intent | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(state);
    } catch {
      // One failing listener must not stop the others or the resolution.
    }
  }
}

/**
 * Asks the host to show the sign-in sheet. Concurrent calls share one pending promise (the first
 * caller's reason and intent win). Resolves true after a sign-in, false when dismissed.
 */
export function requestSignIn(reason: AuthReason, intent?: Intent): Promise<boolean> {
  if (pending) return pending.promise;
  // No host is listening, so nobody could ever settle this request: fail it now instead of hanging.
  if (listeners.size === 0) return Promise.resolve(false);
  let resolve: (ok: boolean) => void = () => {};
  const promise = new Promise<boolean>((r) => {
    resolve = r;
  });
  pending = { promise, resolve };
  pendingIntent = intent === undefined ? null : sanitizeIntent(intent);
  state = Object.freeze({ open: true, reason });
  emit();
  return promise;
}

/** Settles the pending request. Only the first call after a request has any effect. */
export function resolveSignIn(ok: boolean): void {
  if (!pending) return;
  const { resolve } = pending;
  pending = null;
  pendingIntent = null;
  state = CLOSED;
  resolve(ok === true);
  emit();
}

export function dismissSignIn(): void {
  resolveSignIn(false);
}

/** The sanitised intent of the open request, for the host to store once it knows the account. */
export function getPendingIntent(): Intent | null {
  return pendingIntent;
}

export function getSignInState(): SignInState {
  return state;
}

/** Calls `listener` on every open and close. Returns the unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // The last host went away while a request is open: nobody can settle it, so settle it false.
    if (listeners.size === 0 && pending) resolveSignIn(false);
  };
}

/** Test-only: not for app code. Settles any pending request false and removes every listener. */
export function __resetForTests(): void {
  const p = pending;
  pending = null;
  pendingIntent = null;
  state = CLOSED;
  listeners.clear();
  if (p) p.resolve(false);
}

// ---------------------------------------------------------------------------------------------
// Auth fragment (#access_token, #error, #error_code)

export interface AuthFragment {
  hasTokens: boolean;
  error: string | null;
  errorCode: string | null;
}

const TOKEN_KEYS = new Set(['access_token', 'refresh_token', 'provider_token', 'provider_refresh_token']);
const SAFE_FRAGMENT_VALUE = /^[A-Za-z0-9_.-]{1,64}$/;

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v.replace(/\+/g, ' '));
  } catch {
    return '';
  }
}

/** Returns a fragment value only when it is a short code, otherwise 'unknown'. Never free text. */
function safeFragmentValue(v: string): string {
  return SAFE_FRAGMENT_VALUE.test(v) ? v : 'unknown';
}

/**
 * Reads an auth landing fragment. Reports whether tokens are present but never returns them;
 * error and errorCode come back only as short codes (free text becomes 'unknown').
 */
export function parseAuthFragment(hash: string): AuthFragment {
  const result: AuthFragment = { hasTokens: false, error: null, errorCode: null };
  if (typeof hash !== 'string' || hash.length === 0) return result;
  const body = hash.startsWith('#') ? hash.slice(1) : hash;
  for (const part of body.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const key = safeDecode(eq < 0 ? part : part.slice(0, eq));
    const value = eq < 0 ? '' : safeDecode(part.slice(eq + 1));
    if (TOKEN_KEYS.has(key)) result.hasTokens = true;
    else if (key === 'error') result.error = safeFragmentValue(value);
    else if (key === 'error_code') result.errorCode = safeFragmentValue(value);
  }
  return result;
}

export interface FragmentWindow {
  location?: { hash?: string; pathname?: string; search?: string };
  history?: { state?: unknown; replaceState?: (data: unknown, unused: string, url?: string) => void };
}

/**
 * Removes an auth fragment from the address bar with history.replaceState. Does nothing when the
 * fragment carries no tokens or errors, or `win` is null. The caller passes the window; there is no global fallback. Returns what was found (without
 * token values) when it scrubbed, otherwise null.
 */
export function scrubAuthFragment(win: FragmentWindow | null): AuthFragment | null {
  try {
    const w = win;
    if (!w) return null;
    const loc = w.location;
    const hist = w.history;
    if (!loc || !hist || typeof hist.replaceState !== 'function') return null;
    const found = parseAuthFragment(typeof loc.hash === 'string' ? loc.hash : '');
    if (!found.hasTokens && found.error === null && found.errorCode === null) return null;
    // Exactly one leading slash, so a pathname like "//evil.com/x" cannot become a protocol-relative URL.
    const url = '/' + (loc.pathname || '').replace(/^\/+/, '') + (loc.search || '');
    hist.replaceState(hist.state ?? null, '', url);
    return found;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Error copy

export const AUTH_COPY = {
  expired: 'That link expired. Send a new one.',
  rateLimited: 'Too many tries. Wait a minute.',
  generic: 'Something went wrong. Try again.',
} as const;

/** Friendly copy for an auth error code or message. Raw server text is never echoed. */
export function mapAuthErrorMessage(codeOrMessage: unknown): string {
  const text = asText(codeOrMessage);
  if (text === null) return AUTH_COPY.generic;
  if (/otp_expired/i.test(text)) return AUTH_COPY.expired;
  if (/(^|\D)429(\D|$)|rate[ _-]?limit|too many/i.test(text)) return AUTH_COPY.rateLimited;
  return AUTH_COPY.generic;
}
