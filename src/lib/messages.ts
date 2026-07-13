import { supabase } from './supabase';

/**
 * Real 1:1 messaging (customer ↔ cook). A thread's identity is the (customer, kitchen)
 * relationship — ONE durable conversation per pair; the order/subscription/request it was
 * opened from is carried as a context reference, not a separate thread. Sends are a direct
 * RLS-guarded INSERT (low latency); reads go through SECURITY DEFINER RPCs that resolve the
 * counterpart's display identity server-side (so we never depend on cross-profile RLS).
 * Backend: message_threads / messages / message_blocks + open_thread/list_threads/… RPCs.
 */

export interface Thread {
  id: string;
  kitchenId: string;
  name: string;            // counterpart display name (kitchen name for a customer; customer name for a cook)
  avatarUrl: string | null;
  contextType: string | null;
  contextId: string | null;
  preview: string | null;
  lastAt: string | null;
  lastSenderRole: string | null;
  unread: boolean;
  iAmCook: boolean;
}

export interface ThreadHeader {
  id: string;
  kitchenId: string;
  name: string;
  avatarUrl: string | null;
  contextType: string | null;
  contextId: string | null;
  iAmCook: boolean;
  blockedByMe: boolean;
  blocked: boolean;        // either party has blocked (sends are disabled)
}

export type SenderRole = 'customer' | 'kitchen' | 'system';
export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: SenderRole;
  kind: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

async function myUid(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

/** Resolve-or-create the thread for (me, kitchen) — race-safe via a unique index + ON CONFLICT. */
export async function openThread(kitchenId: string, contextType?: string, contextId?: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_thread', {
    p_kitchen: kitchenId, p_ctx_type: contextType ?? null, p_ctx_id: contextId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function listThreads(): Promise<Thread[]> {
  const { data, error } = await supabase.rpc('list_threads');
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    id: r.thread_id, kitchenId: r.kitchen_id, name: r.counterpart_name ?? 'Conversation',
    avatarUrl: r.counterpart_avatar ?? null, contextType: r.context_type, contextId: r.context_id,
    preview: r.last_preview, lastAt: r.last_at, lastSenderRole: r.last_sender_role,
    unread: !!r.unread, iAmCook: !!r.i_am_cook,
  }));
}

export async function fetchThreadHeader(threadId: string): Promise<ThreadHeader | null> {
  const { data, error } = await supabase.rpc('thread_header', { p_thread: threadId });
  const r = (data as any[])?.[0];
  if (error || !r) return null;
  return {
    id: r.thread_id, kitchenId: r.kitchen_id, name: r.counterpart_name ?? 'Conversation',
    avatarUrl: r.counterpart_avatar ?? null, contextType: r.context_type, contextId: r.context_id,
    iAmCook: !!r.i_am_cook, blockedByMe: !!r.blocked_by_me, blocked: !!r.blocked,
  };
}

const MSG_COLS = 'id, thread_id, sender_id, sender_role, kind, body, created_at';
function rowToMessage(r: any, me: string | null): Message {
  return {
    id: r.id, threadId: r.thread_id, senderId: r.sender_id, senderRole: r.sender_role,
    kind: r.kind, body: r.body, createdAt: r.created_at, mine: !!me && r.sender_id === me,
  };
}

export async function fetchMessages(threadId: string, limit = 200): Promise<Message[]> {
  const me = await myUid();
  const { data, error } = await supabase
    .from('messages').select(MSG_COLS)
    .eq('thread_id', threadId).order('created_at', { ascending: true }).limit(limit);
  if (error || !data) return [];
  return (data as any[]).map((r) => rowToMessage(r, me));
}

/** Send a message (direct RLS-guarded insert; blocked/non-participant sends are rejected by the policy). */
export async function sendMessage(threadId: string, body: string): Promise<Message | null> {
  const me = await myUid();
  if (!me) throw new Error('AUTH_REQUIRED');
  const text = body.trim();
  if (!text) return null;
  const { data, error } = await supabase
    .from('messages').insert({ thread_id: threadId, sender_id: me, body: text })
    .select(MSG_COLS).single();
  if (error) throw error;
  return rowToMessage(data, me);
}

export async function markThreadRead(threadId: string): Promise<void> {
  await supabase.rpc('mark_thread_read', { p_thread: threadId });
}

export async function setThreadBlock(threadId: string, blocked: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_thread_block', { p_thread: threadId, p_blocked: blocked });
  if (error) throw error;
}

export async function reportMessage(messageId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('report_message', { p_message: messageId, p_reason: reason ?? null });
  if (error) throw error;
}

export async function threadUnreadCount(): Promise<number> {
  const { data } = await supabase.rpc('my_thread_unread_count');
  return Number(data) || 0;
}

/** Live per-thread message stream (Realtime postgres_changes, INSERT). Returns an unsubscribe fn. */
export function subscribeThread(threadId: string, onInsert: (row: any) => void): () => void {
  const channel = supabase
    .channel(`messages:${threadId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
      (payload) => onInsert(payload.new))
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

/**
 * Live stream of my notifications — postgres_changes can't express "my threads", so the
 * thread list / global unread badge piggyback the per-user notifications channel (which also
 * lights the bell). Returns an unsubscribe fn.
 */
export function subscribeMyNotifications(userId: string, onInsert: () => void): () => void {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      () => onInsert())
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
