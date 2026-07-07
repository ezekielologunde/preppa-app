import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COOKS, CookId } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { Screen, TopBar } from '../src/ui/layout';
import { Burst } from '../src/components/shared';
import { Handoff, genCode, HandoffMode } from '../src/components/Handoff';

/** Prepaid pickup / delivery meetup handoff — the QR + 6-digit code confirms identity
 *  at the meetup (no cash). Reached from Track when an order is ready. */
export default function HandoffScreen() {
  const c = useC();
  const router = useRouter();
  const { mode: modeParam, cook } = useLocalSearchParams<{ mode?: string; cook?: string }>();
  const m: HandoffMode = modeParam === 'delivery' ? 'delivery' : 'pickup';
  const cd = COOKS[cook as CookId] ?? COOKS.maria;
  const [code] = useState(genCode);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Handoff confirmed"
          body={<>You and {cd.name} confirmed your {m === 'delivery' ? 'delivery' : 'pickup'}. Enjoy your meal! 🍽️</>}
          actionLabel="Back to order"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title={m === 'delivery' ? 'Delivery handoff' : 'Pickup handoff'} onBack={() => router.back()} />
      <Handoff mode={m} cookName={cd.name} code={code} onDone={() => setDone(true)} />
    </Screen>
  );
}
