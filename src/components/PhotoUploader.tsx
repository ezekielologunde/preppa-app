import React, { useState } from 'react';
import { View, Text, Image, Platform, ActivityIndicator } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, radius } from '../theme/theme';
import { Icon, Press } from '../ui';
import { uploadCookPhoto } from '../lib/supabase';

export interface PhotoRef { path: string; preview: string }

/**
 * Multi-image uploader for cook verification (Gov ID, refrigeration, kitchen). Web-only
 * capture (browser file picker + camera on mobile web). Each file uploads to the private
 * cook-docs bucket via uploadCookPhoto(group) and shows an instant local preview; the
 * caller keeps the returned paths and submits them in the application.
 */
export function PhotoUploader({ label, hint, group, photos, onChange, min = 0 }: {
  label: string;
  hint?: string;
  group: string;
  photos: PhotoRef[];
  onChange: (next: PhotoRef[]) => void;
  min?: number;
}) {
  const c = useC();
  const [busy, setBusy] = useState(false);
  const met = photos.length >= min;

  const pick = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    (input as any).capture = 'environment';
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      setBusy(true);
      const added: PhotoRef[] = [];
      for (const f of files) {
        try {
          const path = await uploadCookPhoto(f, group);
          added.push({ path, preview: URL.createObjectURL(f) });
        } catch {
          /* skip a file that failed to upload */
        }
      }
      setBusy(false);
      if (added.length) onChange([...photos, ...added]);
    };
    input.click();
  };

  const remove = (path: string) => onChange(photos.filter((p) => p.path !== path));

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={[type(12.5, 800), { color: c.soft }]}>{label}</Text>
        {min > 0 ? (
          <Text style={[type(11.5, 800), { color: met ? c.green : c.muted }]}>{photos.length}/{min} {met ? '✓' : 'min'}</Text>
        ) : null}
      </View>
      {hint ? <Text style={[type(12, 500), { color: c.muted, marginBottom: 8 }]}>{hint}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {photos.map((p) => (
          <View key={p.path} style={{ width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border }}>
            <Image source={{ uri: p.preview }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            <Press scale={0.9} onPress={() => remove(p.path)} label="Remove photo" hitSlop={6} style={{ position: 'absolute', top: 3, right: 3 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={13} color="#fff" />
              </View>
            </Press>
          </View>
        ))}
        <Press scale={0.96} onPress={busy ? undefined : pick} label={`Add ${label}`}>
          <View style={{ width: 84, height: 84, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.border, borderStyle: 'dashed', backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
            {busy ? <ActivityIndicator size="small" color={c.primary} /> : (
              <>
                <Icon name="plus" size={20} color={c.primary} />
                <Text style={[type(10.5, 800), { color: c.soft }]}>Add</Text>
              </>
            )}
          </View>
        </Press>
      </View>
    </View>
  );
}
