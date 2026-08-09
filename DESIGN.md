---
name: Preppa
description: Real food from real local home cooks — warm, appetite-forward, and premium
colors:
  primary: "#FF5B2E"
  primary-fill: "#D4430D"
  primary-tint: "#FFE4D4"
  accent-text: "#C93F0C"
  ink: "#221E1B"
  ink-soft: "#34302B"
  text-soft: "#6A645E"
  text-muted: "#67615A"
  surface: "#FFFFFF"
  canvas: "#FFFAF6"
  canvas-secondary: "#F8EFE7"
  border: "#EFE2D6"
  border-strong: "#B08E7E"
  premium-plum: "#6B4A93"
  feature-dark: "#1E1A16"
  success: "#127C43"
  error: "#D93A2B"
typography:
  display:
    fontFamily: "Fraunces_600SemiBold, Georgia, serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "HankenGrotesk_700Bold, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "HankenGrotesk_700Bold, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "HankenGrotesk_500Medium, sans-serif"
    fontSize: "14.5px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "HankenGrotesk_700Bold, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.02em"
rounded:
  sm: "10px"
  md: "12px"
  lg: "14px"
  card: "16px"
  xl: "18px"
  sheet: "24px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary-fill}"
    textColor: "#FFFFFF"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "52px"
  button-primary-disabled:
    backgroundColor: "{colors.primary-fill}"
    textColor: "#FFFFFF"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "52px"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "52px"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: "0 22px"
    height: "52px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  search-input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.card}"
    padding: "0 17px"
    height: "54px"
  chip-selected:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
  chip-default:
    backgroundColor: "{colors.canvas-secondary}"
    textColor: "{colors.text-soft}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "8px 14px"
---

# Design System: Preppa

## 1. Overview

**Creative North Star: "The Neighborhood Table"**

Preppa should feel like being invited to eat at someone's home, not like opening a delivery app. Every screen carries two jobs at once — make you want to eat, and make you trust the person cooking for you — and it does both through restraint, not decoration. The palette is warm and appetite-forward (a single deep-tomato accent, never a rainbow of gradients), the canvas is calm and near-white so photography and food carry the color, and the chrome — buttons, cards, type — behaves with Apple-grade quiet confidence: one accent used with intent, generous whitespace, no clutter.

This system explicitly rejects the generic gig-delivery look (rainbow gradients, cluttered promo banners, coupon-code visual noise), corporate-SaaS coldness (this is a food app — even the cook-facing hub screens should feel inviting, not like enterprise software), and the cheap-marketplace feel of an unmoderated listing board. Real money and home-cooked food move through this app on both sides of the marketplace; the design has to earn the trust that requires.

**Key Characteristics:**
- One confident accent (deep tomato-orange), never a rainbow — appetite and identity live in this one color
- Near-white warm canvas, true white surfaces — calm background, color reserved for what matters
- Flat, functional elevation — soft card shadows that lift content off the page, never glassmorphism or heavy depth
- Rounded-rect controls (12–16px), pills reserved for filters/tags/status — not primary buttons or navigation
- One editorial serif (Fraunces) for a small number of hero display moments only; everything else is one confident sans (Hanken Grotesk)

## 2. Colors

The palette is Restrained-to-Committed: tinted warm neutrals carry almost every surface, and one deep-tomato accent does all of the "make you want to eat" work — used for primary actions, prices, and selection states, never as decoration.

### Primary
- **Tomato Mark** (`#FF5B2E`, `colors.primary`): the bright, saturated version of the accent — icon fills, logo mark, tints. **Never used as a fill under white button text** (fails AA at that weight); that job belongs to Primary Fill.
- **Primary Fill** (`#D4430D`, `colors.primary-fill`): the deeper, AA-safe version of the same hue — every solid button, every white-text-on-color surface. White text on this fill clears 4.56:1.
- **Primary Tint** (`#FFE4D4`, `colors.primary-tint`): the palest wash of the accent — selected-state backgrounds, badge fills, icon chips (paired with Primary Fill or ink as the icon/text color, never white).
- **Accent Text** (`#C93F0C`, `colors.accent-text`): a third, distinct calibration of the same hue for body-sized accent text (prices, links, labels) sitting directly on the canvas — deeper than the Mark because canvas contrast is tighter than white-canvas contrast (4.82:1 on the canvas color).

### Secondary
- **Premium Plum** (`#6B4A93`, `colors.premium-plum`): reserved exclusively for PrepPlus (the paid membership) and other explicitly "premium tier" moments. Never used as a general accent — its rarity is what signals "this is the paid thing."

### Neutral
- **Ink** (`#221E1B`, `colors.ink`) / **Ink Soft** (`#34302B`, `colors.ink-soft`): primary and secondary text on any light surface. Near-black, warm-tinted — Apple's own label black (`#1D1D1F`) sits almost on top of this.
- **Text Soft** (`#6A645E`, `colors.text-soft`) / **Text Muted** (`#67615A`, `colors.text-muted`): tertiary text, captions, placeholders — both independently verified ≥4.5:1 against the canvas, never a washed-out "for elegance" gray.
- **Canvas** (`#FFFAF6`, `colors.canvas`): the app background — a whisper of warmth, not a beige wash. **The Whisper Not Wash Rule.** Warmth is carried by imagery, ink, and the accent — the canvas itself should read as "near-white," never "cream."
- **Canvas Secondary** (`#F8EFE7`, `colors.canvas-secondary`): search bars, filter rails, secondary panels — one step warmer than Canvas for layering without a hard border.
- **Surface** (`#FFFFFF`, `colors.surface`): true white — cards, sheets, anything that needs to read as "lifted" above the canvas.
- **Border** (`#EFE2D6`, `colors.border`) / **Border Strong** (`#B08E7E`, `colors.border-strong`): hairline dividers and card edges; Border Strong is reserved for functional boundaries (input outlines) that need ≥3:1 on their own.
- **Feature Dark** (`#1E1A16`, `colors.feature-dark`): a stable near-black surface used for premium/dark cards (e.g. balance strips) — dark in both light and dark mode, an intentional fixed exception to the theme.

