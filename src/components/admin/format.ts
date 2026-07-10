/** Shared formatting + status→tone mapping for admin screens. */
import type { StatusTone } from '../../ui/layout';

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Humanize a snake_case status/action. */
export const humanize = (s: string) => s.replace(/_/g, ' ');

export function payTone(status: string): StatusTone {
  if (status === 'paid') return 'success';
  if (status === 'refunded' || status === 'failed') return 'danger';
  return 'neutral';
}

export function piTone(status: string | null): StatusTone {
  if (!status) return 'neutral';
  if (status === 'succeeded') return 'success';
  if (status === 'canceled' || status === 'requires_capture') return 'danger';
  if (status.startsWith('requires_') || status === 'processing') return 'neutral';
  return 'info';
}

export function orderStatusTone(status: string): StatusTone {
  if (status === 'completed') return 'success';
  if (status === 'declined' || status === 'canceled') return 'danger';
  if (status === 'pending') return 'neutral';
  return 'info';
}

export function roleTone(role: string): StatusTone {
  if (role === 'admin') return 'brand';
  if (role === 'prepper') return 'info';
  return 'neutral';
}
