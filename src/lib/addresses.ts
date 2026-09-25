import { supabase } from './supabase';

export interface SavedAddress {
  id: string;
  label: string;
  line1: string;
  line2: string;
}

const mapAddress = (r: any): SavedAddress => ({
  id: r.id,
  label: r.label || 'Address',
  line1: r.line1,
  line2: [r.line2, r.city, r.region, r.postal_code].filter(Boolean).join(', '),
});

async function requireUid(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const uid = data.session?.user?.id;
  if (!uid) throw new Error('AUTH_REQUIRED');
  return uid;
}

export async function fetchSavedAddresses(): Promise<SavedAddress[]> {
  const uid = await requireUid();
  const { data, error } = await supabase
    .from('addresses')
    .select('id,label,line1,line2,city,region,postal_code,is_default')
    .eq('owner_id', uid)
    .eq('kind', 'customer_delivery')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapAddress);
}

export async function createSavedAddress(input: Omit<SavedAddress, 'id'>): Promise<SavedAddress> {
  const uid = await requireUid();
  const { data, error } = await supabase.from('addresses').insert({
    owner_id: uid,
    kind: 'customer_delivery',
    label: input.label.trim(),
    line1: input.line1.trim(),
    line2: null,
    city: input.line2.trim(),
  }).select('id,label,line1,line2,city,region,postal_code').single();
  if (error) throw error;
  return mapAddress(data);
}

export async function updateSavedAddress(id: string, input: Omit<SavedAddress, 'id'>): Promise<SavedAddress> {
  const { data, error } = await supabase.from('addresses').update({
    label: input.label.trim(),
    line1: input.line1.trim(),
    line2: null,
    city: input.line2.trim(),
    region: null,
    postal_code: null,
  }).eq('id', id).select('id,label,line1,line2,city,region,postal_code').single();
  if (error) throw error;
  return mapAddress(data);
}

export async function deleteSavedAddress(id: string): Promise<void> {
  const { error } = await supabase.from('addresses').delete().eq('id', id);
  if (error) throw error;
}
