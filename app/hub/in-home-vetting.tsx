import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useC } from '../../src/theme/ThemeContext';
import { type, radius, shadow } from '../../src/theme/theme';
import { useStore } from '../../src/store/store';
import { Icon, Btn, Press } from '../../src/ui';
import { Screen, TopBar, Dock } from '../../src/ui/layout';
import { PhotoUploader, PhotoRef } from '../../src/components/PhotoUploader';
import { getMyKitchen } from '../../src/lib/connect';
import { createCookDocSignedUrl } from '../../src/lib/supabase';
import { getMyInHomeVetting, submitInHomeVetting, VettingStatus } from '../../src/lib/inHomeVetting';

const STATUS_META: Record<VettingStatus, { label: string; tone: 'muted' | 'amber' | 'green' | 'red' }> = {
  unverified: { label: 'Not submitted', tone: 'muted' },
  pending: { label: 'Under review', tone: 'amber' },
  verified: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Changes needed', tone: 'red' },
  suspended: { label: 'Suspended', tone: 'red' },
};

export default function InHomeVetting() {
  const c = useC();
  const { toast } = useStore();
  const [loading, setLoading] = useState(true);
  const [kitchenId, setKitchenId] = useState<string | null>(null);
  const [status, setStatus] = useState<VettingStatus>('unverified');
  const [reason, setReason] = useState<string | null>(null);
  const [bg, setBg] = useState<PhotoRef[]>([]);
  const [insurance, setInsurance] = useState<PhotoRef[]>([]);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const k = await getMyKitchen();
      if (!k) { setLoading(false); return; }
      setKitchenId(k.id);
      const v = await getMyInHomeVetting(k.id);
      setStatus(v.status);
      setReason(v.reason);
      setExpires(v.insuranceExpiresAt ?? '');
      // Existing doc paths → signed previews so a resubmission shows what's already on file.
      const toRefs = async (paths: string[]) => {
        const refs: PhotoRef[] = [];
        for (const path of paths) {
          const url = await createCookDocSignedUrl(path);
          if (url) refs.push({ path, preview: url });
        }
        return refs;
      };
      setBg(await toRefs(v.docs.backgroundCheck));
      setInsurance(await toRefs(v.docs.insurance));
      setLoading(false);
    })();
  }, []);

  const submit = async () => {
    if (busy || !kitchenId) return;
    if (bg.length === 0) { toast('Add your background-check document.', 'info'); return; }
    if (insurance.length === 0) { toast('Add your liability insurance document.', 'info'); return; }
    setBusy(true);
    try {
      await submitInHomeVetting(kitchenId, {
        backgroundCheck: bg.map((p) => p.path), insurance: insurance.map((p) => p.path),
      }, expires || null);
      setStatus('pending');
      toast('Sent for review — usually within a couple days.', 'check', true);
    } catch (e: any) {
      toast(e?.message || 'Could not submit. Please try again.', 'info');
    } finally { setBusy(false); }
  };

  if (loading) {
    return (
      <Screen>
        <TopBar title="In-home safety" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={c.primary} /></View>
      </Screen>
    );
  }
  if (!kitchenId) {
    return (
      <Screen>
        <TopBar title="In-home safety" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Text style={[type(14, 700), { color: c.soft, textAlign: 'center' }]}>You need a kitchen to apply for in-home cooking.</Text>
        </View>
      </Screen>
    );
  }

  const meta = STATUS_META[status];
  const toneColor = { muted: c.muted, amber: c.primary, green: c.green, red: c.red }[meta.tone];
  const toneBg = { muted: c.bg2, amber: c.primaryL, green: c.greenL, red: c.redL }[meta.tone];
  const canEdit = status !== 'pending' && status !== 'verified';

  return (
    <Screen>
      <TopBar title="In-home safety" sub="Required to accept &quot;Cook at My Place&quot; bookings" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: canEdit ? 120 : 40 }}>
        <View style={{ marginHorizontal: 16, marginTop: 4, padding: 16, borderRadius: radius.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, ...shadow.card }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: toneBg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={status === 'verified' ? 'shield' : status === 'rejected' ? 'info' : 'clock'} size={19} color={toneColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type(15, 900), { color: c.ink }]}>{meta.label}</Text>
              <Text style={[type(12.5, 600), { color: c.soft, marginTop: 2 }]}>
                {status === 'verified' ? 'Customers can book you for in-home cooking.'
                  : status === 'pending' ? 'We review background-check + insurance submissions in the order received.'
                  : status === 'rejected' ? (reason ?? 'Please review and resubmit.')
                  : 'Cooking in a customer’s home needs a separate, higher bar than kitchen verification.'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ marginHorizontal: 16, marginTop: 14, padding: 16, borderRadius: radius.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border2, gap: 20 }}>
          <PhotoUploader
            label="Background-check report" group="in_home_background"
            hint="A recent (within 1 year) criminal background-check report — e.g. from Checkr, Sterling, or your state/county."
            photos={bg} onChange={canEdit ? setBg : () => {}} min={1}
          />
          <PhotoUploader
            label="Liability insurance" group="in_home_insurance"
            hint="Your general liability insurance certificate covering in-home work."
            photos={insurance} onChange={canEdit ? setInsurance : () => {}} min={1}
          />
          <View>
            <Text style={[type(12.5, 800), { color: c.soft, marginBottom: 8 }]}>Insurance expiration date</Text>
            <TextInput
              value={expires} onChangeText={canEdit ? setExpires : undefined} editable={canEdit}
              placeholder="YYYY-MM-DD" placeholderTextColor={c.muted}
              style={{ height: 48, borderRadius: radius.sm, paddingHorizontal: 14, borderWidth: 1, borderColor: c.border, backgroundColor: canEdit ? c.bg : c.bg2, color: c.ink, fontSize: 15 }}
            />
          </View>
        </View>
      </ScrollView>

      {canEdit ? (
        <Dock>
          <Btn label={busy ? 'Submitting…' : status === 'rejected' ? 'Resubmit for review' : 'Submit for review'} flex={1} loading={busy} onPress={submit} />
        </Dock>
      ) : null}
    </Screen>
  );
}
