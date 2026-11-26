// Decisions for useRequireAuth (docs/web-launch/SIGNIN-DESIGN.md, Loop 2 task 2.1, part C).
//
// Pure: no React, no React Native. The hook reads these; tests/useRequireAuth.test.ts and
// tests/requireAuthRun.test.ts pin them.

import type { AccountGateState } from './accountGate';
import { isSafePath, MAX_INTENT_IDS, type AuthReason, type Intent, type IntentKind } from './authRequest';

/** Kinds that run again by themselves after a sign-in. Money kinds (checkout, book, connect) never do. */
export const AUTO_RUN_KINDS: readonly IntentKind[] = Object.freeze(['follow', 'save', 'like', 'openThread'] as IntentKind[]);

export function isAutoRunKind(kind: unknown): boolean {
  return typeof kind === 'string' && (AUTO_RUN_KINDS as readonly string[]).includes(kind);
}

/**
 * Before asking for a sign-in (web only; native always runs):
 * - wait: the account state is not known yet (accountGate: storage hydrated and first reconcile done).
 * - run: signed in, run the action now.
 * - signIn: signed out, open the sheet.
 */
export type PreflightStep = 'wait' | 'run' | 'signIn';

export function preflightDecision(s: AccountGateState & { signedIn: boolean }): PreflightStep {
  if (!s.ready || !s.accountReady) return 'wait';
  return s.signedIn ? 'run' : 'signIn';
}

/**
 * After the sheet settles:
 * - run: signed in and the kind is idempotent, so the action runs once, now.
 * - reenable: signed in but the kind moves money (or is unknown); nothing runs, the user taps again.
 * - cancel: dismissed or another account signed in; nothing runs.
 */
export type AfterSignInStep = 'run' | 'reenable' | 'cancel';

export function decideAfterSignIn(kind: AuthReason | IntentKind, ok: boolean): AfterSignInStep {
  if (ok !== true) return 'cancel';
  return isAutoRunKind(kind) ? 'run' : 'reenable';
}

/** The kind that decides auto-run: the reason, unless an intent disagrees with it (then never auto-run). */
export function effectiveKind(reason: AuthReason, intent: Intent | undefined): AuthReason {
  if (intent && intent.kind !== reason) return 'generic';
  return reason;
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * An intent for a screen's real ids. Any id outside [A-Za-z0-9_-] (or too many) drops all ids;
 * an unsafe path drops the whole intent (the same-document resume still works without it).
 */
export function buildIntent(kind: IntentKind, ids: readonly unknown[], path: string, t: number): Intent | undefined {
  if (!isSafePath(path)) return undefined;
  const valid = ids.length <= MAX_INTENT_IDS && ids.every((id) => typeof id === 'string' && ID_PATTERN.test(id));
  return { kind, ids: valid ? (ids as string[]).slice() : [], path, t };
}

/** `resumed` is true when the action runs after a sign-in (state read signed out may be stale). */
export type RequireAuthRun = (ctx: { resumed: boolean }) => void | Promise<void>;

/** How long the live session check may take before it counts as signed out. */
export const SESSION_CHECK_MS = 1500;

/** Settles true only when `lookup` resolves true within `ms`; a rejection or a timeout is false. */
export function liveSessionCheck(lookup: () => Promise<boolean>, ms: number = SESSION_CHECK_MS): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    let p: Promise<boolean>;
    try {
      p = lookup();
    } catch {
      clearTimeout(timer);
      resolve(false);
      return;
    }
    Promise.resolve(p).then(
      (v) => { clearTimeout(timer); resolve(v === true); },
      () => { clearTimeout(timer); resolve(false); },
    );
  });
}

/** What useRequireAuth hands runRequireAuth; tests pass fakes. */
export interface RequireAuthDeps {
  isWeb: boolean;
  getState(): AccountGateState & { signedIn: boolean };
  /** Settles when the account state may have changed (or the screen unmounted). */
  waitForReady(): Promise<void>;
  /** Web: is there a live session even though the store says signed out? Never rejects. */
  hasSession(): Promise<boolean>;
  requestSignIn(reason: AuthReason, intent: Intent | undefined): Promise<boolean>;
  alive(): boolean;
  /** One wait or sheet per screen at a time. */
  pending: { current: boolean };
}

/**
 * Native: runs the action and returns true. Web:
 * - signed in now: runs the action.
 * - account state not known yet: waits (one wait or sheet per screen; a second call meanwhile
 *   returns false and runs nothing). When the wait ends signed in, only idempotent kinds run;
 *   money kinds return true without running, so the user taps again.
 * - signed out by the store but a live session exists (the flag is stale after a sign-in): no
 *   second sheet; idempotent kinds run with `resumed: true`, money kinds return true.
 * - signed out: opens the sheet. After a sign-in idempotent kinds run with `resumed: true`;
 *   money kinds return true. A dismissal returns false.
 * Nothing runs once `alive()` is false.
 */
export async function runRequireAuth(
  deps: RequireAuthDeps,
  reason: AuthReason,
  intent: Intent | undefined,
  run: RequireAuthRun,
): Promise<boolean> {
  if (!deps.isWeb) {
    await run({ resumed: false });
    return true;
  }
  let step = preflightDecision(deps.getState());
  if (step === 'run') {
    await run({ resumed: false });
    return true;
  }
  if (deps.pending.current) return false;
  deps.pending.current = true;
  try {
    const kind = effectiveKind(reason, intent);
    const waited = step === 'wait';
    while (step === 'wait') {
      await deps.waitForReady();
      if (!deps.alive()) return false;
      step = preflightDecision(deps.getState());
    }
    let resumed = false;
    if (step === 'signIn') {
      const live = await deps.hasSession();
      if (!deps.alive()) return false;
      if (live) {
        step = 'run';
        resumed = true;
      }
    }
    if (step === 'run') {
      // After a wait or a stale signed-out read, only idempotent kinds run by themselves.
      if ((waited || resumed) && decideAfterSignIn(kind, true) !== 'run') return true;
      await run({ resumed });
      return true;
    }
    const ok = await deps.requestSignIn(reason, intent);
    const after = decideAfterSignIn(kind, ok);
    if (after === 'cancel' || !deps.alive()) return false;
    if (after === 'run') await run({ resumed: true });
    return true;
  } finally {
    deps.pending.current = false;
  }
}

/**
 * Store Follow, given the follow state read on screen and (when resumed) the one re-read from
 * the server (null when that read failed):
 * - toggle: flip to `next` (a resumed follow only ever follows).
 * - keep: already following on the server; show it, toggle nothing.
 * - abort: the re-read failed; change nothing.
 */
export type FollowStep = { action: 'toggle'; next: boolean } | { action: 'keep' } | { action: 'abort' };

export function nextFollowState(resumed: boolean, following: boolean, serverIsFollowing: boolean | null): FollowStep {
  if (!resumed) return { action: 'toggle', next: !following };
  if (typeof serverIsFollowing !== 'boolean') return { action: 'abort' };
  if (serverIsFollowing) return { action: 'keep' };
  return { action: 'toggle', next: true };
}
