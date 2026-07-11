import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TextInput, Linking, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import type { ServiceType } from '../src/lib/supabase';
import { captureCurrentLocation, reverseNeighborhood } from '../src/lib/geo';
import { PhotoUploader, type PhotoRef } from '../src/components/PhotoUploader';
import { startConnectOnboarding, getMyKitchen } from '../src/lib/connect';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar } from '../src/ui/layout';
import { COOK_AGREEMENT, COOK_AGREEMENT_VERSION } from '../src/lib/cookAgreement';

const CUISINES = ['Italian', 'West African', 'Halal & Desi', 'Mexican', 'Soul food', 'Healthy & seafood', 'Caribbean', 'Baked goods', 'Vegan', 'BBQ', 'Other'];
const TRAVEL = ['5 miles', '10 miles', '15 miles', '25 miles', '50+ miles'];

// Where cooks can get a food-handler certificate. Requirements vary by state/locality —
// swap this for your launch region's accredited provider.
const FOOD_CERT_URL = 'https://www.statefoodsafety.com/food-handler';

const TITLES: Record<string, string> = {
  service: 'How you’ll cook', about: 'About you', kitchen: 'Your kitchen',
  homechef: 'Cooking at homes', foodsafety: 'Kitchen & food safety',
  story: 'Your cooking', agreement: 'Cook Agreement', review: 'Review',
};

