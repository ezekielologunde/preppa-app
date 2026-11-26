import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Auth } from './AuthForm';
import { Code } from './CodeForm';
import { Icon } from '../../ui/Icon';
import { useReducedMotion } from '../../ui/useReducedMotion';
import { useC } from '../../theme/ThemeContext';
import { type, radius } from '../../theme/theme';
import { WEB_PASSWORD_MIN, WEB_RESEND_COOLDOWN_SEC, consentModeFromFlag, webAuthError, webAuthNotice } from '../../lib/webAuth';
import { FIRST_STEP, SHEET_COPY, canDismiss, nextStep, type SheetEvent, type SheetStep } from '../../lib/authSheetLogic';

// The web sign-in sheet (SIGNIN-DESIGN.md, part B). Presentational: AuthSheetHost owns the
// controller, the intent and the store. Under 700px it is a bottom sheet, at 700px and wider a
// centred card (max 440px). It mirrors the Sheet in src/ui/overlay.tsx, which has no way to take a
// centred layout, a reduced-motion animation or a labelled dialog.

const TITLE_ID = 'auth-sheet-title';
const WIDE_MIN = 700;
const CARD_MAX = 440;
const CONSENT_MODE = consentModeFromFlag(process.env.EXPO_PUBLIC_CONSENT_CHECKBOX);

const VISUALLY_HIDDEN = { position: 'absolute' as const, width: 1, height: 1, overflow: 'hidden' as const, left: -10000, top: 0 };

type Focusable = { focus?: () => void };
type QueryRoot = { querySelector?: (sel: string) => Focusable | null };

function activeElement(): Focusable | null {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  return (document.activeElement as unknown as Focusable) ?? null;
}

function stillInDocument(el: Focusable): boolean {
  return typeof document !== 'undefined' && document.contains(el as unknown as Node);
}

