# Sentinel — Lessons Learned

Electron shell. Things worth not rediscovering.

---

## A rename is a migration until proven otherwise

Product renames read as cosmetic and are not. In Electron specifically, the app's
display name and its *storage identity* are the same string by default, so the
naive rebrand silently relocates user data. Before changing any name, enumerate
which identifiers derive from it:

- `app.getName()` ← `package.json` `productName ?? name` → `app.getPath("userData")`
- `appId` → NSIS uninstall registry key, electron-updater identity, macOS bundle id
- `publish` block → the update feed URL existing installs already poll
- `productName` (electron-builder) → exe filename, installer filename, shortcuts,
  macOS `CFBundleName`. Safe to change; does **not** move userData.

Rule of thumb: **labels are free to change; anything an already-installed copy uses
to find itself, its data, or its updates is frozen.**

## Verify platform behaviour with a throwaway harness, don't reason about it

The `package.json` `productName` → `userData` relationship took ~20 seconds to prove
with a 6-line Electron script in the scratchpad. Reasoning about Electron's name
resolution from memory would have been a coin flip. When a claim about runtime
behaviour is load-bearing for customer data, run it.

## electron-builder's config schema is strict

`additionalProperties: false` at the top level. No comment keys. Validate config
changes without a full build:

```js
require("app-builder-lib/out/util/config/config").getConfig(process.cwd(), null, null)
```

## `which convert` on Windows is a false positive

`C:\Windows\system32\convert.exe` is the NTFS conversion utility. Finding it does
not mean ImageMagick is installed. Check `magick -version` instead.

## The renderer can override shell-set window titles

`BrowserWindow({ title })` is only the title *until the loaded page declares a
`<title>`*. Since this app loads its UI over `http://127.0.0.1:<port>/`, the real
window title comes from `client/index.html`. Setting it in `main.js` alone is not
sufficient — coordinate with whoever owns the client, or intercept
`page-title-updated`.
