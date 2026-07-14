# Preppa Redesign — Direction Brief: "Warm Trust"

**Status:** DRAFT for council review · 2026-07-14
**Reference target:** Airbnb-style trust & warmth (chosen by user)
**Scope:** Whole app, phased into shippable slices
**Identity mandate:** Open to a new palette. Evolve the brand, don't preserve it verbatim.

---

## 1. The shift in one sentence

From a **vibrant, gradient-saturated, orange-forward "energetic delivery app"** to a **calm, photography-led, single-accent "trusted home-cook marketplace"** — where warmth is carried by real imagery, generous whitespace, and confident type, not by gradients and neon.

## 2. What the current app does (the "before")

- **Gradients everywhere** — `GRAD.g1–g8`, `GradBox`, `GradAvatar`; every cook avatar, hero wash, and premium card is a gradient.
- **Bold-black type reflex** — `type(29, 900)`, `type(14, 900)`; Inter Black used for cook names, prices, section heads. Only weights 600–900 are loaded.
- **Pill everything** — `radius.pill` on every button (a strong "energetic" tell; Airbnb uses rounded-rect).
- **Orange glow shadow** — `shadow.brand` (coloured orange drop shadow) on primary buttons.
- **Two co-brand hues** — orange `#F26B1D` + purple `#7C3AED` both used decoratively and structurally.

None of this is *broken* — it's well-crafted. It's just a different genre than the target.

## 3. The target language ("after")

### 3.1 Color — strategy: **Restrained** (one accent, neutral canvas, warmth via imagery)

> Anti-trap note: Airbnb warmth must **not** become a cream/beige body background (the saturated AI default). The canvas stays a true near-white; warmth lives in the accent, the photography, and the type.

**Light**
| Role | Hex | OKLCH (approx) | Notes |
|---|---|---|---|
| `bg` (app canvas) | `#FAFAF9` | 0.985 / 0.003 / 70 | whisper-warm, reads white — NOT beige |
| `surface` | `#FFFFFF` | 1 / 0 / 0 | cards, sheets |
| `bg2` (inset) | `#F3F1EE` | 0.96 / 0.005 / 70 | segmented tracks, chips |
| `ink` | `#221E1B` | 0.24 / 0.01 / 60 | warm charcoal, primary text |
| `soft` | `#6A645E` | 0.52 / 0.01 / 60 | secondary text — verify ≥4.5:1 |
| `muted` | `#736D66` | 0.55 / 0.01 / 60 | tertiary / placeholder — verify ≥4.5:1 |
| `border` | `#EAE6E1` | 0.93 / 0.005 / 70 | hairline |
| **`primary`** (accent) | `#E5533A` | 0.63 / 0.17 / 35 | warm persimmon-coral — appetite + warmth, calmer than neon `#F26B1D` |
| `primaryD` | `#BE3F22` | 0.52 / 0.16 / 35 | accessible accent text on white (≥4.5:1) |
| `primaryL` | `#FCEDE8` | 0.95 / 0.03 / 40 | accent tint background |
| `plum` (premium only) | `#6B4A93` | 0.46 / 0.13 / 310 | reserved for PrepPlus/membership — replaces decorative purple |
| `green` | `#1F9D57` | trust/verified | keep semantic |
| `red` | `#D93A2B` | error | keep semantic |
| `star` | `#E0A020` | ratings | keep semantic |

**Dark** — refined warm-charcoal (evolve current, keep the warm near-black): `bg #15120F`, `surface #201C17`, `ink #F4EFE8`, accent unchanged `#E5533A`.

Gradients: **retired from default UI.** `GradBox` survives only as the image-loading fallback (flat tint, not rainbow). Cook avatars → flat warm-neutral chips with initials, or (better) real photos.

### 3.2 Typography — one warm humanist sans, full weight range

- **Recommendation:** move from Inter (neutral, currently 600–900 only) to a **warmer humanist geometric sans** loaded at **400 / 500 / 600 / 700** (+ 800 for rare hero). Candidates: **Plus Jakarta Sans**, **Hanken Grotesk**, **Onest**. This single change de-shouts the whole app.
- **Kill the 900-black reflex.** Headings → 600/700, not 900. Body → 400/500. Prices/labels → 600.
- Calmer scale: hero heading ~28–32 semibold (not 900), tighter step ratio (~1.2).
- Rationale for one family: product register — a well-tuned sans carries headings, labels, body, data. Warmth comes from the humanist letterforms + weight discipline, not a display face.
- *(Fallback if font swap is deemed too risky for slice 1: stay on Inter, add 400/500, cap headings at 700. Still a large calming win.)*

### 3.3 Shape & elevation

- **Buttons: rounded-rect, not pill.** `radius` ~12–14. (Signature Airbnb move.)
- Cards ~16, sheets ~20–24, inputs ~12.
- **Retire `shadow.brand`** (orange glow). Elevation = soft neutral shadow + hairline border. Airbnb leans on borders + very subtle shadows.

### 3.4 Layout & imagery

- **Photography leads.** Meal/cook/kitchen cards open with a real image; chrome recedes. Less gradient, more air.
- Generous whitespace; increase section spacing and card padding.
- Keep the responsive `maxWidth` centering already in place.

### 3.5 Motion

- Calm, state-conveying: 150–250ms, ease-out. Keep press-scale but subtler (0.98). No orange-glow pulse. Respect existing `useReducedMotion`.

## 4. Constraints (non-negotiable)

- **Contrast:** body ≥4.5:1, large ≥3:1, placeholders ≥4.5:1 — verified by screenshot, both themes.
- **Light + dark parity** — every token defined in both; dark stays warm-charcoal.
- **RN/Expo reality** — Expo SDK 57, expo-router, `type()` + `useC()` token system stays the API; we change values/components behind it, not the call sites where avoidable.
- **No regressions** — 50 screens consume these tokens; changes propagate through the central theme, so foundation changes must be safe app-wide.

## 5. Phasing (shippable slices)

- **Slice 0 — Foundation:** new tokens (`theme.ts`), font weights, retire gradients/brand-glow, restyle core primitives (`Btn`, `IconBtn`, `Stepper`, cards, avatars). Everything inherits.
- **Slice 1 — Home (flagship proof):** redesign `(tabs)/home.tsx` end-to-end on the new foundation. This is the sign-off gate.
- **Slice 2 — Discover / Store / Meal detail** (the shopper's core).
- **Slice 3 — Cart / Checkout / Orders / Track.**
- **Slice 4 — Feed + Experiences.**
- **Slice 5 — Messages, Profile, PrepPlus, Rewards.**
- **Slice 6 — Prepper Hub + Admin.**
- Each slice: build → screenshot both themes → audit contrast/a11y → sign-off → next.

## 6. Open questions for the council

1. Font: swap to a warm humanist sans (Plus Jakarta / Hanken / Onest) or stay on Inter + add light weights? Trade-off: distinctiveness vs. risk/bundle.
2. Accent value: is `#E5533A` the right "warm trust" coral, or hold closer to the equity in `#F26B1D`?
3. Purple → plum-reserved-for-premium: does removing purple as a co-brand lose meaningful identity?
4. Any slice-0 change that risks app-wide breakage we should de-risk first?