export function AuthSheet({ visible, title, success, onDismiss, onAccountEmail, onSignedIn }: {
  visible: boolean;
  title: string;
  /** The host has seen the sign-in and is about to close: show the success state. */
  success: boolean;
  onDismiss: () => void;
  /** The email the user submitted, lowercased. The host derives the account key from it. */
  onAccountEmail: (email: string) => void;
  /** A form finished a sign-in (password, sign-up with a session, or a verified code). */
  onSignedIn: () => void;
}) {
  const c = useC();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_MIN;
  const [step, setStep] = useState<SheetStep>(FIRST_STEP);
  const [email, setEmail] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [announce, setAnnounce] = useState('');
  const cardRef = useRef<View>(null);
  const returnFocus = useRef<Focusable | null>(null);
  const shown: SheetStep = success ? 'success' : step;

  const go = (event: SheetEvent) => setStep((s) => nextStep(s, event));

  // Fresh state each time the sheet opens; remember the trigger and give it focus back on close.
  useLayoutEffect(() => {
    if (!visible) return;
    setStep(FIRST_STEP);
    setEmail('');
    setRecoveryPassword('');
    setConsentChecked(false);
    setAnnounce('');
    returnFocus.current = activeElement();
    return () => {
      const el = returnFocus.current;
      returnFocus.current = null;
      if (el && typeof el.focus === 'function' && stillInDocument(el)) el.focus();
    };
  }, [visible]);

  // Focus the first field of the step (the code form focuses its own input).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || shown === 'code' || shown === 'recover' || shown === 'success') return;
    const t = setTimeout(() => {
      const root = cardRef.current as unknown as QueryRoot | null;
      const field = root && typeof root.querySelector === 'function' ? root.querySelector('input') : null;
      if (field && typeof field.focus === 'function') field.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [visible, shown]);

  const dismissible = canDismiss(shown);
  const dismiss = () => { if (dismissible) onDismiss(); };

  // Every error the forms map also goes to the assertive live region; the timeout copy is kept.
  const mapError = (err: unknown, ctx?: 'auth' | 'code') => {
    const msg = webAuthError(err, ctx ?? 'auth');
    setAnnounce(msg);
    return msg;
  };
  const mapNotice = (err: unknown) => {
    const note = webAuthNotice(err);
    if (note) setAnnounce(note);
    return note;
  };
  const consent = { mode: CONSENT_MODE, checked: consentChecked, onChange: setConsentChecked };

  const onAuthNext = (addr: string, authed: boolean) => {
    setEmail(addr);
    setRecoveryPassword('');
    if (authed) { go('authed'); onSignedIn(); } else go('codeSent');
  };
  const onRecovery = (addr: string, newPassword: string) => {
    setEmail(addr);
    setRecoveryPassword(newPassword);
    go('recoverySent');
  };
  const onCodeNext = () => { setRecoveryPassword(''); go('verified'); onSignedIn(); };

  const linkStyle = [type(13.5, 700), { color: c.primary }];
  let body: React.ReactNode = null;
  if (shown === 'email' || shown === 'password' || shown === 'create') {
    const mode = shown === 'create' ? 'signup' : 'signin';
    // TODO: code-first on web (docs/web-launch/SIGNIN-DESIGN.md, decision 1) needs a new Auth prop; this opens on the password form.
    body = (
      <>
        <Auth
          key={mode}
          mode={mode}
          onNext={onAuthNext}
          onRecovery={onRecovery}
          passwordMin={WEB_PASSWORD_MIN}
          mapError={mapError}
          mapNotice={mapNotice}
          neutralRecovery
          consent={consent}
          onAccountEmail={onAccountEmail}
        />
        <Pressable onPress={() => go(mode === 'signup' ? 'signin' : 'create')} accessibilityRole="button" style={{ marginTop: 14, alignSelf: 'center' }}>
          <Text style={linkStyle}>{mode === 'signup' ? SHEET_COPY.signinInstead : SHEET_COPY.createInstead}</Text>
        </Pressable>
      </>
    );
  } else if (shown === 'code' || shown === 'recover') {
    body = (
      <Code
        key={shown}
        email={email}
        newPassword={shown === 'recover' && recoveryPassword ? recoveryPassword : undefined}
        onNext={onCodeNext}
        resendCooldownSec={WEB_RESEND_COOLDOWN_SEC}
        mapError={mapError}
      />
    );
  } else {
    body = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 28, justifyContent: 'center' }}>
        <Icon name="check" size={20} color={c.green} />
        <Text style={[type(16, 700), { color: c.ink }]}>{SHEET_COPY.success}</Text>
      </View>
    );
  }

  const cardStyle = wide
    ? { backgroundColor: c.surface, borderRadius: radius.xl, padding: 22, width: '100%' as const, maxWidth: CARD_MAX, maxHeight: '90%' as const, alignSelf: 'center' as const }
    : {
        backgroundColor: c.surface,
        borderTopLeftRadius: radius.sheet,
        borderTopRightRadius: radius.sheet,
        paddingTop: 10,
        paddingBottom: insets.bottom + 16,
        paddingHorizontal: 18,
        maxHeight: '92%' as const,
      };
  // react-native-web renders the Modal as role="dialog" aria-modal and passes these props to it.
  const dialogProps: object = Platform.OS === 'web' ? { 'aria-labelledby': TITLE_ID } : {};

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduced ? 'none' : wide ? 'fade' : 'slide'}
      statusBarTranslucent
      onRequestClose={dismiss}
      {...dialogProps}
    >
      {/* The scrim is a dismissible region, not a button, and it takes no focus: focus goes to the form. */}
      <Pressable
        onPress={dismiss}
        focusable={false}
        accessibilityLabel={SHEET_COPY.notNow}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: wide ? 'center' : 'flex-end', paddingHorizontal: wide ? 24 : 0 }}
      >
        <Pressable ref={cardRef} onPress={() => {}} focusable={false} accessibilityViewIsModal style={cardStyle}>
          {!wide ? <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.border, alignSelf: 'center', marginBottom: 12 }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text nativeID={TITLE_ID} accessibilityRole="header" style={[type(18, 700), { color: c.ink, letterSpacing: -0.3, flex: 1 }]}>{title}</Text>
            <Pressable onPress={dismiss} disabled={!dismissible} accessibilityRole="button" accessibilityState={{ disabled: !dismissible }} hitSlop={8}>
              <Text style={[type(14, 700), { color: dismissible ? c.soft : c.muted }]}>{SHEET_COPY.notNow}</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4, flexGrow: 1 }}>
            {body}
          </ScrollView>
          <View aria-live="assertive" style={VISUALLY_HIDDEN}>
            <Text>{announce}</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
