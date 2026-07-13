import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TextInput, Modal, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Press } from '../../src/ui';
import { Screen } from '../../src/ui/layout';
import { NotFound } from '../../src/components/NotFound';
import { ThreadAvatar } from './index';
import {
  fetchThreadHeader, fetchMessages, sendMessage, markThreadRead, setThreadBlock, reportMessage,
  subscribeThread, type Message, type ThreadHeader,
} from '../../src/lib/messages';

const CTX_LABEL: Record<string, string> = {
  order: 'About an order',
  subscription: 'About your plan',
  service_request: 'About a request',
  booking: 'About a booking',
  box: 'About your weekly box',
};

function dayLabel(iso: string): string {
  const d = new Date(iso), now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return 'TODAY';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'YESTERDAY';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}
function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function ThreadView() {
  const c = useC();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { toast } = useStore();

  const [header, setHeader] = useState<ThreadHeader | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const meIdRef = useRef<string | null>(null);

  const scrollDown = useCallback(() => { requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true })); }, []);

  // initial load
  useEffect(() => {
    let alive = true;
    (async () => {
      const h = await fetchThreadHeader(threadId);
      if (!alive) return;
      if (!h) { setNotFound(true); setLoading(false); return; }
      setHeader(h);
      const m = await fetchMessages(threadId);
      if (!alive) return;
      meIdRef.current = m.find((x) => x.mine)?.senderId ?? meIdRef.current;
      setMsgs(m);
      setLoading(false);
      markThreadRead(threadId).catch(() => {});
      scrollDown();
    })();
    return () => { alive = false; };
  }, [threadId]);

  // live stream — append inbound messages, mark read as they arrive
  useEffect(() => {
    if (!threadId) return;
    const off = subscribeThread(threadId, (row) => {
      setMsgs((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev; // dedupe (incl. our own optimistic→real)
        const mine = !!meIdRef.current && row.sender_id === meIdRef.current;
        const next = [...prev, {
          id: row.id, threadId: row.thread_id, senderId: row.sender_id, senderRole: row.sender_role,
          kind: row.kind, body: row.body, createdAt: row.created_at, mine,
        } as Message];
        if (!mine) markThreadRead(threadId).catch(() => {});
        return next;
      });
      scrollDown();
    });
    return off;
  }, [threadId, scrollDown]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setText('');
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId, threadId, senderId: meIdRef.current ?? 'me', senderRole: header?.iAmCook ? 'kitchen' : 'customer',
      kind: 'text', body, createdAt: new Date().toISOString(), mine: true,
    };
    setMsgs((m) => [...m, optimistic]);
    scrollDown();
    setSending(true);
    try {
      const saved = await sendMessage(threadId, body);
      if (saved) {
        meIdRef.current = saved.senderId;
        setMsgs((m) => m.map((x) => (x.id === tempId ? saved : x)));
      }
    } catch (e: any) {
      setMsgs((m) => m.filter((x) => x.id !== tempId)); // roll back the optimistic bubble
      setText(body);
      toast(e?.message?.includes('policy') || e?.code === '42501' ? 'You can’t message this conversation' : (e?.message || 'Couldn’t send'), 'info');
    } finally { setSending(false); }
  };

  const doBlock = async (blocked: boolean) => {
    setMenu(false);
    try {
      await setThreadBlock(threadId, blocked);
      setHeader((h) => (h ? { ...h, blockedByMe: blocked, blocked: blocked || h.blocked } : h));
      toast(blocked ? 'Conversation blocked' : 'Conversation unblocked', blocked ? 'x' : 'check', !blocked);
    } catch (e: any) { toast(e?.message || 'Could not update', 'info'); }
  };
  const doReport = async () => {
    setMenu(false);
    const last = [...msgs].reverse().find((m) => !m.mine && !m.id.startsWith('temp-'));
    if (!last) { toast('Nothing to report yet', 'info'); return; }
    try { await reportMessage(last.id, 'reported from chat'); toast('Reported to Preppa — thank you', 'flag', true); }
    catch (e: any) { toast(e?.message || 'Could not report', 'info'); }
  };

  if (notFound) return <NotFound title="Conversation" />;

  const ctx = header?.contextType ? CTX_LABEL[header.contextType] : null;
  const blocked = !!header?.blocked;

  return (
    <Screen>
      {/* header */}
      <View style={{ backgroundColor: c.surface, paddingTop: insets.top + 12, paddingBottom: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: c.border2 }}>
        <Press scale={0.9} onPress={() => router.back()} label="Back">
          <View style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}><Icon name="chevLeft" size={20} color={c.ink} /></View>
        </Press>
        <Press scale={0.98} disabled={!header || header.iAmCook} onPress={() => header && router.push(`/store/${header.kitchenId}`)} style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {header ? <ThreadAvatar name={header.name} url={header.avatarUrl} size={38} /> : <View style={{ width: 38 }} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[type(16, 900), { color: c.ink }]}>{header?.name ?? 'Conversation'}</Text>
              {ctx ? <Text style={[type(11.5, 700), { color: c.muted }]}>{ctx}</Text> : null}
            </View>
          </View>
        </Press>
        <Press scale={0.9} onPress={() => setMenu(true)} label="Options">
          <View style={[{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }, shadow.soft]}>
            <Text style={[type(20, 900), { color: c.ink, marginTop: -6 }]}>⋯</Text>
          </View>
        </Press>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 60}>
          <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 8 }} onContentSizeChange={scrollDown}>
            {msgs.length === 0 ? (
              <Text style={[type(13, 500), { color: c.muted, textAlign: 'center', marginTop: 24, lineHeight: 20 }]}>
                This is the start of your conversation.{'\n'}Messages are private between you and {header?.name ?? 'them'}.
              </Text>
            ) : null}
            {msgs.map((m, i) => {
              const showDay = i === 0 || dayLabel(m.createdAt) !== dayLabel(msgs[i - 1].createdAt);
              if (m.senderRole === 'system') {
                return (
                  <View key={m.id}>
                    {showDay ? <Text style={[type(11, 700), { color: c.muted, textAlign: 'center', marginVertical: 6 }]}>{dayLabel(m.createdAt)}</Text> : null}
                    <Text style={[type(12, 600), { color: c.muted, textAlign: 'center', marginVertical: 4 }]}>{m.body}</Text>
                  </View>
                );
              }
              return (
                <View key={m.id}>
                  {showDay ? <Text style={[type(11, 700), { color: c.muted, textAlign: 'center', marginVertical: 6 }]}>{dayLabel(m.createdAt)}</Text> : null}
                  <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: m.mine ? c.primary : c.surface, borderWidth: m.mine ? 0 : 1, borderColor: c.border2, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, borderBottomRightRadius: m.mine ? 4 : 18, borderBottomLeftRadius: m.mine ? 18 : 4 }}>
                    <Text style={[type(14, 500), { color: m.mine ? '#fff' : c.ink, lineHeight: 20 }]}>{m.body}</Text>
                    <Text style={[type(10, 600), { color: m.mine ? 'rgba(255,255,255,.7)' : c.muted, marginTop: 3, alignSelf: 'flex-end' }]}>{clock(m.createdAt)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {/* composer */}
          {blocked ? (
            <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border2, padding: 16, paddingBottom: Math.max(insets.bottom, 14), alignItems: 'center' }}>
              <Text style={[type(13, 600), { color: c.muted, textAlign: 'center' }]}>
                {header?.blockedByMe ? 'You blocked this conversation. Unblock from the ⋯ menu to reply.' : 'You can no longer reply to this conversation.'}
              </Text>
            </View>
          ) : (
            <View style={{ backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border2, flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, paddingBottom: Math.max(insets.bottom, 12) }}>
              <View style={{ flex: 1, minHeight: 48, maxHeight: 120, borderRadius: radius.md, backgroundColor: c.bg2, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 6 }}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  placeholder={`Message ${header?.name?.split(' ')[0] ?? ''}…`}
                  placeholderTextColor={c.muted}
                  multiline
                  style={[type(14, 500), { color: c.ink, maxHeight: 108 }]}
                  onSubmitEditing={send}
                />
              </View>
              <Press scale={0.94} onPress={send} disabled={!text.trim() || sending} label="Send">
                <View style={{ width: 52, height: 48, borderRadius: radius.md, backgroundColor: text.trim() ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                  {sending ? <ActivityIndicator size="small" color="#fff" /> : <Icon name="send" size={19} color="#fff" />}
                </View>
              </Press>
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {/* options sheet */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable onPress={() => setMenu(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.45)', justifyContent: 'flex-end' }}>
          <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: c.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, padding: 10, paddingBottom: Math.max(insets.bottom, 16) }}>
            {header && !header.iAmCook ? (
              <SheetRow icon="chat" label="View kitchen" onPress={() => { setMenu(false); router.push(`/store/${header.kitchenId}`); }} />
            ) : null}
            <SheetRow icon="flag" label="Report conversation" onPress={doReport} />
            {header?.blockedByMe
              ? <SheetRow icon="check" label="Unblock" onPress={() => doBlock(false)} />
              : <SheetRow icon="x" label="Block" danger onPress={() => doBlock(true)} />}
            <SheetRow icon="chevLeft" label="Close" onPress={() => setMenu(false)} muted />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function SheetRow({ icon, label, onPress, danger, muted }: { icon: string; label: string; onPress: () => void; danger?: boolean; muted?: boolean }) {
  const c = useC();
  const color = danger ? c.red : muted ? c.muted : c.ink;
  return (
    <Press scale={0.98} onPress={onPress}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, paddingHorizontal: 14 }}>
        <Icon name={icon} size={19} color={color} />
        <Text style={[type(15, 700), { color }]}>{label}</Text>
      </View>
    </Press>
  );
}
