/**
 * Reporter-side support tickets (Phase 2). Unlike `admin.ts` this is NOT web-only
 * — a customer or prepper files a ticket about an order from any platform. The
 * server RPC enforces that the caller is a party to the order and throttles spam.
 */
import { supabase } from './supabase';

export type TicketCategory = 'missing_item' | 'wrong_item' | 'not_received' | 'food_quality' | 'payment' | 'other';

export const TICKET_CATEGORIES: { value: TicketCategory; label: string }[] = [
  { value: 'missing_item', label: 'Missing item' },
  { value: 'wrong_item', label: 'Wrong item' },
  { value: 'not_received', label: 'Never arrived' },
  { value: 'food_quality', label: 'Food quality' },
  { value: 'payment', label: 'Payment' },
  { value: 'other', label: 'Something else' },
];

/** File a ticket about an order. Returns the new ticket id. */
export async function createOrderTicket(
  orderId: string,
  category: TicketCategory,
  subject: string,
  body: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_ticket', {
    p_order: orderId,
    p_category: category,
    p_subject: subject,
    p_body: body,
  });
  if (error) throw error;
  return data as string;
}

// --- Cook side: tickets an admin has shared with the kitchen owner (Phase 3) ---
export interface SharedTicket { id: string; subject: string; body: string; category: string; status: string; created_at: string }
export interface ThreadMessage { id: string; body: string; created_at: string; author_id: string }

/**
 * Tickets shared with the signed-in cook about their kitchen(s). RLS (`tickets_select_cook`)
 * already restricts rows to kitchens they own AND `cook_visible`; the reporter's identity is
 * deliberately NOT selected (the cook sees the complaint, not who filed it).
 */
export async function listSharedTickets(): Promise<SharedTicket[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select('id,subject,body,category,status,created_at')
    .eq('cook_visible', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as SharedTicket[]) ?? [];
}

/** Non-internal messages on a ticket (RLS hides internal admin notes from the cook). */
export async function ticketThread(ticketId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('ticket_messages')
    .select('id,body,created_at,author_id')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as ThreadMessage[]) ?? [];
}

/** Cook replies on a shared ticket (always non-internal). */
export async function replyToSharedTicket(ticketId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('add_ticket_message', { p_ticket: ticketId, p_body: body, p_internal: false });
  if (error) throw error;
}
