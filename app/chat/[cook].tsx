import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { openThread } from '../../src/lib/messages';
import { isRejectedSeedKitchenRoute } from '../../src/lib/routePolicy';
import { useC } from '../../src/theme/ThemeContext';
import { type } from '../../src/theme/theme';
import { Btn } from '../../src/ui';
import { Screen, TopBar } from '../../src/ui/layout';
import { NotFound } from '../../src/components/NotFound';

/** Compatibility route for old links. Messaging now lives in /messages/[threadId]. */
export default function LegacyChatRedirect() {
  const c = useC();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook: string }>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const rejectedSeed = isRejectedSeedKitchenRoute(cook);
  const kitchenId = cook && !rejectedSeed ? cook : null;

  const connect = useCallback(async () => {
    if (!kitchenId) return;
    setError('');
    try {
      const threadId = await openThread(kitchenId, 'store');
      router.replace(`/messages/${threadId}`);
    } catch (e: any) {
      setError(/auth|session|sign in/i.test(String(e?.message))
        ? 'Sign in to message this kitchen.'
        : (e?.message || 'Could not open this conversation.'));
    }
  }, [router, kitchenId, attempt]);

  useEffect(() => { void connect(); }, [connect]);

  if (!kitchenId) return <NotFound title="Conversation" />;

  return (
    <Screen>
      <TopBar title="Messages" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }} accessibilityRole={error ? 'alert' : undefined}>
        {error ? (
          <>
            <Text style={[type(17, 900), { color: c.ink, textAlign: 'center' }]}>Couldn’t open messages</Text>
            <Text style={[type(14, 600), { color: c.soft, textAlign: 'center', lineHeight: 21, marginTop: 8, marginBottom: 18 }]}>{error}</Text>
            <Btn label="Try again" icon="repeat" onPress={() => setAttempt((value) => value + 1)} />
          </>
        ) : (
          <>
            <ActivityIndicator color={c.primary} />
            <Text style={[type(14, 700), { color: c.soft, marginTop: 12 }]}>Opening your conversation…</Text>
          </>
        )}
      </View>
    </Screen>
  );
}
