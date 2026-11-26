import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { AuthSheet } from './AuthSheet';
import { useStore } from '../../store/store';
import { supabase } from '../../lib/supabase';
import { accountKeyForEmail } from '../../lib/webAuth';
import { isSameOpenRequest, mayBindIntent, onSignedIn, sheetTitle, SUCCESS_MS } from '../../lib/authSheetLogic';
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

async function sessionAccountKey(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const email = data.session?.user?.email;
    return typeof email === 'string' && email !== '' ? await accountKeyForEmail(email) : null;
  } catch {
    return null;
  }
}

function WebAuthSheetHost() {
  // A new state object per request (see isSameOpenRequest), so it doubles as the request identity.
  const sheet = useSyncExternalStore(subscribe, getSignInState, getSignInState);
  const { signedIn, reconcileAccount } = useStore();
  const [success, setSuccess] = useState(false);
  // Only the account key is kept, never the email, password, tokens or cart.
  const boundKey = useRef<string | null>(null);
  const emailSeq = useRef(0);
  const signedInAtOpen = useRef(false);
  const finishing = useRef(false);
  const alive = useRef(true);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      // Unmount (route change, browser back): settle false once and leave no stored intent.
      alive.current = false;
      emailSeq.current += 1;
      if (successTimer.current !== null) clearTimeout(successTimer.current);
      successTimer.current = null;
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
    setSuccess(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet]);

  const finish = useCallback(async () => {
    const opened = getSignInState();
    if (finishing.current || !opened.open) return;
    finishing.current = true;
    // A key lookup still in flight must not store the intent from here on.
    emailSeq.current += 1;
    const sessionKey = await sessionAccountKey();
    if (!isSameOpenRequest(opened, getSignInState())) {
      clearIntent();
      return;
    }
    const decision = onSignedIn({ boundKey: boundKey.current, sessionEmailKey: sessionKey });
    // Single use either way: the same-document closure resumes the action, so the stored copy goes.
    if (decision === 'resume' && sessionKey) consumeIntent(sessionKey, Date.now());
    else clearIntent();
    if (!alive.current) return;
    setSuccess(true);
    successTimer.current = setTimeout(() => {
      successTimer.current = null;
      // Settle only the request this sign-in belongs to, never one opened since.
      if (!isSameOpenRequest(opened, getSignInState())) return;
      if (alive.current) setSuccess(false);
      resolveSignIn(true);
    }, SUCCESS_MS);
  }, []);

  // The store saw a sign-in after the sheet opened (this form, or another tab sharing the session).
  useEffect(() => {
    if (sheet.open && signedIn && !signedInAtOpen.current) finish();
  }, [sheet, signedIn, finish]);

  // A form finished a sign-in: refresh the account (accountReady, signedIn, orders), then close.
  const onFormSignedIn = useCallback(() => {
    reconcileAccount().catch(() => {}).then(() => finish());
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
    emailSeq.current += 1;
    clearIntent();
    dismissSignIn();
  }, []);

  return (
    <AuthSheet
      key={requestId}
      visible={sheet.open}
      title={sheetTitle(sheet.reason)}
      success={success}
      onDismiss={onDismiss}
      onAccountEmail={onAccountEmail}
      onSignedIn={onFormSignedIn}
    />
  );
}
