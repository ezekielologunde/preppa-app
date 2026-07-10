import React from 'react';
import { ScrollView, View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useMeals } from '../src/data/hooks';
import { useStore } from '../src/store/store';
import { useC } from '../src/theme/ThemeContext';
import { Btn } from '../src/ui';
import { Screen, TopBar, Empty } from '../src/ui/layout';
import { MealGrid } from '../src/components/cards';

export default function Favorites() {
  const c = useC();
  const router = useRouter();
  const { fav } = useStore();
  const { data: allMeals, loading } = useMeals();
  const saved = (allMeals ?? []).filter((m) => fav.has(m.id));

  return (
    <Screen>
      <TopBar title="Favorites" sub={saved.length ? `${saved.length} saved` : undefined} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : saved.length === 0 ? (
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
