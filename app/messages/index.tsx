import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius } from '../../src/theme/theme';
import { Btn, Icon, Press } from '../../src/ui';
import { Screen, TopBar, Empty } from '../../src/ui/layout';
import { listThreads, type Thread } from '../../src/lib/messages';

function relTime(iso: string | null): string {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / 604800)}w`;
}

// The other party's message shows a plain preview; my own last message is prefixed "You:".
function previewText(t: Thread): string {
  if (!t.preview) return 'Say hello 👋';
  const mine = (t.iAmCook && t.lastSenderRole === 'kitchen') || (!t.iAmCook && t.lastSenderRole === 'customer');
  return mine ? `You: ${t.preview}` : t.preview;
}

export default function MessagesList() {
  const c = useC();
  const router = useRouter();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError('');
    try { const next = await listThreads(); if (loadSequence.current === sequence) setThreads(next); }
    catch { if (loadSequence.current === sequence) setError('Check your connection and try loading your conversations again.'); }
    finally { if (loadSequence.current === sequence) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { load(); return () => { loadSequence.current += 1; }; }, [load]));

  return (
    <Screen>
      <TopBar title="Messages" sub={loading ? '' : `${threads.length} conversation${threads.length !== 1 ? 's' : ''}`} onBack={() => router.back()} />
      {loading && threads.length === 0 ? (
        <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : error && threads.length === 0 ? (
        <Empty icon="info" title="Couldn’t load messages" body={error} action={<Btn label="Try again" icon="repeat" onPress={load} />} />
      ) : threads.length === 0 ? (
        <Empty icon="chat" title="No messages yet" body="Message a cook from their kitchen, an order, or a plan and the conversation shows up here." />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {error ? (
            <View accessibilityRole="alert" style={{ margin: 16, padding: 14, borderRadius: radius.md, backgroundColor: c.bg2 }}>
              <Text style={[type(13, 700), { color: c.soft, marginBottom: 10 }]}>Conversations could not be refreshed. Existing messages are still available.</Text>
              <Btn label="Try again" icon="repeat" variant="ghost" onPress={load} />
            </View>
          ) : null}
          {threads.map((t) => (
            <Press key={t.id} scale={0.99} onPress={() => router.push(`/messages/${t.id}`)} label={`Open conversation with ${t.name}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: t.unread ? c.unread : c.surface, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
                <ThreadAvatar name={t.name} url={t.avatarUrl} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text numberOfLines={1} style={[type(15, t.unread ? 900 : 800), { color: c.ink, flex: 1 }]}>{t.name}</Text>
                    <Text style={[type(11, 700), { color: t.unread ? c.primary : c.muted }]}>{relTime(t.lastAt)}</Text>
                  </View>
                  <Text numberOfLines={1} style={[type(13, t.unread ? 700 : 500), { color: t.unread ? c.ink2 : c.soft, marginTop: 3 }]}>{previewText(t)}</Text>
                </View>
                {t.unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary }} /> : null}
              </View>
            </Press>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

export function ThreadAvatar({ name, url, size = 46 }: { name: string; url: string | null; size?: number }) {
  const c = useC();
  const initial = (name || '?').trim()[0]?.toUpperCase() ?? '?';
  if (url) {
    return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg2 }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.primaryL, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={[type(size * 0.4, 900), { color: c.primaryD }]}>{initial}</Text>
    </View>
  );
}
