// Guest empty state for the signed-in-only screens on web (docs/web-launch/SIGNIN-DESIGN.md, part C2).
//
// Web, once the account state is known and nobody is signed in: a short empty state with a Sign in
// button instead of the screen, so the screen's own loads never run for a guest. Everywhere else
// (native, web while the account is loading, signed in) the children render untouched.
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type } from '../theme/theme';
import { useStore } from '../store/store';
import { requestSignIn, type AuthReason } from '../lib/authRequest';
import { guestGateMode } from '../lib/guestGateLogic';
import { Btn, Icon } from '../ui';
import { Screen, TopBar } from '../ui/layout';

export interface GuestGateProps {
  /** Heading of the guest state, for example "Sign in to see your orders". */
  title: string;
  /** One short sentence under the heading. */
  body: string;
  /** Why the sheet opens; picks its title. Defaults to 'generic'. */
  reason?: AuthReason;
  /** Icon in the well above the heading. */
  icon?: string;
  /** Pushed screens pass their usual title so the guest state keeps the top bar and its back button. */
  screenTitle?: string;
  children: React.ReactNode;
}

export function GuestGate({ title, body, reason = 'generic', icon = 'lock', screenTitle, children }: GuestGateProps) {
  const { accountReady, signedIn } = useStore();
  const mode = guestGateMode({ isWeb: Platform.OS === 'web', accountReady, signedIn });
  if (mode !== 'guest') return <>{children}</>;
  const state = <GuestState title={title} body={body} reason={reason} icon={icon} />;
  if (!screenTitle) return state;
  return (
    <Screen>
      <TopBar title={screenTitle} />
      {state}
    </Screen>
  );
}

function GuestState({ title, body, reason, icon }: { title: string; body: string; reason: AuthReason; icon: string }) {
  const c = useC();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, backgroundColor: c.bg }}>
      <View style={{ width: 76, height: 76, borderRadius: 24, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={30} color={c.muted} />
      </View>
      <Text accessibilityRole="header" style={[type(18, 900), { color: c.ink, marginTop: 18, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type(14, 500), { color: c.soft, textAlign: 'center', maxWidth: 280, marginTop: 8, lineHeight: 21 }]}>{body}</Text>
      <View style={{ marginTop: 18 }}>
        <Btn label="Sign in" onPress={() => void requestSignIn(reason)} />
      </View>
    </View>
  );
}