### Semantic
- **Success** (`#127C43`, `colors.success`): verified badges, completed states, positive balances.
- **Error** (`#D93A2B`, `colors.error`): destructive actions, error states, validation.

**The One-Accent Rule.** Every screen gets exactly one accent color doing the "pay attention here" work. If a screen needs a second color to feel complete, that's a sign the hierarchy is unclear, not a cue to add a gradient.

## 3. Typography

One family — **Hanken Grotesk** — carries almost the entire app: headings, labels, buttons, body, data. **Fraunces** (a warm humanist serif) appears in exactly one role: a handful of hero display moments (e.g. a home-screen greeting), never body or UI. **The Serif Is a Guest Rule.** If Fraunces starts showing up in buttons, labels, or repeating list rows, it's been invited to overstay.

- **Display** (Fraunces 600, 28px, -0.01em): the rare editorial hero line.
- **Headline** (Hanken 700, 23px, -0.02em): screen titles, primary section headers.
- **Title** (Hanken 700, 16px, -0.01em): card titles, button labels, list-row primary text.
- **Body** (Hanken 500, 14.5px): descriptions, secondary content, form values.
- **Label** (Hanken 700, 12px, +0.02em uppercase where used): badges, section eyebrows, status chips — used sparingly, not as a scaffold on every section.

Weight caps at 700 everywhere — there is no 800/900 "black" weight in the live system; anything that visually reads as extra-bold is 700 at a larger size, not a heavier cut.

## 4. Elevation

Flat by default, with soft functional shadows — never glassmorphism, never a heavy "floating card" look. **The Lift Not Float Rule.** A shadow's job is to say "this is a separate surface," not to make the UI feel like it's hovering.

- **Card** (`shadowOpacity 0.05, radius 10, y 2`): the default for any card, list row, or panel that needs to read as distinct from the canvas.
- **Soft** (`shadowOpacity 0.06, radius 6, y 3`): buttons and small interactive elements — barely-there lift.
- **Hero** (`shadowOpacity 0.12, radius 20, y 10`): rare, reserved for a hero avatar or a genuinely featured element — the strongest shadow in the system, used sparingly enough that it still reads as "special" when it appears.

## 5. Components

### Buttons
Rounded-rect (12px), never pill-shaped — pills are reserved for filters and status chips, so a pill-shaped button would read as a tag, not an action. Three variants, one accent:
- **Primary** (`button-primary`): Primary Fill background, white text — every primary action (checkout, subscribe, confirm).
- **Dark** (`button-dark`): ink-colored fill, white text — a secondary-but-serious action (e.g. "Manage kitchen").
- **Ghost** (`button-ghost`): white surface, ink text, no fill — the lowest-emphasis affirmative action, sitting next to a Primary button rather than replacing it.

**The Fill Is Never Decorative Rule.** A solid color fill always means "this is the one thing to do here." If two buttons on one screen both use Primary Fill, the hierarchy is broken.

### Cards
White surface, 1px Border hairline, 16px radius, Card-level shadow. No nested cards — a card inside a card is always a sign the layout needs a section header instead.

### Search / Text Input
White or Canvas Secondary fill, 16px radius, Text Muted placeholder (verified ≥4.5:1 — placeholder text gets the same contrast floor as real text, not a lighter default).

### Chips / Pills
999px radius, used for filters, cuisine tags, and status labels — never for primary navigation or buttons. Selected state fills with the bright Tomato Mark and white text; unselected sits on Canvas Secondary with Text Soft.

## 6. Do's and Don'ts

**Do:**
- Use exactly one accent per screen, and let Primary Fill (not Primary) carry any white-text button.
- Let photography and real food carry the "appetite" work on screens with imagery; let color carry it where there's no photo.
- Keep buttons rounded-rect and reserve pill shapes for filters/tags/status.
- Verify every new fill/text color pair against a real WCAG contrast calculation before shipping — not by eye. (This system has already caught one real AA failure this way; assume the next one is out there too.)

**Don't:**
- Don't add a second saturated color to "balance" a screen — that's the generic gig-delivery instinct (rainbow gradients, promo-banner clutter) this system explicitly rejects.
- Don't use Premium Plum outside PrepPlus / premium-tier moments — its rarity is the point.
- Don't let Fraunces (the display serif) appear in buttons, labels, or repeating list rows.
- Don't build glassmorphism, heavy elevation, or "floating" card treatments — the system is flat-with-soft-lift by design.
- Don't ship a muted-gray body or placeholder color "for elegance" — if contrast is even close to the 4.5:1 floor, move it toward ink.
- Don't reskin per platform. One design language across iOS, Android, and web — a screen shouldn't feel like "a different app" depending on where it's running.