export default function Apply() {
  const c = useC();
  const router = useRouter();
  const { name, submitApplication, toast, prepperStatus, coords } = useStore();

  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [types, setTypes] = useState<ServiceType[]>([]);
  const [legalName, setLegalName] = useState(name || '');
  const [phone, setPhone] = useState('');
  const [kitchenName, setKitchenName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [experience, setExperience] = useState('');
  const [fridge, setFridge] = useState(false);
  const [prep, setPrep] = useState(false);
  const [cert, setCert] = useState('');
  const [story, setStory] = useState('');
  const [agree, setAgree] = useState(false);
  const [fridgePhotos, setFridgePhotos] = useState<PhotoRef[]>([]);
  const [kitchenPhotos, setKitchenPhotos] = useState<PhotoRef[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [submittedKitchen, setSubmittedKitchen] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [myKitchenId, setMyKitchenId] = useState<string | null>(null);

  const meals = types.includes('meals');
  const homeChef = types.includes('home_chef');
  const STEPS = ['service', 'about', 'kitchen', ...(homeChef ? ['homechef'] : []), 'foodsafety', 'story', 'agreement', 'review'];
  const key = STEPS[Math.min(idx, STEPS.length - 1)];

  // Preload the neighborhood from the user's captured location (if any) the first
  // time they reach the kitchen step and haven't typed one.
  useEffect(() => {
    if (key !== 'kitchen' || neighborhood.trim() || !coords) return;
    let alive = true;
    reverseNeighborhood(coords.lat, coords.lng).then((n) => { if (alive && n) setNeighborhood(n); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // A pending applicant re-opening this screen can still start Stripe onboarding.
  useEffect(() => {
    if (prepperStatus === 'pending') getMyKitchen().then((k) => setMyKitchenId(k?.id ?? null)).catch(() => {});
  }, [prepperStatus]);

  // Detect the neighborhood on demand (captures location, then reverse-geocodes).
  const detectNeighborhood = async () => {
    if (detecting) return;
    setDetecting(true);
    try {
      const loc = await captureCurrentLocation();
      const n = await reverseNeighborhood(loc.lat, loc.lng);
      setNeighborhood(n || loc.label);
    } catch (e: any) {
      toast(e?.message || 'Couldn’t detect your location', 'info');
    } finally {
      setDetecting(false);
    }
  };

  // Just submitted → prompt Stripe Connect onboarding (verifies identity + sets up
  // payouts). Shown before the pending guard, since submit sets prepperStatus='pending'.
  if (submittedKitchen) {
    const onboard = async () => {
      setOnboarding(true);
      try {
        await startConnectOnboarding(submittedKitchen);
      } catch (e: any) {
        setOnboarding(false);
        toast(e?.message || 'Couldn’t start setup — you can finish it in My Hub.', 'info');
      }
    };
    return (
      <Screen bg={c.surface}>
        <TopBar title="Almost there" onBack={() => router.replace('/(tabs)/profile')} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 66, height: 66, borderRadius: 21, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name="card" size={30} color={c.primary} /></View>
          <Text style={[type(22, 900), { color: c.ink, marginTop: 16, textAlign: 'center', letterSpacing: -0.4 }]}>Verify your identity & set up payouts</Text>
          <Text style={[type(14, 500), { color: c.soft, textAlign: 'center', marginTop: 8, maxWidth: 330, lineHeight: 21 }]}>Preppa uses Stripe to confirm your identity and pay you. It’s quick and secure — you don’t need your own Stripe account.</Text>
          <View style={{ marginTop: 24, width: '100%', maxWidth: 360, gap: 10 }}>
            <Btn label="Verify & set up payouts" icon="card" block loading={onboarding} onPress={onboard} />
            <Btn label="Do this later in My Hub" variant="ghost" block onPress={() => router.replace('/(tabs)/profile')} />
          </View>
        </View>
      </Screen>
    );
  }

  if (prepperStatus === 'pending' || prepperStatus === 'approved') {
    return (
      <Screen>
        <TopBar title="Become a Preppa" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name={prepperStatus === 'approved' ? 'check' : 'clock'} size={30} color={c.primary} /></View>
          <Text style={[type(19, 900), { color: c.ink, marginTop: 16 }]}>{prepperStatus === 'approved' ? 'You’re already a Preppa' : 'Application under review'}</Text>
          <Text style={[type(14, 500), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300 }]}>{prepperStatus === 'approved' ? 'Manage your kitchen in My Hub.' : 'We’re reviewing your application. Finish identity + payout setup to speed it up.'}</Text>
          {prepperStatus === 'pending' && myKitchenId ? (
            <View style={{ marginTop: 18, width: '100%', maxWidth: 340 }}>
              <Btn label="Verify & set up payouts" icon="card" block loading={onboarding} onPress={async () => {
                setOnboarding(true);
                try { await startConnectOnboarding(myKitchenId); } catch (e: any) { setOnboarding(false); toast(e?.message || 'Couldn’t start setup — please try again.', 'info'); }
              }} />
            </View>
          ) : null}
          <View style={{ marginTop: 12 }}><Btn label="Back" variant="ghost" onPress={() => router.back()} /></View>
        </View>
      </Screen>
    );
  }

  const validate = (): string | null => {
    if (key === 'service' && types.length === 0) return 'Pick at least one way you’d like to cook.';
    if (key === 'about') {
      if (legalName.trim().length < 2) return 'Please enter your legal name.';
      if (phone.replace(/\D/g, '').length < 7) return 'Please enter a valid phone number.';
    }
    if (key === 'kitchen') {
      if (kitchenName.trim().length < 2) return meals ? 'Give your kitchen a name.' : 'Give your cooking a name.';
      if (!cuisine) return 'Pick your primary cuisine.';
      if (address.trim().length < 4) return 'Enter your address (private — only Preppa sees it).';
      if (neighborhood.trim().length < 2) return 'Enter the neighborhood buyers will see.';
    }
    if (key === 'homechef') {
      if (!serviceArea) return 'Pick how far you’ll travel.';
      if (experience.trim().length < 2) return 'Tell us a little about your experience.';
    }
    if (key === 'foodsafety') {
      if (meals && !fridge) return 'Please confirm your refrigeration.';
      if (!prep) return 'Please confirm clean prep & handling.';
      if (meals && fridgePhotos.length < 1) return 'Add at least one refrigeration photo.';
      if (meals && kitchenPhotos.length < 1) return 'Add at least one kitchen/stove photo.';
    }
    if (key === 'story' && story.trim().length < 2) return 'Tell us one line about your cooking.';
    if (key === 'agreement' && !agree) return 'Please read and agree to the Cook Agreement.';
    return null;
  };

  const next = () => {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    setIdx((i) => Math.min(i + 1, STEPS.length - 1));
  };
  const back = () => { setErr(null); idx === 0 ? router.back() : setIdx((i) => i - 1); };
  const goStep = (s: string) => { setErr(null); const i = STEPS.indexOf(s); if (i >= 0) setIdx(i); };
  const toggleType = (t: ServiceType) => setTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const kitchenId = await submitApplication({
        serviceTypes: types,
        legalName: legalName.trim(),
        phone: phone.trim(),
        kitchenName: kitchenName.trim(),
        cuisine,
        address: address.trim(),
        neighborhood: neighborhood.trim(),
        serviceArea: homeChef && serviceArea ? `Within ${serviceArea}` : undefined,
        experience: homeChef ? experience.trim() : undefined,
        // allergen disclosure is now accepted as part of the Cook Agreement (`agree`)
        foodSafety: {
          refrigeration: meals ? fridge : true, foodPrep: prep, allergens: agree, note: cert.trim() || undefined,
          docs: { fridge: fridgePhotos.map((p) => p.path), kitchen: kitchenPhotos.map((p) => p.path) },
        },
        foodHandlerCert: cert.trim() || undefined,
        story: story.trim(),
        agreementVersion: COOK_AGREEMENT_VERSION,
      });
      setBusy(false);
      toast('Application received', 'check', true);
      setSubmittedKitchen(kitchenId); // → identity + payout setup (Stripe Connect)
    } catch {
      setBusy(false);
      setErr('Couldn’t submit your application right now. Please check your details and try again.');
    }
  };

  return (
    <Screen>
      <TopBar title="Become a Preppa" sub={`Step ${idx + 1} of ${STEPS.length} · ${TITLES[key]}`} onBack={back} />
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
        {STEPS.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= idx ? c.primary : c.border }} />)}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
        {key === 'service' ? (
          <>
            <Head c={c} title="How you’ll cook" sub="You can do one or both — this shapes the rest of your application." />
            <Choice c={c} on={meals} onPress={() => toggleType('meals')} icon="chefhat" title="Sell homemade meals" body="Cook in your own kitchen; neighbors order and pick up or get delivery." />
            <Choice c={c} on={homeChef} onPress={() => toggleType('home_chef')} icon="home" title="Cook at people’s homes" body="Private-chef dinners and events — you cook in the host’s kitchen." />
          </>
        ) : null}

        {key === 'about' ? (
          <>
            <Head c={c} title="About you" sub="This stays private — it’s how we reach you and verify you’re real." />
            <Field c={c} label="Legal name" value={legalName} onChange={setLegalName} placeholder="Your full name" autoCapitalize="words" />
            <Field c={c} label="Phone number" value={phone} onChange={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" />
          </>
        ) : null}

        {key === 'kitchen' ? (
          <>
            <Head c={c} title={meals ? 'Your kitchen' : 'Your cooking'} sub="Buyers see your name and neighborhood. Your street address stays private." />
            <Field c={c} label={meals ? 'Kitchen name' : 'Your cook name / brand'} value={kitchenName} onChange={setKitchenName} placeholder={meals ? 'e.g. Amara’s Kitchen' : 'e.g. Chef Amara'} autoCapitalize="words" />
            <View>
              <Label c={c}>Primary cuisine</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {CUISINES.map((x) => {
                  const on = cuisine === x;
                  return (
                    <Press key={x} scale={0.95} onPress={() => setCuisine(x)}>
                      <View style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={[type(13.5, 700), { color: on ? '#fff' : c.soft }]}>{x}</Text>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </View>
            <Field c={c} label="Street address (private)" value={address} onChange={setAddress} placeholder="123 Main St, Apt 4" autoCapitalize="words" />
            <View>
              <Field c={c} label="Neighborhood (shown to buyers)" value={neighborhood} onChange={setNeighborhood} placeholder="e.g. Old Fourth Ward" autoCapitalize="words" />
              <Press scale={0.98} onPress={detectNeighborhood} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start' }}>
                  {detecting ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="pin" size={15} color={c.primary} />}
                  <Text style={[type(13, 800), { color: c.primary }]}>{detecting ? 'Detecting…' : 'Use my current location'}</Text>
                </View>
              </Press>
            </View>
          </>
        ) : null}

        {key === 'homechef' ? (
          <>
            <Head c={c} title="Cooking at homes" sub="For private-chef bookings — you’ll cook in the host’s kitchen." />
            <View>
              <Label c={c}>How far will you travel?</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TRAVEL.map((x) => {
                  const on = serviceArea === x;
                  return (
                    <Press key={x} scale={0.95} onPress={() => setServiceArea(x)}>
                      <View style={{ height: 38, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: on ? c.primary : c.bg2, borderWidth: 1, borderColor: on ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={[type(13.5, 700), { color: on ? '#fff' : c.soft }]}>{x}</Text>
                      </View>
                    </Press>
                  );
                })}
              </View>
            </View>
            <Field c={c} label="Your experience" value={experience} onChange={setExperience} placeholder="e.g. 6 years catering private dinners" autoCapitalize="sentences" multiline />
          </>
        ) : null}

        {key === 'foodsafety' ? (
          <>
            <Head c={c} title="Kitchen & food safety" sub={meals ? 'Show us where you cook and confirm the basics — we review every application.' : 'Confirm the basics — we review every application.'} />
            {meals ? <Attest c={c} on={fridge} onToggle={() => setFridge((v) => !v)} title="Refrigeration" body="I have adequate cold storage and keep cold food cold." /> : null}
            <Attest c={c} on={prep} onToggle={() => setPrep((v) => !v)} title="Clean prep & handling" body="Clean surfaces, handwashing, and no cross-contamination." />
            {meals ? (
              <>
                <PhotoUploader label="Refrigeration photos" hint="Inside your fridge/freezer showing cold storage." group="fridge" photos={fridgePhotos} onChange={setFridgePhotos} min={1} />
                <PhotoUploader label="Kitchen / stove area" hint="Your cooking area, stove and prep surfaces." group="kitchen" photos={kitchenPhotos} onChange={setKitchenPhotos} min={1} />
              </>
            ) : null}
            <Field c={c} label="Food-handler certificate # (optional)" value={cert} onChange={setCert} placeholder="If you have one" autoCapitalize="characters" />
            <Press scale={0.98} onPress={() => Linking.openURL(FOOD_CERT_URL).catch(() => toast('Couldn’t open the link', 'info'))}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: radius.md, backgroundColor: c.primaryL, borderWidth: 1, borderColor: c.primary }}>
                <Icon name="shield" size={18} color={c.primary} />
                <Text style={[type(12.5, 700), { color: c.primaryD, flex: 1, lineHeight: 18 }]}>Don’t have a food-handler card? Get certified online — requirements vary by area.</Text>
                <Icon name="chevRight" size={16} color={c.primary} />
              </View>
            </Press>
          </>
        ) : null}

        {key === 'story' ? (
          <>
            <Head c={c} title="Your cooking" sub="One line buyers will feel — what do you love to cook, or why cook for your neighbors?" />
            <Field c={c} label="What you love to cook" value={story} onChange={setStory} placeholder="e.g. Party-style jollof my grandmother taught me" autoCapitalize="sentences" multiline />
          </>
        ) : null}

        {key === 'agreement' ? (
          <>
            <Head c={c} title="Cook Agreement" sub="Please read and agree. This keeps buyers safe and makes clear you’re responsible for your food." />
            <View style={{ maxHeight: 300, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.bg2 }}>
              <ScrollView contentContainerStyle={{ padding: 14 }}>
                <Text style={[type(12.5, 500), { color: c.soft, lineHeight: 19 }]}>{COOK_AGREEMENT}</Text>
              </ScrollView>
            </View>
            <Attest c={c} on={agree} onToggle={() => setAgree((v) => !v)} title="I agree" body="I’ve read the Cook Agreement, accept responsibility for the food I sell, and will honestly disclose common allergens in my dishes." />
          </>
        ) : null}

        {key === 'review' ? (
          <>
            <Head c={c} title="Review & submit" sub="Tap any line to fix it. We personally review every cook and will reach out to finish setup." />
            <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, paddingHorizontal: 16, paddingVertical: 4 }}>
              <Row c={c} k="Doing" v={[meals ? 'Homemade meals' : null, homeChef ? 'Cook at homes' : null].filter(Boolean).join(' · ')} onEdit={() => goStep('service')} />
              <Row c={c} k="Name" v={legalName} onEdit={() => goStep('about')} />
              <Row c={c} k="Phone" v={phone} onEdit={() => goStep('about')} />
              <Row c={c} k={meals ? 'Kitchen' : 'Cook name'} v={kitchenName} onEdit={() => goStep('kitchen')} />
              <Row c={c} k="Cuisine" v={cuisine} onEdit={() => goStep('kitchen')} />
              <Row c={c} k="Neighborhood" v={neighborhood} onEdit={() => goStep('kitchen')} />
              {homeChef ? <Row c={c} k="Travels" v={serviceArea ? `Within ${serviceArea}` : ''} onEdit={() => goStep('homechef')} /> : null}
              {meals ? <Row c={c} k="Kitchen photos" v={`Fridge ${fridgePhotos.length} · Kitchen ${kitchenPhotos.length}`} onEdit={() => goStep('foodsafety')} /> : null}
              <Row c={c} k="Food safety" v={`${meals ? 'Refrigeration · ' : ''}Prep ✓`} onEdit={() => goStep('foodsafety')} />
              <Row c={c} k="Agreement" v={agree ? 'Accepted ✓' : 'Not yet'} onEdit={() => goStep('agreement')} />
            </View>
          </>
        ) : null}

        {err ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="info" size={16} color={c.red} />
            <Text style={[type(13, 700), { color: c.red, flex: 1 }]}>{err}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ padding: 16, paddingBottom: 22, ...shadow.soft, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border2 }}>
        {key !== 'review' ? (
          <Btn label="Continue" iconRight="arrow" block onPress={next} />
        ) : (
          <Btn label="Submit application" icon="check" block loading={busy} onPress={submit} />
        )}
      </View>
    </Screen>
  );
}

function Head({ c, title, sub }: { c: any; title: string; sub: string }) {
  return (
    <View style={{ marginBottom: 2 }}>
      <Text style={[type(22, 900), { color: c.ink, letterSpacing: -0.6 }]}>{title}</Text>
      <Text style={[type(14, 500), { color: c.soft, marginTop: 6, lineHeight: 20 }]}>{sub}</Text>
    </View>
  );
}
function Label({ c, children }: { c: any; children: React.ReactNode }) {
  return <Text style={[type(12.5, 800), { color: c.soft, marginBottom: 8 }]}>{children}</Text>;
}
function Field({ c, label, value, onChange, placeholder, keyboardType, autoCapitalize, multiline, autoComplete, textContentType }: { c: any; label: string; value: string; onChange: (t: string) => void; placeholder: string; keyboardType?: any; autoCapitalize?: any; multiline?: boolean; autoComplete?: any; textContentType?: any }) {
  const [f, setF] = useState(false);
  return (
    <View>
      <Label c={c}>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        multiline={multiline}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        style={[type(15.5, 600), { color: c.ink, backgroundColor: f ? c.surface : c.bg2, borderWidth: 1.5, borderColor: f ? c.primary : c.border, borderRadius: radius.md, minHeight: multiline ? 72 : 52, paddingHorizontal: 15, paddingTop: multiline ? 14 : 0 }]}
      />
    </View>
  );
}
function Choice({ c, on, onPress, icon, title, body }: { c: any; on: boolean; onPress: () => void; icon: string; title: string; body: string }) {
  return (
    <Press scale={0.99} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 15, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface }}>
        <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: on ? c.primary : c.bg2, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={20} color={on ? '#fff' : c.ink} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type(15.5, 800), { color: c.ink }]}>{title}</Text>
          <Text style={[type(12.5, 500), { color: c.soft, marginTop: 3, lineHeight: 18 }]}>{body}</Text>
        </View>
        <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          {on ? <Icon name="check" size={14} color="#fff" /> : null}
        </View>
      </View>
    </Press>
  );
}
function Attest({ c, on, onToggle, title, body }: { c: any; on: boolean; onToggle: () => void; title: string; body: string }) {
  return (
    <Press scale={0.99} onPress={onToggle}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface }}>
        <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          {on ? <Icon name="check" size={14} color="#fff" /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[type(14.5, 800), { color: c.ink }]}>{title}</Text>
          <Text style={[type(12.5, 500), { color: c.soft, marginTop: 2, lineHeight: 18 }]}>{body}</Text>
        </View>
      </View>
    </Press>
  );
}
function Row({ c, k, v, onEdit }: { c: any; k: string; v: string; onEdit?: () => void }) {
  return (
    <Press scale={0.99} onPress={onEdit} label={`Edit ${k}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <Text style={[type(13.5, 600), { color: c.muted }]}>{k}</Text>
        <Text numberOfLines={1} style={[type(13.5, 800), { color: c.ink, flex: 1, textAlign: 'right' }]}>{v || '—'}</Text>
        {onEdit ? <Icon name="chevRight" size={15} color={c.muted} /> : null}
      </View>
    </Press>
  );
}
