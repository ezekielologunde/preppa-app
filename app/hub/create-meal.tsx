import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, GradKey } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { createMeal, uploadMealPhoto, setMealPhoto, getMyKitchenId } from '../../src/lib/supabase';
import { MAJOR_ALLERGENS } from '../../src/lib/kitchenMeals';
import { invalidate } from '../../src/data/cache';
import { Stepper, Icon, Press } from '../../src/ui';
import { Screen, TopBar, Dock } from '../../src/ui/layout';
import { Burst } from '../../src/components/shared';
import { PhotoPick, KField, KInput, MoneyInput, KChoice, KBtn } from '../(tabs)/my-hub';

const CATS = ['Comfort', 'Pasta', 'Healthy', 'Soul food', 'Halal', 'Dessert', 'Seafood'];
const DIETS = ['Vegetarian', 'Gluten-free', 'Halal', 'Dairy-free', 'Nut-free'];
const ALLERGENS = MAJOR_ALLERGENS;

export default function CreateMealFlow() {
  const c = useC();
  const router = useRouter();
  const { toast, payoutsEnabled } = useStore();
  const [grad, setGrad] = useState<GradKey | null>(null);
  const [photoFile, setPhotoFile] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const pickPhoto = async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      (input as any).capture = 'environment';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return;
        setPhotoFile(f);
        setPhotoPreview(URL.createObjectURL(f)); // preview only; the public URL is saved
      };
      input.click();
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const blob = await (await fetch(asset.uri)).blob();
      setPhotoFile(blob);
      setPhotoPreview(asset.uri);
    } catch {
      toast('Couldn’t open or read that photo. Please try another.', 'info');
    }
  };
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [price, setPrice] = useState('');
  const [serves, setServes] = useState(2);
  const [cat, setCat] = useState('Comfort');
  const [diet, setDiet] = useState<string[]>([]);
  const [ingredients, setIngredients] = useState('');
  const [allergens, setAllergens] = useState<string[]>([]);
  const [allergenReviewed, setAllergenReviewed] = useState(false);
  const [done, setDone] = useState(false);
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const publishInFlight = useRef(false);
  const toggleD = (d: string) => setDiet((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]));
  const toggleAllergen = (a: string) => setAllergens((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const priceCents = Math.round(Number(price) * 100);
  const validPrice = Number.isSafeInteger(priceCents) && priceCents >= 100 && priceCents <= 100_000_000;
  const valid = name.trim().length >= 2 && name.trim().length <= 120 && desc.trim().length <= 2000 && validPrice && serves <= 100 && ingredients.trim().length >= 3 && ingredients.trim().length <= 5000 && allergenReviewed;
  const reason = name.trim().length < 2 ? 'Add a dish name with at least 2 characters'
    : name.trim().length > 120 ? 'Keep the dish name to 120 characters'
    : desc.trim().length > 2000 ? 'Keep the description to 2,000 characters'
    : !validPrice ? 'Enter a price from $1 to $1,000,000'
    : serves > 100 ? 'A meal can serve up to 100 people'
    : ingredients.trim().length < 3 ? 'List the ingredients customers should know about'
    : ingredients.trim().length > 5000 ? 'Keep the ingredient list to 5,000 characters'
    : 'Confirm you reviewed the allergen disclosure';
  const submit = async () => {
    if (publishInFlight.current) return;
    if (!valid) { toast(reason, 'info'); return; }
    publishInFlight.current = true;
    setBusy(true);
    try {
      const mealId = await createMeal({
        name: name.trim(),
        description: desc.trim() || undefined,
        priceCents,
        serves,
        tags: [cat, ...diet],
        grad: grad ?? undefined,
        ingredients: ingredients.trim(),
        allergens,
        allergenReviewed,
      });
      // Photo is a booster, not a blocker: upload best-effort, never fail the publish over it.
      if (photoFile) {
        try {
          const kid = await getMyKitchenId();
          if (!kid) throw new Error('Kitchen not found for photo upload.');
          const ext = ((photoFile as File).name?.split('.').pop() || (photoFile.type || '').split('/')[1] || 'jpg').toLowerCase();
          const url = await uploadMealPhoto(photoFile, ext, kid);
          await setMealPhoto(mealId, url);
        } catch {
          setPhotoUploadFailed(true);
          toast('Meal published, but the photo couldn’t be added', 'info');
        }
      }
      invalidate('catalog:live'); // new meal → refresh the cached catalog everywhere
      setDone(true);
    } catch (e: any) {
      toast(e?.message === 'no approved kitchen for this account' ? 'Your kitchen isn’t approved yet' : 'Couldn’t publish your meal — please try again', 'info');
    } finally { publishInFlight.current = false; setBusy(false); }
  };

  if (done) {
    return (
      <Screen bg={c.surface}>
        {payoutsEnabled ? (
          <Burst
            title={photoUploadFailed ? 'Meal published without photo' : 'Meal published'}
            body={photoUploadFailed
              ? `${name} is live and ready to order. The selected photo didn’t attach, so customers will see your fallback color for now.`
              : `${name} is now live on your menu. Customers near you can order it right away.`}
            actionLabel="Done"
            onAction={() => router.back()}
          />
        ) : (
          <Burst
            title="Saved as a draft"
            body={`${name} is saved to your menu but won't be visible to customers yet. Complete payout setup to publish it and start accepting paid orders.${photoUploadFailed ? ' The selected photo did not attach, so the fallback color will be used.' : ''}`}
            actionLabel="Set up payouts"
            onAction={() => router.replace('/hub/money')}
            secondaryLabel="Done for now"
            onSecondary={() => router.back()}
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen bg={c.surface}>
      <TopBar title="Add a meal" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ marginTop: 20 }}>
          <Text style={[type(12.5, 800), { color: c.soft, marginBottom: 8 }]}>Meal photo <Text style={[type(12.5, 600), { color: c.muted }]}>· optional, but dishes with photos sell more</Text></Text>
          {photoPreview ? (
            <View>
              <Image source={{ uri: photoPreview }} style={{ width: '100%', height: 190, borderRadius: radius.lg, backgroundColor: c.bg2 }} resizeMode="cover" />
              <Press scale={0.9} onPress={() => { setPhotoFile(null); setPhotoPreview(null); }} label="Remove photo" hitSlop={12} style={{ position: 'absolute', top: -8, right: -8 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#0E0E10', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={15} color="#fff" /></View>
              </Press>
              <Press scale={0.96} onPress={pickPhoto} label="Change photo" style={{ position: 'absolute', bottom: 10, right: 10 }}>
                <View style={{ paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: 'rgba(14,14,16,.72)', alignItems: 'center', justifyContent: 'center' }}><Text style={[type(12.5, 800), { color: '#fff' }]}>Change</Text></View>
              </Press>
            </View>
          ) : (
            <Press scale={0.98} onPress={pickPhoto} label="Add a meal photo">
              <View style={{ height: 150, borderRadius: radius.lg, borderWidth: 1.5, borderColor: c.border, borderStyle: 'dashed', backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="plus" size={24} color={c.primary} />
                <Text style={[type(13, 800), { color: c.soft }]}>Add a photo</Text>
                <Text style={[type(11.5, 500), { color: c.muted }]}>A clear, well-lit shot of the finished dish</Text>
              </View>
            </Press>
          )}
          <Text style={[type(12, 700), { color: c.soft, marginTop: 16, marginBottom: 8 }]}>Fallback color <Text style={[type(12, 500), { color: c.muted }]}>· shown until a photo is added</Text></Text>
          <PhotoPick grad={grad} setGrad={setGrad} />
        </View>
        <KField label="Dish name"><KInput value={name} onChange={setName} placeholder="e.g. Family Lasagna Tray" maxLength={120} /></KField>
        <KField label="Description" hint={`${desc.length}/2000`}><KInput value={desc} onChange={setDesc} placeholder="Layered fresh pasta, slow-simmered ragù, three cheeses…" multiline maxLength={2000} /></KField>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <KField label="Price"><MoneyInput value={price} onChange={setPrice} /></KField>
          </View>
          <View style={{ flex: 1 }}>
            <KField label="Serves">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50, paddingLeft: 14, paddingRight: 6, backgroundColor: c.bg2, borderRadius: 13 }}>
                <Text style={[type(15, 800), { color: c.ink }]}>{serves}</Text>
                <Stepper sm value={serves} onDec={() => setServes(Math.max(1, serves - 1))} onInc={() => setServes(Math.min(100, serves + 1))} />
              </View>
            </KField>
          </View>
        </View>
        <KField label="Category">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {CATS.map((x) => <KChoice key={x} label={x} on={cat === x} onPress={() => setCat(x)} />)}
          </View>
        </KField>
        <KField label="Dietary" hint="optional">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {DIETS.map((x) => <KChoice key={x} label={x} on={diet.includes(x)} onPress={() => toggleD(x)} check />)}
          </View>
        </KField>
        <KField label="Ingredients" hint={`required · ${ingredients.length}/5000`}>
          <KInput value={ingredients} onChange={setIngredients} placeholder="Chicken, rice, onion, garlic, olive oil, spices…" multiline accessibilityLabel="Ingredients" maxLength={5000} />
        </KField>
        <KField label="Contains allergens" hint="select every allergen that applies">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>
            {ALLERGENS.map((x) => <KChoice key={x} label={x} on={allergens.includes(x)} onPress={() => toggleAllergen(x)} check />)}
          </View>
        </KField>
        <Press
          scale={0.98}
          onPress={() => setAllergenReviewed((v) => !v)}
          role="checkbox"
          checked={allergenReviewed}
          label="I reviewed the full recipe and disclosed every applicable major allergen"
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, padding: 14, borderRadius: radius.md, backgroundColor: c.bg2, borderWidth: 1, borderColor: allergenReviewed ? c.primary : c.border }}>
            <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: allergenReviewed ? c.primary : c.border, backgroundColor: allergenReviewed ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{allergenReviewed ? <Icon name="check" size={13} color="#fff" /> : null}</View>
            <Text style={[type(12.5, 700), { color: c.soft, lineHeight: 18, flex: 1 }]}>I reviewed the full recipe and disclosed every applicable major allergen.</Text>
          </View>
        </Press>
      </ScrollView>
      <Dock>
        <KBtn label={busy ? 'Publishing…' : 'Publish meal'} variant="pri" block onPress={submit} style={{ opacity: valid && !busy ? 1 : 0.5 }} />
      </Dock>
    </Screen>
  );
}
