import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COOKS, CookId } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { Screen, TopBar } from '../src/ui/layout';
import { Burst } from '../src/components/shared';
import { Handoff, genCode } from '../src/components/Handoff';

/** Prepaid pickup/meetup handoff — the QR + 3-digit code confirms identity at the
 *  meetup (no cash). Pickup-only: prepaid delivery comes to your door and shows no
 *  code, and cash-on-delivery uses /cod. Reached from Track when an order is ready. */
export default function HandoffScreen() {
  const c = useC();
  const router = useRouter();
  const { cook } = useLocalSearchParams<{ cook?: string }>();
  const cd = COOKS[cook as CookId] ?? COOKS.maria;
  const [code] = useState(genCode);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Handoff confirmed"
          body={<>You and {cd.name} confirmed your pickup. Enjoy your meal! 🍽️</>}
          actionLabel="Back to order"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Pickup handoff" onBack={() => router.back()} />
      <Handoff mode="pickup" cookName={cd.name} code={code} onDone={() => setDone(true)} />
    </Screen>
  );
}
