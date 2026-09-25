import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { confirmAction } from '../../src/lib/confirm';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, tnum } from '../../src/theme/theme';
import { Screen, Btn } from '../../src/ui';
import { Sheet } from '../../src/ui/overlay';
import * as admin from '../../src/lib/admin';
import { DataTable, Column } from '../../src/components/admin/DataTable';
import { AdminHeader } from '../../src/components/admin/AdminHeader';
import { ErrorRetry } from '../../src/components/admin/states';
import { fmtDateTime } from '../../src/components/admin/format';
import { useStore } from '../../src/store/store';

const PAGE = 50;

export default function AdminWaitlist() {
  const c = useC();
  const { toast } = useStore();
  const [rows, setRows] = useState<admin.AdminWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [sel, setSel] = useState<admin.AdminWaitlistEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const loadRequest = useRef(0);
  const moreInFlight = useRef(false);

  const loadFirst = useCallback(async () => {
    const request = ++loadRequest.current;
    moreInFlight.current = false;
    setLoading(true);
    setError(null);
    setDone(false);
    try {
      const page = await admin.listWaitlist({ limit: PAGE });
      if (request !== loadRequest.current) return;
      setRows(page);
      setDone(page.length < PAGE);
    } catch {
      if (request === loadRequest.current) setError(new Error('Could not load waitlist signups.'));
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirst();
    return () => { loadRequest.current += 1; moreInFlight.current = false; };
  }, [loadFirst]);

  const loadOlder = async () => {
    if (rows.length === 0 || moreInFlight.current) return;
    moreInFlight.current = true;
    const request = loadRequest.current;
    setMore(true);
    setError(null);
    try {
      const page = await admin.listWaitlist({ limit: PAGE, before: rows[rows.length - 1].created_at });
      if (request !== loadRequest.current) return;
      setRows((prev) => [...prev, ...page]);
      if (page.length < PAGE) setDone(true);
    } catch {
      if (request === loadRequest.current) setError(new Error('Could not load older waitlist signups.'));
    } finally {
      if (request === loadRequest.current) setMore(false);
      moreInFlight.current = false;
    }
  };

  const confirmDelete = (entry: admin.AdminWaitlistEntry) => {
    confirmAction(
      'Delete signup',
      `Remove ${entry.email} from the waitlist? This can't be undone.`,
      async () => {
        setDeleting(true);
        try {
          await admin.deleteWaitlistEntry(entry.id);
          setRows((prev) => prev.filter((r) => r.id !== entry.id));
          setSel(null);
          toast('Signup deleted', 'check', true);
        } catch {
          toast('Could not delete this signup. Refresh the waitlist and try again.', 'info');
        } finally {
          setDeleting(false);
        }
      },
    );
  };

  const columns: Column<admin.AdminWaitlistEntry>[] = [
    {
      key: 'email',
      header: 'Email',
      flex: 1.5,
      render: (w) => <Text style={[type(14, 700), { color: c.ink }]} numberOfLines={1}>{w.email}</Text>,
    },
    { key: 'zip', header: 'ZIP', flex: 0.6, hideBelow: 640, render: (w) => <Text style={[type(13, 600), { color: c.soft }]}>{w.zip ?? '—'}</Text> },
    { key: 'source', header: 'Source', flex: 0.8, hideBelow: 780, render: (w) => <Text style={[type(13, 600), { color: c.soft }]} numberOfLines={1}>{w.source ?? '—'}</Text> },
    { key: 'when', header: 'Joined', width: 138, align: 'right', render: (w) => <Text style={[type(12.5, 600), { color: c.muted }]}>{fmtDateTime(w.created_at)}</Text> },
  ];

  return (
    <Screen max={980}>
      <AdminHeader title="Waitlist" sub={loading ? 'Loading…' : `${rows.length} signups`} back={true} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 44 }}>
        {error && rows.length === 0 ? (
          <ErrorRetry message="Check your connection and try loading the waitlist again." onRetry={loadFirst} />
        ) : (
          <>
            {error ? <ErrorRetry message="Could not load older signups. Try again." onRetry={loadOlder} /> : null}
            <DataTable
              columns={columns}
              rows={rows}
              keyOf={(w) => w.id}
              onRowPress={setSel}
              rowLabel={(w) => `${w.email} details`}
              loading={loading}
              minWidth={560}
              search={{ placeholder: 'Search email, ZIP, source…', value: (w) => `${w.email} ${w.zip ?? ''} ${w.source ?? ''}` }}
              empty={{ icon: 'bell', title: 'No waitlist signups yet', body: 'Visitors who join the waitlist on preppa.live show up here.' }}
            />
            {!loading && rows.length > 0 && !done ? (
              <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
                <Btn label={more ? 'Loading…' : 'Load older'} variant="ghost" loading={more} disabled={more} onPress={loadOlder} />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={!!sel} onClose={deleting ? () => {} : () => setSel(null)} title="Waitlist signup" scroll>
        {sel ? (
          <View style={{ gap: 12, paddingBottom: 8 }}>
            <ARow c={c} k="Email" v={sel.email} />
            <ARow c={c} k="ZIP" v={sel.zip ?? '—'} />
            <ARow c={c} k="Source" v={sel.source ?? '—'} />
            <ARow c={c} k="Joined" v={fmtDateTime(sel.created_at)} />
            <Btn
              label="Delete signup"
              variant="ghost"
              loading={deleting}
              disabled={deleting}
              onPress={() => confirmDelete(sel)}
              style={{ backgroundColor: c.redL, marginTop: 8 }}
            />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function ARow({ c, k, v, mono }: { c: any; k: string; v: string; mono?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text style={[type(13, 700), { color: c.muted, width: 90 }]}>{k}</Text>
      <Text style={[type(13.5, 600), { color: c.ink, flex: 1 }, mono ? tnum : null]}>{v}</Text>
    </View>
  );
}
