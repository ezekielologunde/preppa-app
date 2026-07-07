import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mealById, COOKS, ADDONS, money } from '../../src/data/data';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, GradBox, Stepper, Btn } from '../../src/ui';
import { Screen, Dock, DockTotal, SectionLabel } from '../../src/ui/layout';
import { CookRow, HeroTopBar, HeroBtn } from '../../src/components/shared';
import { NotFound } from '../../src/components/NotFound';
import { ImageViewer } from '../../src/components/ImageViewer';
import { SectionHeader, ReviewsBlock } from '../../src/components/cards';
import { shareAndNotify, SITE } from '../../src/lib/share';

export default function MealDetail() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fav, toggleFav, addToCart, toast, showFlash, isMine } = useStore();
  const m = mealById(id!);
  const [qty, setQty] = useState(1);
  const [adds, setAdds] = useState<string[]>([]);
  const [viewer, setViewer] = useState(false);
  if (!m) return <NotFound title="Meal" />;
  const cook = COOKS[m.cook];
  const toggleAdd = (k: string) => setAdds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const addPrice = adds.reduce((s, k) => s + ADDONS.find((a) => a.key === k)!.price, 0);
  const lineTotal = m.price * qty + addPrice;
  const isFav = fav.has(m.id);

  const add = () => {
    addToCart({ key: m.id, name: m.name, cook: m.cook, price: m.price, grad: m.grad }, qty);
    adds.forEach((k) => { const a = ADDONS.find((x) => x.key === k)!; addToCart(a, 1); });
    showFlash({ name: m.name, grad: m.grad });
    router.back();
  };

  return (
    <Screen bg={c.surface}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <GradBox grad={m.grad} img={m.img} style={{ height: 280 }}>
          {m.img ? <Pressable onPress={() => setViewer(true)} accessibilityLabel={`View photo of ${m.name}`} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} right={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <HeroBtn icon="share" onPress={() => shareAndNotify(toast, { title: m.name, url: `${SITE}/meal/${m.id}` })} />
              <HeroBtn icon={isFav ? 'heartFill' : 'heart'} color={isFav ? c.primary : c.ink} onPress={() => toggleFav(m.id)} />
            </View>
          } />
          {m.img ? (
            <View pointerEvents="none" style={{ position: 'absolute', bottom: 34, right: 16, height: 32, paddingHorizontal: 11, borderRadius: 16, backgroundColor: 'rgba(0,0,0,.45)', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Icon name="search" size={14} color="#fff" />
              <Text style={[type(12, 800), { color: '#fff' }]}>View photo</Text>
            </View>
          ) : null}
          {m.match ? (
            <View pointerEvents="none" style={{ position: 'absolute', bottom: 38, left: 18, height: 24, borderRadius: radius.pill, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.green }}>
              <Icon name="check" size={11} color="#fff" />
              <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase' }]}>Matches your taste</Text>
            </View>
          ) : null}
        </GradBox>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -26, padding: 18, paddingTop: 22 }}>
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, lineHeight: 27 }]}>{m.name}</Text>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
            <Meta icon="star" text={`${m.rating} (${m.reviews})`} tone={c.ink} iconColor={c.star} />
            <Meta icon="clock" text={m.time} tone={c.soft} />
            <Meta icon="walk" text={m.dist} tone={c.soft} />
          </View>

          <CookRow cook={m.cook} meta={`${cook.cuisine} · PrepScore ${cook.prepscore} · ${cook.reviews} reviews`} />

          <SectionLabel>About this meal</SectionLabel>
          <Text style={[type(14.5, 500), { color: c.soft, lineHeight: 23 }]}>{m.desc}</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Fact b={`${m.protein}g`} s="protein" />
            <Fact b={String(m.kcal)} s="calories" />
            <Fact b={`Serves ${m.serves}`} s="portion" />
          </View>

          <SectionLabel>Make it a meal</SectionLabel>
          {ADDONS.map((a) => {
            const on = adds.includes(a.key);
            return (
              <Press key={a.key} scale={0.99} onPress={() => toggleAdd(a.key)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on ? <Icon name="check" size={14} color="#fff" /> : null}</View>
                  <Text style={[type(14.5, 700), { color: c.ink, flex: 1 }]}>{a.name}</Text>
                  <Text style={[type(13, 800), { color: c.soft }]}>+{money(a.price)}</Text>
                </View>
              </Press>
            );
          })}

          <SectionLabel>Portion</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[type(14.5, 700), { color: c.soft }]}>How many servings?</Text>
            <Stepper value={qty} onDec={() => setQty(Math.max(1, qty - 1))} onInc={() => setQty(qty + 1)} />
          </View>
        </View>

        <SectionHeader title="Reviews" />
        <ReviewsBlock rating={m.rating} count={m.reviews} />
      </ScrollView>

      <Dock>
        {isMine(m.cook) ? (
          <Btn label="Manage in My Hub" icon="chefhat" variant="ghost" block onPress={() => router.push('/hub/menu')} />
        ) : (
          <>
            <DockTotal label="Total" value={money(lineTotal)} />
            <Btn label="Add to cart" icon="cart" flex={1} onPress={add} />
          </>
        )}
      </Dock>
      <ImageViewer uri={m.img} caption={m.name} visible={viewer} onClose={() => setViewer(false)} />
    </Screen>
  );
}

function Meta({ icon, text, tone, iconColor }: { icon: string; text: string; tone: string; iconColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Icon name={icon} size={15} color={iconColor ?? tone} />
      <Text style={[type(13, 700), { color: tone }]}>{text}</Text>
    </View>
  );
}
function Fact({ b, s }: { b: string; s: string }) {
  const c = useC();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: 12, alignItems: 'center' }}>
      <Text style={[type(16, 900), { color: c.ink }]}>{b}</Text>
      <Text style={[type(11, 700), { color: c.muted, marginTop: 2 }]}>{s}</Text>
    </View>
  );
}
