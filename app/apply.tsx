import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius, shadow } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar } from '../src/ui/layout';
import { COOK_AGREEMENT, COOK_AGREEMENT_VERSION } from '../src/lib/cookAgreement';

const CUISINES = ['Italian', 'West African', 'Halal & Desi', 'Mexican', 'Soul food', 'Healthy & seafood', 'Caribbean', 'Baked goods', 'Vegan', 'BBQ', 'Other'];

const STEP_TITLES = ['About you', 'Your kitchen', 'Food safety', 'Your cooking', 'Cook Agreement', 'Review'];

export default function Apply() {
  const c = useC();
  const router = useRouter();
  const { name, submitApplication, toast, prepperStatus } = useStore();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // fields
  const [legalName, setLegalName] = useState(name || '');
  const [phone, setPhone] = useState('');
  const [kitchenName, setKitchenName] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [address, setAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [fridge, setFridge] = useState(false);
  const [prep, setPrep] = useState(false);
  const [allergens, setAllergens] = useState(false);
  const [cert, setCert] = useState('');
  const [story, setStory] = useState('');
  const [agree, setAgree] = useState(false);

  if (prepperStatus === 'pending' || prepperStatus === 'approved') {
    return (
      <Screen>
        <TopBar title="Become a Preppa" onBack={() => router.back()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}><Icon name={prepperStatus === 'approved' ? 'check' : 'clock'} size={30} color={c.primary} /></View>
          <Text style={[type(19, 900), { color: c.ink, marginTop: 16 }]}>{prepperStatus === 'approved' ? 'You’re already a Preppa' : 'Application under review'}</Text>
          <Text style={[type(14, 500), { color: c.soft, textAlign: 'center', marginTop: 6, maxWidth: 300 }]}>{prepperStatus === 'approved' ? 'Manage your kitchen in My Hub.' : 'We’re reviewing your application and will reach out soon.'}</Text>
          <View style={{ marginTop: 20 }}><Btn label="Back" variant="ghost" onPress={() => router.back()} /></View>
        </View>
      </Screen>
    );
  }

  const validate = (): string | null => {
    if (step === 0) {
      if (legalName.trim().length < 2) return 'Please enter your legal name.';
      if (phone.replace(/\D/g, '').length < 7) return 'Please enter a valid phone number.';
    }
    if (step === 1) {
      if (kitchenName.trim().length < 2) return 'Give your kitchen a name.';
      if (!cuisine) return 'Pick your primary cuisine.';
      if (address.trim().length < 4) return 'Enter your street address (private — only Preppa sees it).';
      if (neighborhood.trim().length < 2) return 'Enter the neighborhood buyers will see.';
    }
    if (step === 2) {
      if (!fridge || !prep || !allergens) return 'Please confirm each food-safety item to continue.';
    }
    if (step === 3) {
      if (story.trim().length < 2) return 'Tell us one line about your cooking.';
    }
    if (step === 4) {
      if (!agree) return 'Please read and agree to the Cook Agreement.';
    }
    return null;
  };

  const next = () => {
    const v = validate();
    if (v) { setErr(v); return; }
    setErr(null);
    setStep((s) => Math.min(s + 1, 5));
  };
  const back = () => { setErr(null); step === 0 ? router.back() : setStep((s) => s - 1); };

  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      await submitApplication({
        legalName: legalName.trim(),
        phone: phone.trim(),
        kitchenName: kitchenName.trim(),
        cuisine,
        address: address.trim(),
        neighborhood: neighborhood.trim(),
        foodSafety: { refrigeration: fridge, foodPrep: prep, allergens, note: cert.trim() || undefined },
        foodHandlerCert: cert.trim() || undefined,
        story: story.trim(),
        agreementVersion: COOK_AGREEMENT_VERSION,
      });
      toast('Application received — we’ll be in touch', 'check', true);
      router.replace('/(tabs)/profile');
    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || 'Couldn’t submit your application. Please try again.');
    }
  };

  return (
    <Screen>
      <TopBar title="Become a Preppa" sub={`Step ${step + 1} of 6 · ${STEP_TITLES[step]}`} onBack={back} />
      {/* progress */}
      <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
        {STEP_TITLES.map((_, i) => <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.primary : c.border }} />)}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }} keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <>
            <Head c={c} title="About you" sub="This stays private — it’s how we reach you and verify you’re real." />
            <Field c={c} label="Legal name" value={legalName} onChange={setLegalName} placeholder="Your full name" autoCapitalize="words" />
            <Field c={c} label="Phone number" value={phone} onChange={setPhone} placeholder="(555) 123-4567" keyboardType="phone-pad" />
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Head c={c} title="Your kitchen" sub="Buyers see your kitchen name and neighborhood. Your street address stays private." />
            <Field c={c} label="Kitchen name" value={kitchenName} onChange={setKitchenName} placeholder="e.g. Amara’s Kitchen" autoCapitalize="words" />
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
            <Field c={c} label="Neighborhood (shown to buyers)" value={neighborhood} onChange={setNeighborhood} placeholder="e.g. Old Fourth Ward" autoCapitalize="words" />
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Head c={c} title="Food safety" sub="You’re the cook and you’re responsible for your food. Confirm the basics — we review every kitchen." />
            <Attest c={c} on={fridge} onToggle={() => setFridge((v) => !v)} title="Refrigeration" body="I have adequate cold storage and keep cold food cold." />
            <Attest c={c} on={prep} onToggle={() => setPrep((v) => !v)} title="Clean prep & handling" body="Clean surfaces, handwashing, and no cross-contamination." />
            <Attest c={c} on={allergens} onToggle={() => setAllergens((v) => !v)} title="Allergen honesty" body="I’ll disclose common allergens in my dishes on request." />
            <Field c={c} label="Food-handler certificate # (optional)" value={cert} onChange={setCert} placeholder="If you have one" autoCapitalize="characters" />
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Head c={c} title="Your cooking" sub="One line buyers will feel — what do you love to cook, or why cook for your neighbors?" />
            <Field c={c} label="What you love to cook" value={story} onChange={setStory} placeholder="e.g. Party-style jollof my grandmother taught me" autoCapitalize="sentences" multiline />
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Head c={c} title="Cook Agreement" sub="Please read and agree. This keeps buyers safe and makes clear you’re responsible for your food." />
            <View style={{ maxHeight: 300, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, backgroundColor: c.bg2 }}>
              <ScrollView contentContainerStyle={{ padding: 14 }}>
                <Text style={[type(12.5, 500), { color: c.soft, lineHeight: 19 }]}>{COOK_AGREEMENT}</Text>
              </ScrollView>
            </View>
            <Attest c={c} on={agree} onToggle={() => setAgree((v) => !v)} title="I agree" body="I’ve read the Cook Agreement and accept responsibility for the food I sell." />
          </>
        ) : null}

        {step === 5 ? (
          <>
            <Head c={c} title="Review & submit" sub="We personally review every cook and will reach out to finish setup." />
            <View style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, padding: 16, gap: 10 }}>
              <Row c={c} k="Name" v={legalName} />
              <Row c={c} k="Phone" v={phone} />
              <Row c={c} k="Kitchen" v={kitchenName} />
              <Row c={c} k="Cuisine" v={cuisine} />
              <Row c={c} k="Neighborhood" v={neighborhood} />
              <Row c={c} k="Food safety" v="Refrigeration · Prep · Allergens ✓" />
              <Row c={c} k="Agreement" v="Accepted ✓" />
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
        {step < 5 ? (
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
function Field({ c, label, value, onChange, placeholder, keyboardType, autoCapitalize, multiline }: { c: any; label: string; value: string; onChange: (t: string) => void; placeholder: string; keyboardType?: any; autoCapitalize?: any; multiline?: boolean }) {
  const [f, setF] = useState(false);
  return (
    <View>
      <Label c={c}>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        style={[type(15.5, 600), { color: c.ink, backgroundColor: f ? c.surface : c.bg2, borderWidth: 1.5, borderColor: f ? c.primary : c.border, borderRadius: radius.md, minHeight: multiline ? 72 : 52, paddingHorizontal: 15, paddingTop: multiline ? 14 : 0 }]}
      />
    </View>
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
function Row({ c, k, v }: { c: any; k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[type(13.5, 600), { color: c.muted }]}>{k}</Text>
      <Text numberOfLines={1} style={[type(13.5, 800), { color: c.ink, flex: 1, textAlign: 'right' }]}>{v}</Text>
    </View>
  );
}
