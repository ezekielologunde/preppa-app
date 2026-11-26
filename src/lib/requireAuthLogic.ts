// Decisions for useRequireAuth (docs/web-launch/SIGNIN-DESIGN.md, Loop 2 task 2.1, part C).
//
// Pure: no React, no React Native. The hook reads these; tests/useRequireAuth.test.ts pins them.

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
