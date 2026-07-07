import React from 'react';
import { useRouter } from 'expo-router';
import { Screen, TopBar, Empty } from '../ui/layout';
import { Btn } from '../ui';

/** Shared fallback for [param] routes hit with a stale/unknown id — a real screen
 *  with a back chevron + a guaranteed way home, instead of a blank dead-end. */
export function NotFound({ title = 'Not found', body = "This page isn’t available — it may have moved or sold out." }: { title?: string; body?: string }) {
  const router = useRouter();
  return (
    <Screen>
      <TopBar title={title} />
      <Empty
        icon="search"
        title="Nothing here"
        body={body}
        action={<Btn label="Go home" icon="home" onPress={() => router.replace('/home')} />}
      />
    </Screen>
  );
}
