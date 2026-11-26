// Decisions for the web sign-in sheet host (docs/web-launch/SIGNIN-DESIGN.md, Loop 2 task 2.1, part B).
//
// Pure: no React, no React Native. AuthSheet and AuthSheetHost read these; the tests pin them.

import type { AuthReason } from './authRequest';

/** Sheet title per reason. Plain and warm, no em dashes. */
export const SHEET_TITLES: Readonly<Record<AuthReason, string>> = Object.freeze({
  checkout: 'Sign in to check out',
  book: 'Sign in to book',
  follow: 'Sign in to follow',
  save: 'Sign in to save',
  like: 'Sign in to like this',
  openThread: 'Sign in to message',
  connect: 'Sign in to finish setting up payouts',
  generic: 'Sign in to continue',
});

export const SHEET_COPY = Object.freeze({
  notNow: 'Not now',
  createInstead: 'New here? Create an account',
  signinInstead: 'Have an account? Sign in',
  success: 'You are signed in.',
});

/** How long the success state shows before the sheet closes. */
export const SUCCESS_MS = 600;

export function sheetTitle(reason: AuthReason | null | undefined): string {
  if (reason && Object.prototype.hasOwnProperty.call(SHEET_TITLES, reason)) return SHEET_TITLES[reason];
  return SHEET_TITLES.generic;
}

// ---------------------------------------------------------------------------------------------
// Steps

export type SheetStep = 'email' | 'code' | 'password' | 'create' | 'recover' | 'success';

export type SheetEvent =
  | 'codeSent' // a sign-in code was emailed
  | 'authed' // a password sign-in or sign-up returned a session
  | 'verified' // the 6-digit code (sign-in or recovery) was accepted
  | 'recoverySent' // a password recovery code was emailed
  | 'usePassword'
  | 'create'
  | 'signin';

export const FIRST_STEP: SheetStep = 'email';

const TRANSITIONS: Readonly<Record<SheetStep, Partial<Record<SheetEvent, SheetStep>>>> = {
  email: { codeSent: 'code', authed: 'success', recoverySent: 'recover', usePassword: 'password', create: 'create' },
  password: { codeSent: 'code', authed: 'success', recoverySent: 'recover', create: 'create', signin: 'email' },
  create: { codeSent: 'code', authed: 'success', signin: 'email' },
  code: { verified: 'success', signin: 'email' },
  recover: { verified: 'success', signin: 'email' },
  success: {},
};

/** The next step for an event; an event that does not apply leaves the step as it is. */
export function nextStep(step: SheetStep, event: SheetEvent): SheetStep {
  const row = TRANSITIONS[step];
  if (!row) return step;
  return row[event] ?? step;
}

/** The sheet may be dismissed on every step except success, which is already closing as a sign-in. */
export function canDismiss(step: SheetStep): boolean {
  return step !== 'success';
}

// ---------------------------------------------------------------------------------------------
// After sign-in

export type SignedInDecision = 'resume' | 'clear-and-continue';

/**
 * What to do with the stored intent once the store reports a sign-in. `boundKey` is the account
 * key the intent was saved under (null when no intent was saved); `sessionEmailKey` is the key of
 * the account that actually signed in (null when it could not be computed). Resume only when both
 * exist and match; otherwise the stored intent is cleared, but the sign-in still counts as success.
 */
export function onSignedIn(args: { boundKey: string | null; sessionEmailKey: string | null }): SignedInDecision {
  const { boundKey, sessionEmailKey } = args;
  if (typeof boundKey !== 'string' || boundKey === '') return 'clear-and-continue';
  if (typeof sessionEmailKey !== 'string' || sessionEmailKey === '') return 'clear-and-continue';
  return boundKey === sessionEmailKey ? 'resume' : 'clear-and-continue';
}

// ---------------------------------------------------------------------------------------------
// Stale callbacks

/**
 * The controller makes a fresh state object for every request it opens, so identity tells two
 * requests apart even when one closes and the next opens before the host re-renders. Work the host
 * started under `captured` (a key lookup, the success timer) may act only while that exact request
 * is still the open one.
 */
export function isSameOpenRequest(captured: { open: boolean } | null, current: { open: boolean }): boolean {
  return captured !== null && captured === current && current.open === true;
}

/**
 * Whether a finished account-key lookup may still store the intent: it must be the latest email
 * for the same open request, and the host must not already be finishing (which clears the intent).
 */
export function mayBindIntent(args: {
  callSeq: number;
  currentSeq: number;
  captured: { open: boolean } | null;
  current: { open: boolean };
  finishing: boolean;
}): boolean {
  if (args.finishing || args.callSeq !== args.currentSeq) return false;
  return isSameOpenRequest(args.captured, args.current);
}
