import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { expById, COOKS, money } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox, Avatar, Btn } from '../../src/ui';
import { Screen, Dock, DockTotal, SectionLabel } from '../../src/ui/layout';
import { HeroTopBar, HeroBtn } from '../../src/components/shared';
import { NotFound } from '../../src/components/NotFound';

export default function ExperienceDetail() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { toast } = useStore();
  const e = expById(id!);
  if (!e) return <NotFound title="Experience" />;
  const cook = COOKS[e.cook];
  const includes = ['All ingredients & equipment', 'Hands-on guidance from your host', 'A full meal to enjoy', 'Recipes to take home'];

  const reserve = () => {
    toast(`Seat reserved for ${e.title} ✨`, 'check', true);
    router.back();
  };

  return (
    <Screen bg={c.surface}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <GradBox grad={e.grad} style={{ height: 280 }}>
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} right={
            <HeroBtn icon="share" onPress={() => toast('Share — demo', 'share')} />
          } />
          <View style={{ position: 'absolute', bottom: 38, left: 18, height: 24, borderRadius: radius.pill, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: c.purple }}>
            <Icon name={e.ico} size={11} color="#fff" />
            <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase', letterSpacing: 0.3 }]}>{e.tag}</Text>
          </View>
        </GradBox>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -26, padding: 18, paddingTop: 22 }}>
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, lineHeight: 27 }]}>{e.title}</Text>
          <View style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="calendar" size={15} color={c.primary} />
              <Text style={[type(13.5, 700), { color: c.ink }]}>{e.when}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="users" size={15} color={c.soft} />
              <Text style={[type(13.5, 700), { color: c.soft }]}>{e.spots}</Text>
            </View>
          </View>

          <Press scale={0.98} onPress={() => router.push(`/store/${e.cook}`)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18, padding: 13, borderRadius: radius.lg, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border }}>
              <Avatar cook={e.cook} size={46} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[type(15, 900), { color: c.ink }]}>Hosted by {cook.name}</Text>
                  <Icon name="shield" size={15} color={c.green} />
                </View>
                <Text style={[type(12, 600), { color: c.soft, marginTop: 2 }]}>{cook.cuisine} · PrepScore {cook.prepscore}</Text>
              </View>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="chevRight" size={16} color={c.soft} />
              </View>
            </View>
          </Press>

          <SectionLabel>About this experience</SectionLabel>
          <Text style={[type(14.5, 500), { color: c.soft, lineHeight: 23 }]}>{e.sub}. Join {cook.name} for an intimate, hands-on evening — small group, big flavor, and a story behind every dish. Hosted in a verified home kitchen.</Text>

          <SectionLabel>What’s included</SectionLabel>
          {includes.map((it, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="check" size={14} color="#fff" />
              </View>
              <Text style={[type(14.5, 700), { color: c.ink, flex: 1 }]}>{it}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <Dock>
        <DockTotal label="Per seat" value={money(e.price)} />
        <Btn label="Reserve a seat" icon="ticket" flex={1} onPress={reserve} />
      </Dock>
    </Screen>
  );
}
