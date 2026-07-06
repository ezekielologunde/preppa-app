import React from 'react';
import { useRouter } from 'expo-router';
import { Btn } from '../src/ui';
import { Screen, TopBar, Empty } from '../src/ui/layout';

export default function NotFound() {
  const router = useRouter();
  return (
    <Screen>
      <TopBar title="Not found" onBack={() => router.replace('/home')} />
      <Empty
        icon="search"
        title="This page doesn’t exist"
        body="The link may be broken or the page moved."
        action={<Btn label="Back to home" onPress={() => router.replace('/home')} />}
      />
    </Screen>
  );
}
