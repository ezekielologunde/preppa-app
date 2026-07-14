import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Screen, Icon, Press } from '../../src/ui';
import { money } from '../../src/data/data';
import { useStore } from '../../src/store/store';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { fetchPendingExperiences, adminSetExperienceStatus, type Experience } from '../../src/lib/experiences';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmt(iso: string): string { const d = new Date(iso); return `${WD[d.getDay()]} ${MO[d.getMonth()]} ${d.getDate()}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`; }

export default function AdminExperiences() {
  const c = useC();
  const { toast } = useStore();
  const [items, setItems] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => { setLoading(true); setItems(await fetchPendingExperiences()); setLoading(false); }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = async (e: Experience, status: 'published' | 'archived') => {
    if (busy) return;
    setBusy(e.id);
    try { await adminSetExperienceStatus(e.id, status); toast(status === 'published' ? 'Published' : 'Rejected', status === 'published' ? 'check' : 'x', status === 'published'); await load(); }
    catch (err: any) { toast(err?.message || 'Could not update', 'info'); }
    finally { setBusy(null); }
  };

  return (
    <Screen max={900}>
      <AdminHeader title="Experiences" sub="Review queue" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, paddingBottom: 44, gap: 14 }}>
        {loading ? (
          <View style={{ paddingVertical: 50, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 44 }}>
            <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: c.bg2, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={24} color={c.green} /></View>
            <Text style={[type(15, 800), { color: c.ink, marginTop: 12 }]}>Nothing to review</Text>
            <Text style={[type(13, 600), { color: c.soft, marginTop: 4 }]}>New experiences awaiting approval show up here.</Text>
          </View>
        ) : items.map((e) => {
          const upcoming = e.sessions.filter((s) => s.status !== 'cancelled').length;
          return (
            <View key={e.id} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, borderRadius: radius.card, overflow: 'hidden' }}>
              {e.coverUrl ? <Image source={{ uri: e.coverUrl }} style={{ width: '100%', height: 150 }} resizeMode="cover" /> : null}
              <View style={{ padding: 16 }}>
                <Text style={[type(11, 800), { color: c.soft, textTransform: 'uppercase', letterSpacing: 0.3 }]}>{e.kitchenName} · {e.experienceType.replace('_', ' ')}</Text>
                <Text style={[type(17, 900), { color: c.ink, letterSpacing: -0.4, marginTop: 4 }]}>{e.title}</Text>
                {e.description ? <Text style={[type(13, 600), { color: c.ink2, marginTop: 6, lineHeight: 19 }]}>{e.description}</Text> : null}
                <Text style={[type(12.5, 700), { color: c.soft, marginTop: 10 }]}>
                  {money((e.perPersonCents ?? 0) / 100)}/person · {e.minGuests}–{e.maxGuests} guests · {e.durationMin}min · {upcoming} session{upcoming !== 1 ? 's' : ''}
                </Text>
                {e.sessions.slice(0, 4).map((s) => (
                  <Text key={s.id} style={[type(12, 600), { color: c.muted, marginTop: 3 }]}>· {fmt(s.startsAt)} — {s.capacity} seats</Text>
                ))}
                {e.whatsIncluded.length ? <Text style={[type(12, 600), { color: c.soft, marginTop: 8 }]}>Includes: {e.whatsIncluded.join(', ')}</Text> : null}
                {e.allergens.length ? <Text style={[type(12, 700), { color: c.red, marginTop: 4 }]}>Allergens: {e.allergens.join(', ')}</Text> : null}

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  <Press scale={0.97} onPress={() => act(e, 'archived')} style={{ flex: 1 }}>
                    <View style={{ height: 44, borderRadius: radius.md, backgroundColor: c.bg2, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' }}>
                      {busy === e.id ? <ActivityIndicator size="small" color={c.red} /> : <Text style={[type(13.5, 800), { color: c.red }]}>Reject</Text>}
                    </View>
                  </Press>
                  <Press scale={0.97} onPress={() => act(e, 'published')} style={{ flex: 1 }}>
                    <View style={{ height: 44, borderRadius: radius.md, backgroundColor: c.primaryD, alignItems: 'center', justifyContent: 'center' }}>
                      {busy === e.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[type(13.5, 800), { color: '#fff' }]}>Approve & publish</Text>}
                    </View>
                  </Press>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
