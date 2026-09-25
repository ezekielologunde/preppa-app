import React, { useRef, useState } from 'react';
import { View, Text, Image, Platform, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow } from '../theme/theme';
import { Icon, Press } from '../ui';
import { uploadCookPhoto } from '../lib/supabase';
import { useStore } from '../store/store';

export interface PhotoRef { path: string; preview: string }

/**
 * Multi-image uploader for cook verification (refrigeration, kitchen, and related evidence).
 * Web and native pickers upload each file to the private
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
  const { toast } = useStore();
  const [busy, setBusy] = useState(false);
  const uploadInFlight = useRef(false);
  const met = photos.length >= min;

  const uploadSelected = async (items: Array<{ blob: Blob; preview: string }>) => {
    if (!items.length || uploadInFlight.current) return;
    uploadInFlight.current = true;
    setBusy(true);
    const added: PhotoRef[] = [];
    let failed = 0;
    for (const item of items) {
      try {
        const path = await uploadCookPhoto(item.blob, group);
        added.push({ path, preview: item.preview });
      } catch {
        failed += 1;
        if (Platform.OS === 'web' && item.preview.startsWith('blob:')) URL.revokeObjectURL(item.preview);
      }
    }
    setBusy(false);
    uploadInFlight.current = false;
    if (added.length) onChange([...photos, ...added]);
    if (failed) toast(failed === items.length ? 'Could not upload those photos. Please try again.' : `${failed} photo${failed === 1 ? '' : 's'} could not be uploaded.`, 'info');
  };

  const pick = async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      (input as any).capture = 'environment';
      input.onchange = () => {
        const files = Array.from(input.files || []);
        void uploadSelected(files.map((file) => ({ blob: file, preview: URL.createObjectURL(file) })));
      };
      input.click();
      return;
    }
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        toast('Photo library access is off. Enable it in Settings to add verification photos.', 'info');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 8,
        quality: 0.85,
      });
      if (result.canceled || !result.assets.length) return;
      const items = await Promise.all(result.assets.map(async (asset) => {
        const response = await fetch(asset.uri);
        if (!response.ok) throw new Error('PHOTO_READ_FAILED');
        return { blob: await response.blob(), preview: asset.uri };
      }));
      await uploadSelected(items);
    } catch {
      toast('Could not open those photos. Please try again.', 'info');
    }
  };

  const remove = (path: string) => {
    const removed = photos.find((photo) => photo.path === path);
    if (Platform.OS === 'web' && removed?.preview.startsWith('blob:')) URL.revokeObjectURL(removed.preview);
    onChange(photos.filter((p) => p.path !== path));
  };

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
          // NB: no overflow:'hidden' on the wrapper so the remove button isn't clipped and
          // reliably receives taps on web (it sits above the image).
          <View key={p.path} style={{ width: 84, height: 84, borderRadius: radius.md, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border }}>
            <Image source={{ uri: p.preview }} style={{ width: '100%', height: '100%', borderRadius: radius.md }} resizeMode="cover" />
            <Press scale={0.9} onPress={() => remove(p.path)} label="Remove photo" hitSlop={12} style={{ position: 'absolute', top: -8, right: -8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#0E0E10', borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
                <Icon name="x" size={15} color="#fff" />
              </View>
            </Press>
          </View>
        ))}
        <Press scale={0.96} onPress={pick} disabled={busy} label={`Add ${label}`}>
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
      {photos.length > 0 ? (
        <Text style={[type(11.5, 600), { color: c.muted, marginTop: 8 }]}>Tap the ✕ on a photo to remove it.</Text>
      ) : null}
    </View>
  );
}
