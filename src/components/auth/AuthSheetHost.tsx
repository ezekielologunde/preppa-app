import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { AuthSheet } from './AuthSheet';
import { useStore } from '../../store/store';
import { supabase } from '../../lib/supabase';
import { accountKeyForEmail } from '../../lib/webAuth';
import {
  SESSION_LOOKUP_MS,
  SUCCESS_FALLBACK_MS,
  SUCCESS_MS,
  isSameOpenRequest,
  isSignOutEvent,
  mayBindIntent,
  onSignedIn,
  outcomeResolves,
  routeChangeDismisses,
  sheetTitle,
} from '../../lib/authSheetLogic';
import {
  clearIntent,
  consumeIntent,
  dismissSignIn,
  getPendingIntent,
  getSignInState,
  resolveSignIn,
  saveIntent,
  subscribe,
  type SignInState,
} from '../../lib/authRequest';

// Web only: on native this renders null and runs nothing, so native onboarding is untouched.
export function AuthSheetHost() {
  if (Platform.OS !== 'web') return null;
  return <WebAuthSheetHost />;
}

/** Settles with `fallback` when `p` rejects or takes longer than `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

function sessionAccountKey(): Promise<string | null> {
  const lookup = supabase.auth.getSession().then(({ data }) => {
    const email = data.session?.user?.email;
    return typeof email === 'string' && email !== '' ? accountKeyForEmail(email) : null;
  });
  return withTimeout(lookup, SESSION_LOOKUP_MS, null);
}

function clearTimer(ref: { current: ReturnType<typeof setTimeout> | null }): void {
  if (ref.current !== null) clearTimeout(ref.current);
  ref.current = null;
}

function WebAuthSheetHost() {
  // A new state object per request (see isSameOpenRequest), so it doubles as the request identity.
  const sheet = useSyncExternalStore(subscribe, getSignInState, getSignInState);
  const pathname = usePathname();
  const { signedIn, reconcileAccount } = useStore();
  // The request the success state belongs to, so a later request never renders it, even for a frame.
  const [successFor, setSuccessFor] = useState<SignInState | null>(null);
  // Only the account key is kept, never the email, password, tokens or cart.
  const boundKey = useRef<string | null>(null);
  const emailSeq = useRef(0);
  const signedInAtOpen = useRef(false);
  const finishing = useRef(false);
  const alive = useRef(true);
  const openedPath = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One AuthSheet instance per request, so a request that opens as another closes starts fresh.
  const requestIds = useRef(new WeakMap<SignInState, number>());
  const nextRequestId = useRef(0);
  let requestId = requestIds.current.get(sheet);
  if (requestId === undefined) {
    requestId = ++nextRequestId.current;
    requestIds.current.set(sheet, requestId);
  }

  useEffect(() => {
    alive.current = true;
    return () => {
      // The host lives in the root layout, so this runs only when the app shell itself goes away
      // (a reload or an error boundary): settle false once and leave no stored intent.
      alive.current = false;
      emailSeq.current += 1;
      clearTimer(timer);
      clearIntent();
      dismissSignIn();
    };
  }, []);

  useEffect(() => {
    if (!sheet.open) return;
    boundKey.current = null;
    emailSeq.current += 1;
    signedInAtOpen.current = signedIn;
    finishing.current = false;
    openedPath.current = pathname;
    clearTimer(timer);
    setSuccessFor(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  /** Drops the success state of `opened` only, so a newer request keeps its own. */
  const resetSuccess = useCallback((opened: SignInState) => {
    if (alive.current) setSuccessFor((s) => (s === opened ? null : s));
  }, []);

  /** Settles the sign-in of `opened`, and only while it is still the open request. */
  const close = useCallback((opened: SignInState, ok: boolean) => {
    clearTimer(timer);
    resetSuccess(opened);
    if (!isSameOpenRequest(opened, getSignInState())) return;
    resolveSignIn(ok);
  }, [resetSuccess]);

  /** Closes the request without running the pending action: Not now, Back, a route change, sign-out. */
  const cancel = useCallback(() => {
    emailSeq.current += 1;
    clearTimer(timer);
    if (alive.current) setSuccessFor(null);
    clearIntent();
    dismissSignIn();
  }, []);

  const finish = useCallback(async () => {
    const opened = getSignInState();
    if (finishing.current || !opened.open) return;
    finishing.current = true;
    // A key lookup still in flight must not store the intent from here on.
    emailSeq.current += 1;
    if (alive.current) setSuccessFor(opened);
    // Never trap the user on the success step: close after SUCCESS_FALLBACK_MS whatever is pending.
    clearTimer(timer);
    timer.current = setTimeout(() => {
      timer.current = null;
      clearIntent();
      close(opened, outcomeResolves(onSignedIn({ boundKey: boundKey.current, sessionEmailKey: null })));
    }, SUCCESS_FALLBACK_MS);
    const sessionKey = await sessionAccountKey();
    if (!isSameOpenRequest(opened, getSignInState())) {
      clearIntent();
      resetSuccess(opened);
      return;
    }
    const outcome = onSignedIn({ boundKey: boundKey.current, sessionEmailKey: sessionKey });
    // Single use either way: the same-document closure resumes the action, so the stored copy goes.
    if (outcome === 'resume' && sessionKey) consumeIntent(sessionKey, Date.now());
    else clearIntent();
    // A different account signed in ('cancel'): the request resolves false and the action does not run.
    clearTimer(timer);
    timer.current = setTimeout(() => {
      timer.current = null;
      close(opened, outcomeResolves(outcome));
    }, SUCCESS_MS);
  }, [close, resetSuccess]);

  // The store saw a sign-in after the sheet opened (this form, or another tab sharing the session).
  useEffect(() => {
    if (sheet.open && signedIn && !signedInAtOpen.current) finish();
  }, [sheet, signedIn, finish]);

  // Browser Back or a route change leaves the screen that asked: the pending action must not run.
  useEffect(() => {
    if (routeChangeDismisses({ open: sheet.open, openedPath: openedPath.current, pathname })) cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, cancel]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => {
      if (getSignInState().open) cancel();
    };
    window.addEventListener('popstate', onPop);
    // Signed out anywhere (logout, token expiry, another tab): no intent may outlive the session.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (isSignOutEvent(event)) cancel();
    });
    return () => {
      window.removeEventListener('popstate', onPop);
      data.subscription.unsubscribe();
    };
  }, [cancel]);

  // A form finished a sign-in: refresh the account (accountReady, signedIn, orders) without waiting on it.
  const onFormSignedIn = useCallback(() => {
    reconcileAccount().catch(() => {});
    finish();
  }, [reconcileAccount, finish]);

  const onAccountEmail = useCallback((email: string) => {
    const seq = ++emailSeq.current;
    const opened = getSignInState();
    boundKey.current = null;
    // A copy saved under an earlier email no longer applies.
    clearIntent();
    const intent = getPendingIntent();
    if (!intent || !opened.open || finishing.current) return;
    accountKeyForEmail(email).then(
      (key) => {
        const current = getSignInState();
        if (!mayBindIntent({ callSeq: seq, currentSeq: emailSeq.current, captured: opened, current, finishing: finishing.current })) return;
        if (saveIntent(intent, key)) boundKey.current = key;
      },
      () => {
        // Fail closed: no key, no stored intent.
      },
    );
  }, []);

  const onDismiss = useCallback(() => {
    if (finishing.current) return;
    cancel();
  }, [cancel]);

  return (
    <AuthSheet
      key={requestId}
      visible={sheet.open}
      title={sheetTitle(sheet.reason)}
      success={isSameOpenRequest(successFor, sheet)}
      onDismiss={onDismiss}
      onAccountEmail={onAccountEmail}
      onSignedIn={onFormSignedIn}
    />
  );
}
