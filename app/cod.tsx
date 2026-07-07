import React, { useState } from 'react';
import { Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COOKS, CookId, money } from '../src/data/data';
import { useC } from '../src/theme/ThemeContext';
import { type } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Screen, TopBar } from '../src/ui/layout';
import { useTotals, Burst } from '../src/components/shared';
import { Handoff, genCode } from '../src/components/Handoff';

export default function COD() {
  const c = useC();
  const router = useRouter();
  const { cook: cookParam } = useLocalSearchParams<{ cook?: string }>();
  const ck = (cookParam || undefined) as CookId | undefined;
  const { cart, tip, mode, placeOrder } = useStore();
  const lines = ck ? cart.filter((l) => l.cook === ck) : cart;
  const t = useTotals(lines, tip, mode);
  const cook = COOKS[ck ?? cart[0]?.cook ?? 'maria']; // the order's cook
  const [code] = useState(genCode);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Screen bg={c.surface}>
        <Burst
          title="Handoff confirmed"
          body={<>You and {cook.name} both confirmed <Text style={{ fontFamily: type(15, 800).fontFamily }}>{money(t.total)}</Text> in cash. Enjoy your meal! 🍽️</>}
          actionLabel="View order"
          onAction={() => { placeOrder('cod', ck); router.replace(`/track?flow=cod&cook=${ck ?? ''}`); }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Cash handoff" sub="Order #PR-2048" />
      <Handoff mode="cod" cookName={cook.name} code={code} amount={t.total} onDone={() => setDone(true)} />
    </Screen>
  );
}
