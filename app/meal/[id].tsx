import React, { useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mealPhotos, money, cookOf, type CookId } from '../../src/data/data';
import { useMeal, useKitchenReviews } from '../../src/data/hooks';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press, Stepper, Btn } from '../../src/ui';
import { Screen, Dock, DockTotal, SectionLabel } from '../../src/ui/layout';
import { CookRow, HeroTopBar, HeroBtn } from '../../src/components/shared';
import { NotFound } from '../../src/components/NotFound';
import { ImageViewer } from '../../src/components/ImageViewer';
import { MealGallery } from '../../src/components/MealGallery';
import { SectionHeader, ReviewsBlock } from '../../src/components/cards';
import { shareAndNotify, SITE } from '../../src/lib/share';

export default function MealDetail() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { fav, toggleFav, addToCart, toast, showFlash, isMine } = useStore();
  const { data: m, loading } = useMeal(id!);
  const [qty, setQty] = useState(1);
  const [viewer, setViewer] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);
  const { data: mealRevs } = useKitchenReviews(m?.kitchenUuid); // real kitchen reviews (empty → New)
  if (loading) return <Screen bg={c.surface}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View></Screen>;
  if (!m) return <NotFound title="Meal" />;
  const photos = mealPhotos(m);
  const cook = cookOf(m); // real kitchen identity for non-seed kitchens (not a seed fallback)
  const isSeedKitchen = !m.kitchenName; // real kitchens carry kitchenName; seeds don't
  const kitchenLink = isSeedKitchen ? m.cook : m.kitchenUuid; // route to the real kitchen by UUID
  const lineTotal = m.price * qty;
  const isFav = fav.has(m.id);

  const add = () => {
    addToCart({ key: m.id, name: m.name, cook: m.cook, price: m.price, grad: m.grad, img: m.img, mealUuid: m.mealUuid, kitchenUuid: m.kitchenUuid, kitchenName: m.kitchenName }, qty);
    showFlash({ name: m.name, grad: m.grad });
    router.back();
  };

  return (
    <Screen bg={c.surface}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <MealGallery photos={photos} grad={m.grad} onOpen={(i) => { setViewerIdx(i); setViewer(true); }}>
          <HeroTopBar topInset={insets.top} onBack={() => router.back()} right={
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <HeroBtn icon="share" label="Share this meal" onPress={() => shareAndNotify(toast, { title: m.name, url: `${SITE}/meal/${m.id}` })} />
              <HeroBtn icon={isFav ? 'heartFill' : 'heart'} label={isFav ? 'Remove from favorites' : 'Save to favorites'} color={isFav ? c.primary : undefined} onPress={() => toggleFav(m.id)} />
            </View>
          } />
          {m.match ? (
            <View pointerEvents="none" style={{ position: 'absolute', bottom: 38, left: 18, height: 24, borderRadius: radius.pill, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: c.green }}>
              <Icon name="check" size={11} color="#fff" />
              <Text style={[type(10, 900), { color: '#fff', textTransform: 'uppercase' }]}>Matches your taste</Text>
            </View>
          ) : null}
        </MealGallery>

        <View style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, marginTop: -18, padding: 18, paddingTop: 22 }}>
          <Text style={[type(23, 900), { color: c.ink, letterSpacing: -0.8, lineHeight: 27 }]}>{m.name}</Text>
          <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
            <Meta icon="star" text={mealRevs && mealRevs.count > 0 ? `${mealRevs.avg.toFixed(1)} (${mealRevs.count})` : 'New'} tone={c.ink} iconColor={c.star} />
            <Meta icon="clock" text={m.time} tone={c.soft} />
            <Meta icon="walk" text={m.dist} tone={c.soft} />
          </View>

          {isSeedKitchen ? (
            <CookRow cook={m.cook as CookId} meta={`${cook.cuisine} · PrepScore ${cook.prepscore} · ${cook.reviews} reviews`} />
          ) : (
            <CookRow name={cook.name} initial={cook.initial} meta={cook.cuisine} isPro={cook.isPro}
              onPress={() => kitchenLink && router.push(`/store/${kitchenLink}`)} />
          )}

          <SectionLabel>About this meal</SectionLabel>
          <Text style={[type(14.5, 500), { color: c.soft, lineHeight: 23 }]}>{m.desc}</Text>

          <SectionLabel>Ingredients & allergens</SectionLabel>
          <Text style={[type(13, 800), { color: c.ink, marginBottom: 5 }]}>Ingredients</Text>
          <Text style={[type(14, 500), { color: c.soft, lineHeight: 21 }]}>{m.ingredients || 'Ingredients have not been provided for this meal yet.'}</Text>
          <Text style={[type(13, 800), { color: c.ink, marginTop: 13, marginBottom: 5 }]}>Allergen disclosure</Text>
          <Text style={[type(14, 600), { color: m.allergenReviewed ? c.soft : c.red, lineHeight: 21 }]}>
            {m.allergenReviewed ? (m.allergens?.length ? `Contains: ${m.allergens.join(', ')}.` : 'The cook reviewed this recipe and declared no major allergens.') : 'This meal has not completed the allergen disclosure review. Contact the cook before ordering.'}
          </Text>
          <Text style={[type(11.5, 500), { color: c.muted, lineHeight: 17, marginTop: 8 }]}>Prepared in a home kitchen where cross-contact may occur. Ask the cook before ordering if you have a food allergy.</Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
            <Fact b={`${m.protein}g`} s="protein" />
            <Fact b={String(m.kcal)} s="calories" />
            <Fact b={`Serves ${m.serves}`} s="portion" />
          </View>

          <SectionLabel>Portion</SectionLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={[type(14.5, 700), { color: c.soft }]}>How many servings?</Text>
            <Stepper value={qty} onDec={() => setQty(Math.max(1, qty - 1))} onInc={() => setQty(qty + 1)} />
          </View>
        </View>

        <SectionHeader title="Reviews" />
        <ReviewsBlock kitchenId={m.kitchenUuid} />
      </ScrollView>

      <Dock>
        {isMine(m.cook, m.kitchenUuid) ? (
          <Btn label="Manage in My Hub" icon="chefhat" variant="ghost" block onPress={() => router.push('/hub/menu')} />
        ) : (
          <>
            <DockTotal label="Total" value={money(lineTotal)} />
            <Btn label="Add to bag" icon="bag" flex={1} onPress={add} />
          </>
        )}
      </Dock>
      <ImageViewer uri={photos[viewerIdx]} caption={m.name} visible={viewer} onClose={() => setViewer(false)} />
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
