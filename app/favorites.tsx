import React from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { MEALS } from '../src/data/data';
import { useStore } from '../src/store/store';
import { Btn } from '../src/ui';
import { Screen, TopBar, Empty } from '../src/ui/layout';
import { MealGrid } from '../src/components/cards';

export default function Favorites() {
  const router = useRouter();
  const { fav } = useStore();
  const saved = MEALS.filter((m) => fav.has(m.id));

  return (
    <Screen>
      <TopBar title="Favorites" sub={saved.length ? `${saved.length} saved` : undefined} />
      {saved.length === 0 ? (
        <Empty
          icon="heart"
          title="No favorites yet"
          body="Tap the heart on any meal to save it here for later."
          action={<Btn label="Browse meals" onPress={() => router.replace('/home')} />}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
          <MealGrid meals={saved} px={16} />
        </ScrollView>
      )}
    </Screen>
  );
}
