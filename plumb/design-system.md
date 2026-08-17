# Site Sparrow — Design System

Living reference for the visual/interaction language across surfaces.
Today: Electron + React desktop client (`client/`). Planned: React Native companion.

**Status: brand colours are PROVISIONAL** (derived from a description of the logo, not
final artwork). Everything below is wired so the final swatches are a three-line edit.

---

## 1. Colour

### Source of truth
`client/src/index.css` `:root` — RGB channel triplets.
`client/tailwind.config.js` only *maps* those vars onto utility names. **Never hardcode a
brand hex in a component.** There are currently zero hex literals in `client/src/App.jsx`;
keep it that way.

Opacity modifiers work (`bg-ink-900/30`) because tokens are channel triplets consumed as
`rgb(var(--token) / <alpha-value>)`.

### Anchors (the three values that change when final art lands)

| Token | Provisional | Role |
|---|---|---|
| `--sparrow-500` | `#E8622D` | Brand orange. The bird. |
| `--ink-900` | `#262322` | Brand charcoal. Primary text, primary buttons. |
| `--sparrow-white` | `#FFFFFF` | Paper. Use Tailwind's `white` in markup — no alias, it'd be ceremony. |

### Ramps
- **`sparrow-50…950`** — orange. Identity + interactive accent only.
- **`ink-50…950`** — warm neutral, hue-matched to the charcoal. Replaced Tailwind `slate`
  entirely (slate is cool/blue-tinted and visibly fights a warm charcoal).

### Where each colour is allowed
| Use | Token |
|---|---|
| App canvas | `ink-50` |
| Window chrome / tab strip | `ink-100`, inactive tab `ink-200`, hover `ink-50` |
| Cards, active tab | `white` |
| Borders, dividers | `ink-200` / `ink-300` |
| Body text | `ink-800` / `ink-900` |
| Secondary text | `ink-500` (4.9:1 on white) |
| Icons, placeholders, de-emphasised meta | `ink-400` |
| **Primary button** | `bg-ink-900 text-white`, hover `ink-800` |
| Links / inline accents | `sparrow-700` (6.0:1 on white) |
| Job chips on the calendar | `bg-sparrow-50 border-l-2 border-sparrow-500 text-sparrow-800` |
| Focus ring | `sparrow-500`, 2px, 2px offset (global in `index.css`) |
| Warning / attention | `amber-*` (Tailwind default, kept) |
| Destructive / error | `rose-*` (Tailwind default, kept) |

### Contrast rules that are not negotiable
- **`sparrow-500` is 3.4:1 against white in both directions.** It is a *fill and mark*
  colour. Never small text on white, never white small text on it. For an orange button
  with a text label, use `sparrow-700`.
- `ink-400` is ~2.7:1 — icons and decoration only, never the only carrier of meaning.
- Every interactive element gets a visible `:focus-visible` ring. The global rule in
  `index.css` covers it; don't remove it locally without an equal replacement.

### Colour carries no information on its own
Activity-list entry types (job / email / note) were three different icon hues. The glyph
already distinguishes them, so the colour was decoration — all three are now `ink-400`.
Apply the same test before introducing any new hue.

---

## 2. Brand mark

Component: `client/src/Logo.jsx`. It does **not** inline SVG — it loads artwork from
`client/public/brand/`:

| File | Prop | Shape |
|---|---|---|
| `client/public/brand/site-sparrow-logo.svg` | `variant="lockup"` (default) | bird + wordmark, natural aspect |
| `client/public/brand/site-sparrow-mark.svg` | `variant="mark"` | bird only, square |

`size` = rendered **height** in px. Lockup width is auto; mark is square.
If the file is missing, it falls back to a plain `sparrow-500` rounded square at the same
footprint — deliberately not a stand-in bird drawing.
Pass `alt=""` when the mark sits next to a visible "Site Sparrow" text label.

### Where the mark appears (and where it deliberately doesn't)
- Onboarding welcome card — lockup, 32px.
- License / trial-expired gate — lockup, 24px.
- About panel — mark, 20px, beside the version line.
- **Not in the top bar.** The top bar belongs to the *user's business* name and colour dot.
  Putting our logo there competes with their identity for permanent screen space on a tool
  they use all day. The brand earns attention at first run and in About, not constantly.

---

## 3. Naming

User-facing name is **Site Sparrow** everywhere. Internal identifiers (electron-builder
appId, repo name, the `simple-scheduler-active-business-id` localStorage key, the
`simple-scheduler-client` npm package name) intentionally keep the old string — renaming
them either breaks users' saved state or is Sentinel's call, not a design one.

---

## 4. Cross-platform note (React Native, when it starts)

Tokens above are platform-neutral values, not Tailwind classes — port the ramps as a JS
theme object with identical names (`sparrow.500`, `ink.900`) so both codebases speak the
same vocabulary. Do **not** port the desktop chrome (tab strip, hover states) — mobile gets
native navigation. Same language, different execution.
