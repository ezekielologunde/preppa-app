# Preppa — Launch accounts tracker (Track 0)

The founder-blocked prerequisites for shipping. These gate the native builds + store submission
and have real lead times, so they run **in parallel** with the build work. Store submission itself
happens later (after the first real transaction), but the accounts should be started now.

**Status legend:** ☐ Not started · ◐ In progress / pending review · ☑ Done

| # | Account | Status | Cost | Unblocks | Where |
|---|---------|:------:|------|----------|-------|
| 1 | **Stripe** live activation | ☐ | Free (business verification) | Real charges + **payouts to cooks** | Stripe Dashboard → *Activate account* |
| 2 | **Apple** Developer Program | ☐ | $99 / yr | iOS build + App Store Connect | developer.apple.com/programs/enroll |
| 3 | **Google Play** Console | ☐ | $25 one-time | Android submission | play.google.com/console/signup |
| 4 | **Expo** account | ☐ | Free | `eas init` + native EAS builds | expo.dev/signup |
| 5 | **Legal pages** on preppa.live | ☐ | Free (landing project) | Store compliance: privacy, terms, **account-deletion URL** | Vercel landing project |

## Recommended order & why
1. **Stripe first** — business verification has the **longest lead time**, and without it the cook
   can't receive a real payout (the whole point of the first transaction). Start today even though
   we stay in test mode for weeks.
2. **Apple** next — enrollment approval can take 24–48h.
3. **Google Play** — quick, but do it early so it's not a last-minute blocker.
4. **Expo** — 2 minutes; I need it to run `eas init` and kick off the first native build.
5. **Legal pages** — I'll draft the three pages (privacy, terms, deletion); you host them on the
   landing project. Needed before either store will accept the app.

## Reference (already done, no action needed)
- App bundle identifier (iOS + Android): **`live.preppa.app`** — permanent once submitted; flag now if you want it changed.
- `eas.json` build/submit profiles: scaffolded.

## Notes / IDs (fill in as you go)
- Apple Team ID: _____
- App Store Connect app created: ☐
- Google Play app created: ☐
- Expo account / org: _____
- Stripe activation status: _____

---
*Tell me when any of these move and I'll update the status here. "Starting" ≠ "submitting" — we
don't submit to the stores until the first real transaction is proven.*
