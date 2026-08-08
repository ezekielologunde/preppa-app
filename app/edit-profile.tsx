import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Platform, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useC } from '../src/theme/ThemeContext';
import { type, radius } from '../src/theme/theme';
import { useStore } from '../src/store/store';
import { Icon, Press, Btn } from '../src/ui';
import { Screen, TopBar, Dock, Empty } from '../src/ui/layout';
import { getMyProfile, updateProfile, uploadAvatar } from '../src/lib/supabase';

const DIETARY = ['Vegetarian', 'Vegan', 'Halal', 'Pescatarian', 'Gluten-free', 'Dairy-free', 'Nut-free', 'Keto'];

export default function EditProfile() {
  const c = useC();
  const router = useRouter();
  const { saveName, setAvatarUrl: setStoreAvatar, toast } = useStore();

  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [name, setName] = useState('');
  const [initialName, setInitialName] = useState('');
  const [bio, setBio] = useState('');
  const [location, setLocation] = useState('');
  const [dietary, setDietary] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const p = await getMyProfile();
        if (!p) { setSignedOut(true); return; }
        setName(p.displayName); setInitialName(p.displayName);
        setBio(p.bio); setLocation(p.location);
        setDietary(p.dietary); setAvatarUrl(p.avatarUrl);
      } catch {
        setSignedOut(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggleDiet = (d: string) => setDietary((xs) => (xs.includes(d) ? xs.filter((x) => x !== d) : [...xs, d]));

  const pickAvatar = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      toast('Photo upload is on the web app for now', 'info');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      setUploading(true);
      try {
        const url = await uploadAvatar(file, ext);
        setAvatarUrl(url);
        toast('Photo updated', 'check', true);
      } catch {
        toast('Couldn’t upload the photo. Please try again.', 'info');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const save = async () => {
    if (!name.trim()) { toast('Add your name', 'info'); return; }
    setSaving(true);
    try {
      if (name.trim() !== initialName.trim()) await saveName(name.trim());
      await updateProfile({ bio, location, dietary, avatarUrl });
      setStoreAvatar(avatarUrl); // hero reflects the new photo without waiting for a re-sync
      toast('Profile saved', 'check', true);
      router.back();
    } catch {
      toast('Couldn’t save your profile. Please try again.', 'x');
      setSaving(false);
    }
  };

  if (signedOut) {
    return (
      <Screen>
        <TopBar title="Edit profile" />
        <Empty icon="user" title="Sign in to edit your profile" body="Your name, photo and preferences are saved to your account." action={<Btn label="Go back" onPress={() => router.back()} />} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="Edit profile" />
      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 18 }}>
          {/* avatar */}
          <View style={{ alignItems: 'center', gap: 12 }}>
            <View style={{ width: 96, height: 96, borderRadius: 32, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: c.border }}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={{ width: 96, height: 96 }} resizeMode="cover" />
              ) : (
                <Text style={[type(34, 900), { color: c.soft }]}>{(name || '?').slice(0, 1).toUpperCase()}</Text>
              )}
            </View>
            <Press onPress={pickAvatar} label="Change profile photo">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 38, paddingHorizontal: 15, borderRadius: radius.pill, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface }}>
                {uploading ? <ActivityIndicator size="small" color={c.primary} /> : <Icon name="camera" size={15} color={c.ink} />}
                <Text style={[type(13.5, 800), { color: c.ink }]}>{avatarUrl ? 'Change photo' : 'Add photo'}</Text>
              </View>
            </Press>
          </View>

          <Field c={c} label="Name" value={name} onChange={setName} placeholder="Your name" autoComplete="name" textContentType="name" />
          <Field c={c} label="Bio" value={bio} onChange={setBio} placeholder="A line about you and your cooking" multiline />
          <Field c={c} label="Location" value={location} onChange={setLocation} placeholder="Neighborhood or city" autoComplete="postal-address-locality" />

          <View style={{ gap: 8 }}>
            <Text style={[type(12, 800), { color: c.soft }]}>Dietary preferences</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DIETARY.map((d) => {
                const on = dietary.includes(d);
                return (
                  <Press key={d} scale={0.96} onPress={() => toggleDiet(d)} label={`${on ? 'Remove' : 'Add'} ${d}`}>
                    <View style={{ height: 38, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1.5, borderColor: on ? c.primary : c.border, backgroundColor: on ? c.primaryL : c.surface, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={[type(13, 700), { color: on ? c.primaryD : c.soft }]}>{d}</Text>
                    </View>
                  </Press>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}
      {!loading ? (
        <Dock>
          <Btn label="Save profile" icon="check" block flex={1} loading={saving} onPress={save} />
        </Dock>
      ) : null}
    </Screen>
  );
}

function Field({ c, label, value, onChange, placeholder, multiline, autoComplete, textContentType }: { c: any; label: string; value: string; onChange: (t: string) => void; placeholder: string; multiline?: boolean; autoComplete?: any; textContentType?: any }) {
  const [f, setF] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text style={[type(12, 800), { color: c.soft }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        multiline={multiline}
        autoComplete={autoComplete}
        textContentType={textContentType}
        onFocus={() => setF(true)}
        onBlur={() => setF(false)}
        style={[type(15, 600), { color: c.ink, backgroundColor: f ? c.surface : c.bg2, borderWidth: 1.5, borderColor: f ? c.primary : 'transparent', borderRadius: 13, minHeight: multiline ? 88 : 50, paddingHorizontal: 15, paddingTop: multiline ? 13 : 0, textAlignVertical: multiline ? 'top' : 'center' }]}
      />
    </View>
  );
}
