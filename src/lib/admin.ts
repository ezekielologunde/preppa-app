/**
 * Admin data access (Phase 1). Thin sibling of `payments.ts`: web-only, calls the
 * server-enforced admin RPCs with the *current* (admin's) session — never
 * `ensureAuth()`, which would sign in the non-admin seeded test customer.
 *
 * SECURITY: none of this is a trust boundary. Every function below hits an RPC
 * that re-checks `is_admin()` server-side; a non-admin session gets empty reads
 * and rejected writes regardless of what this client does.
 */
import { Platform } from 'react-native';
import { supabase } from './supabase';

export interface AdminOverview {
  pending_applications: number;
  verified_kitchens: number;
  total_kitchens: number;
  preppers: number;
}

export interface AdminApplication {
  kitchen_id: string;
  kitchen_name: string;
  cuisine: string | null;
  approx_area: string | null;
  applicant_id: string;
  applicant_name: string | null;
  status: string;
  applied_at: string;
}

export interface AdminApplicationDetail {
  kitchen_id: string;
  kitchen_name: string;
  cuisine: string | null;
  bio: string | null;
  approx_area: string | null;
  availability: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  applicant_id: string;
  applicant_name: string | null;
  applicant_first: string | null;
  // private application detail (owner + admin only)
  phone: string | null;
  address: string | null;
  food_safety: { refrigeration?: boolean; foodPrep?: boolean; allergens?: boolean; note?: string } | null;
  food_handler_cert: string | null;
  agreement_version: string | null;
  agreement_accepted_at: string | null;
}

function ensureWeb() {
  if (Platform.OS !== 'web') throw new Error('The admin dashboard is web-only.');
}

export async function overview(): Promise<AdminOverview> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw error;
  return (
    (data?.[0] as AdminOverview) ?? {
      pending_applications: 0,
      verified_kitchens: 0,
      total_kitchens: 0,
      preppers: 0,
    }
  );
}

export async function listApplications(): Promise<AdminApplication[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_applications');
  if (error) throw error;
  return (data as AdminApplication[]) ?? [];
}

export async function applicationDetail(kitchenId: string): Promise<AdminApplicationDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_application_detail', { p_kitchen: kitchenId });
  if (error) throw error;
  return (data?.[0] as AdminApplicationDetail) ?? null;
}

export async function approveApplication(kitchenId: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('approve_kitchen', { p_kitchen: kitchenId });
  if (error) throw error;
}

export async function rejectApplication(kitchenId: string, reason: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('reject_kitchen', { p_kitchen: kitchenId, p_reason: reason });
  if (error) throw error;
}

// --- Order-linked support tickets (Phase 2) ---
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface AdminTicket {
  ticket_id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  reporter_name: string | null;
  order_id: string;
  kitchen_name: string | null;
  cook_visible: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminTicketMessage {
  id: string;
  body: string;
  is_internal: boolean;
  from_admin: boolean;
  created_at: string;
}

export interface AdminTicketDetail {
  ticket_id: string;
  subject: string;
  body: string;
  category: string;
  status: TicketStatus;
  reporter_name: string | null;
  order_id: string;
  kitchen_name: string | null;
  cook_visible: boolean;
  created_at: string;
  messages: AdminTicketMessage[];
}

export async function listTickets(): Promise<AdminTicket[]> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_list_tickets');
  if (error) throw error;
  return (data as AdminTicket[]) ?? [];
}

export async function ticketDetail(ticketId: string): Promise<AdminTicketDetail | null> {
  ensureWeb();
  const { data, error } = await supabase.rpc('admin_ticket_detail', { p_ticket: ticketId });
  if (error) throw error;
  const row = data?.[0] as AdminTicketDetail | undefined;
  if (!row) return null;
  // `messages` arrives as jsonb; normalize to an array.
  return { ...row, messages: Array.isArray(row.messages) ? row.messages : [] };
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('set_ticket_status', { p_ticket: ticketId, p_status: status });
  if (error) throw error;
}

export async function replyToTicket(ticketId: string, body: string, internal = false): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('add_ticket_message', { p_ticket: ticketId, p_body: body, p_internal: internal });
  if (error) throw error;
}

/** Share a ticket with the cook (kitchen owner) so they can see the thread and reply. */
export async function shareTicketWithCook(ticketId: string): Promise<void> {
  ensureWeb();
  const { error } = await supabase.rpc('share_ticket_with_cook', { p_ticket: ticketId });
  if (error) throw error;
}
