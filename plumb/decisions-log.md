# Plumb — Decisions Log

Newest first. Each entry: what was decided, why, what it rules out.

---

## 2026-08-17 — Site Sparrow rebrand: client palette, tokens, logo

**Context:** Full display-name rebrand from "Simple Scheduler" to "Site Sparrow". New
identity is a warm vivid orange bird + near-black charcoal on white. Final artwork and
exact swatches not yet available.

### D-1 — Brand colours live as CSS custom properties, Tailwind only maps them
`client/src/index.css` holds RGB channel triplets; `tailwind.config.js` generates the
utility scales from them via `rgb(var(--token) / <alpha-value>)`.
**Why:** the swatches are provisional. This makes the final lock-in a three-line edit
instead of a find-and-replace across a 93KB component. Channel triplets (not hex) because
Tailwind opacity modifiers (`bg-ink-900/30`, already used) need them.
**Rules out:** hex literals in components. There are now zero in `App.jsx`.

### D-2 — Replaced Tailwind `slate` wholesale with a warm `ink` ramp
~250 `slate-*` usages became `ink-*`, hue-matched to `#262322`.
**Why:** `slate-900`/`slate-800` *were* the old navy being retired, and slate is
blue-tinted throughout. Swapping only the dark end would leave cool grays under a warm
charcoal and vivid orange — exactly the mixed palette the rebrand was meant to remove.
**Cost named:** it's a large mechanical diff. Accepted because it's fully mechanical and
the ramp is now retunable from one file.

### D-3 — Brand orange is an accent, not the UI's working colour
Primary buttons are `ink-900` (charcoal), not orange. Orange is reserved for links, job
chips, the focus ring, and the mark.
**Why (two reasons):** (a) the app's existing primary buttons were already charcoal —
the one teal button was the inconsistency, so unifying removed a colour rather than adding
one; (b) `#E8622D` is 3.4:1 against white in both directions, so it fails small-text
contrast as a button fill. `sparrow-700` is the accessible text-weight orange.

### D-4 — Update-ready badge went neutral; entry-type icons went neutral
The "Update ready · Restart" badge (was teal) sat directly beside the amber trial-expiry
badge in the top bar. Orange next to amber reads as a near-miss, not a distinction, so the
badge is now `ink`. Same reasoning for the job/email/note icons in the activity list —
the glyphs already distinguish them, so the three hues were decoration.
**Principle:** if colour duplicates information the shape already carries, drop the colour.
That keeps amber meaning "needs attention" instead of "also warm".

### D-5 — Logo component loads external artwork, never inlines it
`Logo.jsx` renders `<img>` from `/brand/site-sparrow-logo.svg` (lockup) or
`/brand/site-sparrow-mark.svg` (mark), with `onError` → plain `sparrow-500` rounded square.
**Why:** the artwork doesn't exist yet and I won't approximate a bird from a description —
a wrong bird shipped is worse than no bird, and it'd have to be undone anyway. External
files also mean the designer drops in final art with no code change.

### D-6 — Brand mark stays out of the persistent top bar
It appears at onboarding, the license gate, and in About only.
**Why:** the top bar carries the *user's* business name and colour dot. On a tool a
tradesperson has open all day, our logo there is permanent rent-free space taken from their
identity for no functional gain. Rams: it doesn't earn its place.
**Rules out:** a "small header badge" usage, even though the component supports it.

### D-7 — Favicon points at the new (not-yet-existing) SVG rather than the old PNG
`client/public/favicon.png` is binary art of the retired teal calendar mark. Left on disk
(not mine to delete) but unlinked.
**Why:** a missing icon is neutral; a stale icon is a false statement about what the
product is. In Electron the window icon comes from the packaged build anyway, so the
visible cost until art lands is ~zero.
**Tradeoff named:** between the rebrand landing and the art landing, dev/browser shows the
default icon.

### D-8 — Internal identifiers not renamed
`simple-scheduler-active-business-id` (localStorage) and `simple-scheduler-client`
(npm package name) keep the old string; comment added at the localStorage key.
**Why:** renaming the storage key silently resets every existing user's selected business
on upgrade. That's a data-continuity cost for zero user-visible benefit.
The `.xlsx` export filename *was* renamed (`site-sparrow-export-YYYY-MM-DD.xlsx`) because
the user actually sees that one, in their own file system.
