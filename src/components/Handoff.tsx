import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { useC } from '../theme/ThemeContext';
import { type, radius, shadow, tnum } from '../theme/theme';
import { money } from '../data/data';
import { Icon, Btn, useReducedMotion } from '../ui';
import { Dock } from '../ui/layout';

export type HandoffMode = 'cod' | 'pickup' | 'delivery';

const N = 13;
function qrCells(): boolean[] {
  const finder = (r: number, cc: number) => (r < 3 && cc < 3) || (r < 3 && cc >= N - 3) || (r >= N - 3 && cc < 3);
  const cells: boolean[] = [];
  for (let r = 0; r < N; r++)
    for (let cc = 0; cc < N; cc++) {
      const on = finder(r, cc)
        ? (r === 0 || r === 2 || cc === 0 || cc === 2 || r === N - 1 || r === N - 3 || cc === N - 1 || cc === N - 3
            ? true
            : (r === 1 && cc === 1) || (r === 1 && cc === N - 2) || (r === N - 2 && cc === 1)) || (r === 1 && cc === 1)
        : (r * 7 + cc * 13 + (r ^ cc) * 5) % 3 === 0;
      cells.push(on);
    }
  return cells;
}
const CELLS = qrCells();

function FauxQR({ dark }: { dark: string }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
      {CELLS.map((on, i) => (
        <View key={i} style={{ width: `${100 / N}%`, aspectRatio: 1, padding: 0.8 }}>
          <View style={{ flex: 1, backgroundColor: on ? dark : 'transparent', borderRadius: 1 }} />
        </View>
      ))}
    </View>
  );
}

/** Generate a fresh 6-digit backup code (per handoff). */
export const genCode = () => Array.from({ length: 6 }, () => String(Math.floor(Math.random() * 10)));

/**
 * The QR + 6-digit verified-handoff pane. Same design serves three contexts:
 *  - `cod`     — cash: shows the amount, confirms cash changed hands.
 *  - `pickup`  — prepaid pickup meetup: show the code to the cook when collecting.
 *  - `delivery`— prepaid delivery meetup: show the code at the door.
 * Manages its own two-step state; calls `onDone` at the final confirm.
 */
export function Handoff({ mode, cookName, code, amount, onDone }: {
  mode: HandoffMode;
  cookName: string;
  code: string[];
  amount?: number;
  onDone: () => void;
}) {
  const c = useC();
  const [stage, setStage] = useState(0);
  const scan = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const cash = mode === 'cod';
  const where = mode === 'delivery' ? 'at the door' : 'at pickup';

  useEffect(() => {
    if (stage !== 0 || reduced) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(scan, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(scan, { toValue: 0, duration: 1100, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [stage, scan, reduced]);

  const filled = stage >= 1;
  const translateY = scan.interpolate({ inputRange: [0, 1], outputRange: [0, 168] });

  return (
    <>
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingTop: 14 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={[type(13, 700), { color: c.muted, textTransform: 'uppercase', letterSpacing: 0.5 }]}>
            {cash ? 'Amount to pay in cash' : mode === 'delivery' ? 'Confirm your delivery' : 'Confirm your pickup'}
          </Text>
          {cash && amount != null ? (
            <Text style={[type(46, 900), { color: c.ink, letterSpacing: -1.8 }, tnum]}>{money(amount)}</Text>
          ) : (
            <Text style={[type(20, 900), { color: c.ink, letterSpacing: -0.5, marginTop: 3 }]}>Scan at handoff</Text>
          )}
        </View>

        <View style={{ width: 208, height: 208, marginTop: 18, backgroundColor: '#fff', borderRadius: radius.hero, padding: 18, borderWidth: 1, borderColor: c.border, ...shadow.hero }}>
          <FauxQR dark="#0E0E10" />
          {stage === 0 && !reduced ? (
            <Animated.View style={{ position: 'absolute', left: 18, right: 18, top: 18, height: 3, borderRadius: 3, backgroundColor: c.primary, transform: [{ translateY }], shadowColor: c.primary, shadowOpacity: 0.6, shadowRadius: 6, elevation: 4 }} />
          ) : null}
        </View>

        <Text style={[type(13.5, 600), { color: c.soft, textAlign: 'center', marginTop: 14, maxWidth: 280, lineHeight: 20 }]}>
          {stage === 0 ? (
            <>Show this to <Text style={{ color: c.ink, fontFamily: type(13.5, 700).fontFamily }}>{cookName}</Text> {cash ? '. They scan it to lock the exact amount.' : `${where}. They scan it to confirm you have the right order.`}</>
          ) : cash ? (
            'Amount matched on both phones. Hand over the cash to complete your order.'
          ) : (
            'Matched on both phones — your order is all yours. Enjoy! 🍽️'
          )}
        </Text>

        <View style={{ marginTop: 22, alignItems: 'center' }}>
          <Text style={[type(12, 800), { color: c.muted, textTransform: 'uppercase' }]}>Backup 6-digit code</Text>
          <View style={{ flexDirection: 'row', gap: 9, marginTop: 10 }}>
            {code.map((d, i) => (
              <View key={i} style={{ width: 44, height: 56, borderRadius: radius.md, backgroundColor: filled ? c.primaryL : c.surface, borderWidth: 1.5, borderColor: filled ? c.primary : c.border, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type(26, 900), { color: filled ? c.primaryD : c.ink }]}>{d}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 }}>
          <Step label="Code shown" state={stage >= 1 ? 'done' : 'on'} n="1" />
          <View style={{ width: 18, height: 2, backgroundColor: c.border }} />
          <Step label="Confirm" state={stage >= 1 ? 'on' : 'off'} n="2" />
        </View>
      </View>

      <Dock column>
        {stage === 0 ? (
          <Btn variant="dark" block lg icon="qr" label={`${cookName} scanned my code`} onPress={() => setStage(1)} />
        ) : (
          <Btn block lg icon="check" label={cash ? `Confirm ${money(amount ?? 0)} paid` : 'Confirm handoff'} onPress={onDone} />
        )}
        <Text style={[type(12, 600), { color: c.muted, textAlign: 'center' }]}>{cash ? 'Only confirm once cash has changed hands.' : 'Confirm once your order is in hand.'}</Text>
      </Dock>
    </>
  );
}

function Step({ label, state, n }: { label: string; state: 'done' | 'on' | 'off'; n: string }) {
  const c = useC();
  const bg = state === 'done' ? c.green : state === 'on' ? c.primary : c.bg2;
  const fg = state === 'off' ? c.muted : '#fff';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        {state === 'done' ? <Icon name="check" size={11} color="#fff" /> : <Text style={[type(11, 900), { color: fg }]}>{n}</Text>}
      </View>
      <Text style={[type(12, 800), { color: state === 'off' ? c.muted : c.ink }]}>{label}</Text>
    </View>
  );
}
