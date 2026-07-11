import React from 'react';
import { View, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, shadow } from '../src/theme/theme';
import { Icon, Press } from '../src/ui';
import { Screen } from '../src/ui/layout';
import { MealsBrowser } from '../src/components/MealsBrowser';

/** Full meal browser as a pushed route (deep-link target for ?cat= / ?goal=). The same
 *  browser also powers the Discover → Meals mode. */
export default function Explore() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cat, goal } = useLocalSearchParams<{ cat?: string; goal?: string }>();
  return (
    <Screen max={960}>
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 8, paddingBottom: 6, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Press scale={0.9} onPress={() => router.back()} label="Go back">
            <View style={[{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}>
              <Icon name="chevLeft" size={20} color={c.ink} />
            </View>
          </Press>
          <Text style={[type(24, 900), { color: c.ink, letterSpacing: -0.7, flex: 1 }]}>Explore meals</Text>
        </View>
      </View>
      <MealsBrowser initialCat={typeof cat === 'string' ? cat : undefined} initialGoal={typeof goal === 'string' ? goal : undefined} />
    </Screen>
  );
}
